import { useCallback, useEffect, useRef, useState } from "react";
import { BrandProgress } from "./BrandProgress";
import {
  listOfflineMutations,
  OFFLINE_QUEUE_EVENT,
  removeOfflineMutation,
  retryOfflineMutation,
  syncOfflineMutations,
} from "../services/offlineMutations";
import { TX_ADDED_EVENT } from "./QuickAddFab";
import { markSyncSuccessful, SYNC_REQUEST_EVENT } from "../services/syncStatus";

export default function OfflineSyncStatus() {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failedItems, setFailedItems] = useState([]);
  const [showDetails, setShowDetails] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const syncInFlight = useRef(false);

  const refresh = useCallback(async () => {
    const items = await listOfflineMutations();
    setPending(items.length);
    setFailed(items.some(item => item.status === "failed"));
    setFailedItems(items.filter(item => item.status === "failed"));
  }, []);

  const sync = useCallback(async () => {
    if (syncInFlight.current) return;
    if (!navigator.onLine) {
      await refresh();
      return;
    }
    syncInFlight.current = true;
    setSyncing(true);
    try {
      const result = await syncOfflineMutations();
      if (result.synced > 0) {
        markSyncSuccessful();
        window.dispatchEvent(new CustomEvent(TX_ADDED_EVENT));
      }
      await refresh();
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
    }
  }, [refresh]);

  const retryFailed = useCallback(async (id) => {
    await retryOfflineMutation(id);
    await refresh();
    await sync();
  }, [refresh, sync]);

  const discardFailed = useCallback(async (id) => {
    await removeOfflineMutation(id);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
    sync();
    const onQueue = () => refresh();
    const onOnline = () => {
      setIsOnline(true);
      sync();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener(OFFLINE_QUEUE_EVENT, onQueue);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(SYNC_REQUEST_EVENT, sync);
    const timer = window.setInterval(sync, 30000);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_EVENT, onQueue);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(SYNC_REQUEST_EVENT, sync);
      window.clearInterval(timer);
    };
  }, [refresh, sync]);

  if (!pending && !syncing && isOnline) return null;
  const statusText = !isOnline
    ? pending ? `${pending} изменений ждут сеть` : "Нет сети · данные на устройстве"
    : syncing ? "Синхронизируем изменения…"
    : failed ? `${failedItems.length} изменений требуют внимания`
    : `${pending} изменений сохранено на устройстве`;

  return (
    <div className="offline-sync-wrap">
      <button
        type="button"
        className="offline-sync-status"
        onClick={failed ? () => setShowDetails(value => !value) : sync}
        disabled={syncing || (!isOnline && !failed)}
        title={failed
          ? "Открыть локальные изменения, которые не удалось отправить"
          : isOnline
            ? "Локальные изменения автоматически отправятся после восстановления связи"
            : "Нет сети: сохранённые данные доступны на устройстве"}
      >
        {syncing && <BrandProgress label="" size={20} />}
        <span>{statusText}</span>
      </button>
      {failed && showDetails && (
        <section className="offline-sync-conflicts" aria-label="Локальные изменения, требующие решения">
          <strong>Проверьте локальные изменения</strong>
          <p>Сервер их не подтвердил. Они останутся на устройстве, пока вы не повторите отправку или не удалите копию.</p>
          {failedItems.map(item => (
            <article key={item.id}>
              <b>{item.kind === "transaction" ? "Операция" : "Изменение"}</b>
              <span>{item.error || "Не удалось синхронизировать изменение"}</span>
              <div>
                <button type="button" onClick={() => retryFailed(item.id)} disabled={!isOnline}>Повторить</button>
                <button type="button" className="btn-ghost" onClick={() => discardFailed(item.id)}>Удалить копию</button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
