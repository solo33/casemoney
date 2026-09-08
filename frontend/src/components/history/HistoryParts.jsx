import { formatMoney } from "../../utils/money";
import { ACTION_COLOR, TYPE_ARROW, changedAtLabel, opDateLabel } from "../../utils/historyView";

export function Row({ h, first }) {
  const color = ACTION_COLOR[h.action] || "#1b2531";
  const deleted = h.action === "deleted";
  const arrow = TYPE_ARROW[h.type] || "→";

  // Сумма: для отредактированных показываем «было → стало», если сумма менялась
  const amountNode = (h.action === "edited" && h.prev_amount != null && Math.abs(h.prev_amount - h.amount) > 0.005)
    ? <>{formatMoney(h.prev_amount)} {h.prev_currency || h.currency} → {formatMoney(h.amount)} {h.currency}</>
    : <>{formatMoney(h.amount)} {h.currency}</>;

  return (
    <div className="history-row" style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "9px 16px",
      borderTop: first ? "none" : "1px solid #ece6d8",
      fontSize: 13.5,
    }}>
      <span className="history-changed" style={{ color: "#7a8590", whiteSpace: "nowrap", minWidth: 110 }}>
        {changedAtLabel(h.changed_at)}
      </span>
      <span className="history-date" style={{ color: "#a6afb8", whiteSpace: "nowrap", minWidth: 86 }}>
        {opDateLabel(h.op_date)}
      </span>
      <span className="history-operation" style={{ flex: 1, minWidth: 0, color: "#1b2531" }}>
        <span style={{ color: "#173a54" }}>{h.account_name || "—"}</span>
        <span style={{ color: "#a6afb8", margin: "0 6px" }}>{arrow}</span>
        <span>{h.category_name || (h.type === "transfer" ? "Перевод" : "Без категории")}</span>
        {h.description && (
          <span style={{ color: "#a6afb8", marginLeft: 8, fontSize: 12.5 }}>{h.description}</span>
        )}
      </span>
      <span className="history-amount" style={{
        whiteSpace: "nowrap", fontWeight: 600, color,
        textDecoration: deleted ? "line-through" : "none",
        fontVariantNumeric: "tabular-nums",
      }}>
        {amountNode}
      </span>
    </div>
  );
}
