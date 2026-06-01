import { useState, useEffect, useCallback } from "react";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { formatMoney } from "../utils/money";

const ACTION_COLOR = {
  created: "#167a4a",   // записано
  edited: "#b45309",    // отредактировано
  deleted: "#c0432b",   // удалено
};

// Стрелка направления: доход — приход (←), расход — уход (→), перевод (⇄)
const TYPE_ARROW = { income: "←", expense: "→", transfer: "⇄" };

const RU_MONTHS_SHORT = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function changedAtLabel(iso) {
  const d = new Date(iso);
  const t = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${d.getDate()} ${RU_MONTHS_SHORT[d.getMonth()]} ${t}`;
}
function opDateLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function History() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(100);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/api/transactions/history", { params: { limit, offset: 0 } })
      .then(r => { setItems(r.data.items); setTotal(r.data.total); })
      .catch(() => setError("Ошибка загрузки истории"))
      .finally(() => setLoading(false));
  }, [limit]);

  useEffect(() => {
    load();
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

      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: "#c0432b" }}>{error}</p>}

      {!loading && items.length === 0 && (
        <p style={{ color: "#a6afb8" }}>Пока нет изменений.</p>
      )}

      {items.length > 0 && (
        <div style={{
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

function Row({ h, first }) {
  const color = ACTION_COLOR[h.action] || "#1b2531";
  const deleted = h.action === "deleted";
  const arrow = TYPE_ARROW[h.type] || "→";

  // Сумма: для отредактированных показываем «было → стало», если сумма менялась
  const amountNode = (h.action === "edited" && h.prev_amount != null && Math.abs(h.prev_amount - h.amount) > 0.005)
    ? <>{formatMoney(h.prev_amount)} {h.prev_currency || h.currency} → {formatMoney(h.amount)} {h.currency}</>
    : <>{formatMoney(h.amount)} {h.currency}</>;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "9px 16px",
      borderTop: first ? "none" : "1px solid #ece6d8",
      fontSize: 13.5,
    }}>
      <span style={{ color: "#7a8590", whiteSpace: "nowrap", minWidth: 110 }}>
        {changedAtLabel(h.changed_at)}
      </span>
      <span style={{ color: "#a6afb8", whiteSpace: "nowrap", minWidth: 86 }}>
        {opDateLabel(h.op_date)}
      </span>
      <span style={{ flex: 1, minWidth: 0, color: "#1b2531" }}>
        <span style={{ color: "#173a54" }}>{h.account_name || "—"}</span>
        <span style={{ color: "#a6afb8", margin: "0 6px" }}>{arrow}</span>
        <span>{h.category_name || (h.type === "transfer" ? "Перевод" : "Без категории")}</span>
        {h.description && (
          <span style={{ color: "#a6afb8", marginLeft: 8, fontSize: 12.5 }}>{h.description}</span>
        )}
      </span>
      <span style={{
        whiteSpace: "nowrap", fontWeight: 600, color,
        textDecoration: deleted ? "line-through" : "none",
        fontVariantNumeric: "tabular-nums",
      }}>
        {amountNode}
      </span>
    </div>
  );
}
