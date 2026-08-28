import api, { isRetryableServiceError } from "../api/client";

const DB_NAME = "casemoney-local-changes";
const STORE_NAME = "mutations";
const DB_VERSION = 1;

export const OFFLINE_QUEUE_EVENT = "casemoney:offline-queue-changed";
export const LOCAL_TRANSACTION_EVENT = "casemoney:local-transaction-created";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runStore(mode, action) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  }));
}

function currentUserId() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    let payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    payload += "=".repeat((4 - (payload.length % 4)) % 4);
    return String(JSON.parse(atob(payload)).sub);
  } catch {
    return null;
  }
}

function publishQueueChanged(detail = {}) {
  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT, { detail }));
}

export async function listOfflineMutations() {
  const all = await runStore("readonly", store => store.getAll());
  const userId = currentUserId();
  return all
    .filter(item => item.userId === userId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listPendingTransactions(date) {
  const mutations = await listOfflineMutations();
  return mutations
    .filter(item => item.kind === "transaction" && String(item.data.date || item.createdAt).slice(0, 10) === date)
    .map(item => ({
      ...item.data,
      id: `local:${item.id}`,
      date: item.data.date || item.createdAt,
      pending_sync: true,
      offline_mutation_id: item.id,
      sync_error: item.error || null,
    }));
}

export async function removeOfflineMutation(id) {
  await runStore("readwrite", store => store.delete(id));
  publishQueueChanged({ removedId: id });
}

export async function retryOfflineMutation(id) {
  const mutation = await runStore("readonly", store => store.get(id));
  if (!mutation) return null;
  const next = { ...mutation, status: "pending", error: null };
  await saveMutation(next);
  return next;
}

async function saveMutation(mutation) {
  await runStore("readwrite", store => store.put(mutation));
  publishQueueChanged({ queued: mutation });
  return mutation;
}

export async function submitOrQueueTransaction(payload, idempotencyKey) {
  if (navigator.onLine === false) {
    return queueTransaction(payload, idempotencyKey);
  }

  try {
    const response = await api.post("/api/transactions/", payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    });
    return { queued: false, transaction: response.data };
  } catch (error) {
    if (!isRetryableServiceError(error)) throw error;

    return queueTransaction(payload, idempotencyKey);
  }
}

async function queueTransaction(payload, idempotencyKey) {
  const userId = currentUserId();
  if (!userId) throw new Error("Не удалось определить пользователя для локального сохранения");
  const id = idempotencyKey;
  const mutation = await saveMutation({
    id,
    userId,
    method: "post",
    url: "/api/transactions/",
    data: payload,
    headers: { "Idempotency-Key": idempotencyKey },
    createdAt: new Date().toISOString(),
    status: "pending",
    kind: "transaction",
  });
  const localTransaction = {
    ...payload,
    id: `local:${id}`,
    date: payload.date || mutation.createdAt,
    pending_sync: true,
    offline_mutation_id: id,
  };
  window.dispatchEvent(new CustomEvent(LOCAL_TRANSACTION_EVENT, {
    detail: { transaction: localTransaction },
  }));
  return { queued: true, transaction: localTransaction };
}

export async function syncOfflineMutations() {
  if (!navigator.onLine) return { synced: 0, pending: (await listOfflineMutations()).length };
  const mutations = await listOfflineMutations();
  let synced = 0;

  for (const mutation of mutations) {
    // Ошибочные изменения ждут явного решения пользователя. Иначе фоновая
    // синхронизация будет бесконечно повторять конфликтный запрос.
    if (mutation.status === "failed") continue;
    try {
      await api.request({
        method: mutation.method,
        url: mutation.url,
        data: mutation.data,
        headers: mutation.headers,
        skipGlobalProgress: true,
      });
      await removeOfflineMutation(mutation.id);
      synced += 1;
    } catch (error) {
      if (isRetryableServiceError(error)) break;
      await saveMutation({
        ...mutation,
        status: "failed",
        error: error.response?.data?.detail || "Не удалось синхронизировать изменение",
      });
    }
  }

  const pending = (await listOfflineMutations()).length;
  publishQueueChanged({ synced, pending });
  return { synced, pending };
}
