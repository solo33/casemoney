import { useCallback, useEffect, useState } from "react";
import api from "../api/client";


export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api.get("/api/notifications/", {
        params: { limit: 50 },
        skipGlobalProgress: true,
      });
      setItems(response.data.items || []);
      setUnreadCount(response.data.unread_count || 0);
    } catch {
      // Уведомления не должны мешать работе остальных разделов.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const markRead = async (item) => {
    if (item.read_at) return;
    setItems(current => current.map(entry => (
      entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry
    )));
    setUnreadCount(current => Math.max(0, current - 1));
    try {
      await api.patch(`/api/notifications/${item.id}/read`, null, { skipGlobalProgress: true });
    } catch {
      load();
    }
  };

  const markAllRead = async () => {
    setItems(current => current.map(item => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await api.post("/api/notifications/read-all", null, { skipGlobalProgress: true });
    } catch {
      load();
    }
  };

  const openLink = async (event, item) => {
    event.preventDefault();
    await markRead(item);
    window.location.assign(item.link);
  };

  return (
    <div className="notification-bell-wrap">
      <button
        type="button"
        className="notification-bell"
        aria-label={`Уведомления${unreadCount ? `: ${unreadCount} непрочитанных` : ""}`}
        aria-expanded={open}
        onClick={() => {
          setOpen(value => !value);
          if (!open) {
            setLoading(true);
            load().finally(() => setLoading(false));
          }
        }}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && <b>{unreadCount > 99 ? "99+" : unreadCount}</b>}
      </button>

      {open && (
        <>
          <button className="notification-backdrop" aria-label="Закрыть уведомления" onClick={() => setOpen(false)} />
          <section className="notification-panel" aria-label="Уведомления">
            <header>
              <strong>Уведомления</strong>
              {unreadCount > 0 && <button type="button" onClick={markAllRead}>Прочитать все</button>}
            </header>
            <div className="notification-list">
              {loading && items.length === 0 ? (
                <p className="notification-empty">Загрузка...</p>
              ) : items.length === 0 ? (
                <p className="notification-empty">Новых сообщений нет</p>
              ) : items.map(item => (
                <article key={item.id} className={item.read_at ? "is-read" : "is-unread"}>
                  <button type="button" className="notification-content" onClick={() => markRead(item)}>
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                    <small>{new Date(item.created_at).toLocaleString("ru-RU")}</small>
                  </button>
                  {item.link && (
                    <a href={item.link} onClick={event => openLink(event, item)}>
                      Перейти →
                    </a>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
