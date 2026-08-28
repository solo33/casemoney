import { useCallback, useEffect, useRef, useState } from "react";
import { BrandProgress } from "./BrandProgress";
import {
  listOfflineMutations,
  OFFLINE_QUEUE_EVENT,
  syncOfflineMutations,
} from "../services/offlineMutations";
import { TX_ADDED_EVENT } from "./QuickAddFab";
import { markSyncSuccessful, SYNC_REQUEST_EVENT } from "../services/syncStatus";

export default function OfflineSyncStatus() {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const syncInFlight = useRef(false);

  const refresh = useCallback(async () => {
    const items = await listOfflineMutations();
    setPending(items.length);
    setFailed(items.some(item => item.status === "failed"));
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
  return (
    <button
      type="button"
      className="offline-sync-status"
      onClick={sync}
      disabled={syncing || !isOnline}
      title={isOnline
        ? "Локальные изменения автоматически отправятся после восстановления связи"
        : "Нет сети: сохранённые данные доступны на устройстве"}
    >
      {syncing && <BrandProgress label="" size={20} />}
      <span>
        {!isOnline
          ? pending
            ? `${pending} изменений ждут сеть`
            : "Нет сети · данные на устройстве"
          : syncing
          ? "Синхронизируем изменения…"
          : failed
            ? `${pending} изменений требуют внимания`
            : `${pending} изменений сохранено на устройстве`}
      </span>
    </button>
  );
}
