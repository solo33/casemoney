export const LAST_SUCCESSFUL_SYNC_KEY = "casemoney:last-successful-sync";
export const SYNC_STATUS_EVENT = "casemoney:sync-status";
export const SYNC_REQUEST_EVENT = "casemoney:request-sync";

export function getLastSuccessfulSync() {
  return localStorage.getItem(LAST_SUCCESSFUL_SYNC_KEY);
}

export function markSyncSuccessful(value = new Date().toISOString()) {
  localStorage.setItem(LAST_SUCCESSFUL_SYNC_KEY, value);
  window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, {
    detail: { lastSuccessfulSync: value },
  }));
  // Совместимость с уже опубликованной навигацией.
  window.dispatchEvent(new CustomEvent("casemoney:last-successful-sync", { detail: value }));
  return value;
}

export function requestSync() {
  window.dispatchEvent(new CustomEvent(SYNC_REQUEST_EVENT));
}
