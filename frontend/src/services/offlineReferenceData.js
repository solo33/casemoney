const CACHE_VERSION = 1;
const CACHE_PREFIX = `casemoney:reference-data:v${CACHE_VERSION}`;

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

function cacheKey() {
  const userId = currentUserId();
  return userId ? `${CACHE_PREFIX}:${userId}` : null;
}

export function readReferenceData() {
  const key = cacheKey();
  if (!key) return null;
  try {
    return JSON.parse(localStorage.getItem(key)) || null;
  } catch {
    return null;
  }
}

export function saveReferenceData(patch) {
  const key = cacheKey();
  if (!key) return;
  const previous = readReferenceData() || {};
  try {
    localStorage.setItem(key, JSON.stringify({
      ...previous,
      ...patch,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Переполнение или запрет localStorage не должны ломать работу онлайн.
  }
}

export function cachedAccountsAndCategories() {
  const cached = readReferenceData();
  if (!cached) return null;
  return {
    accountGroups: Array.isArray(cached.accountGroups) ? cached.accountGroups : [],
    categories: Array.isArray(cached.categories) ? cached.categories : [],
  };
}

export function cachedUserData() {
  const cached = readReferenceData();
  return cached?.user || null;
}
