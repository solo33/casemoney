
import { useState, useCallback, useEffect } from "react";

import api from "../api/client";

import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { ACTION_COLOR, ACTION_FILTERS } from "../utils/historyView";
import { Row } from "../components/history/HistoryParts";

export default function History() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(100);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = { limit, offset: 0 };
    if (q.trim()) params.q = q.trim();
    if (action) params.action = action;
    api.get("/api/transactions/history", { params })
      .then(r => { setItems(r.data.items); setTotal(r.data.total); })
      .catch(() => setError("Ошибка загрузки истории"))
      .finally(() => setLoading(false));
  }, [limit, q, action]);

  useEffect(() => {
    const t = setTimeout(load, 250); // дебаунс поиска
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    window.addEventListener(TX_ADDED_EVENT, load);
    return () => window.removeEventListener(TX_ADDED_EVENT, load);
  }, [load]);

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <h1 style={{ marginBottom: 6 }}>История изменений</h1>
      <p style={{ fontSize: 13.5, marginBottom: 20 }}>
        <span style={{ color: ACTION_COLOR.created, fontWeight: 600 }}>записано</span>
        <span style={{ color: "#a6afb8" }}>, </span>
        <span style={{ color: ACTION_COLOR.edited, fontWeight: 600 }}>отредактировано</span>
        <span style={{ color: "#a6afb8" }}>, </span>
        <span style={{ color: ACTION_COLOR.deleted, fontWeight: 600 }}>удалено</span>
      </p>

      {/* Поиск + фильтр по действию */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <input
          placeholder="Поиск: счёт, категория, примечание…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ACTION_FILTERS.map(f => {
            const on = action === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setAction(f.key)}
                style={{
                  padding: "6px 12px", borderRadius: 999, fontSize: 13,
                  border: `1px solid ${on ? "#173a54" : "#e4ddcd"}`,
                  background: on ? "#173a54" : "transparent",
                  color: on ? "#fff" : "#515c68", cursor: "pointer",
                  fontWeight: on ? 600 : 500,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: "#c0432b" }}>{error}</p>}

      {!loading && items.length === 0 && (
        <p style={{ color: "#a6afb8" }}>Пока нет изменений.</p>
      )}

      {items.length > 0 && (
        <div className="history-list" style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
          overflow: "hidden",
        }}>
          {items.map((h, idx) => (
            <Row key={h.id} h={h} first={idx === 0} />
          ))}
        </div>
      )}

      {items.length < total && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="btn-ghost" onClick={() => setLimit(l => l + 100)}>
            Показать ещё
          </button>
        </div>
      )}
    </div>
  );
}
