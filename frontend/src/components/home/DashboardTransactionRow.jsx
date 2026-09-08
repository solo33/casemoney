import { formatMoneyWithCurrency } from "../../utils/money";
import { TYPE_ICON, TYPE_LABEL, TYPE_COLOR } from "../../utils/homeView";

export function TxRow({ tx, first, showDate, onEdit, onDelete }) {
  const changedStr = new Date(tx.updated_at || tx.date).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 16px",
        borderTop: first ? "none" : "1px solid #ece6d8",
        background: tx.is_family_expense ? "#fff8e6" : undefined,
        boxShadow: tx.is_family_expense ? "inset 3px 0 #d6a83d" : undefined,
      }}
      className="tx-row"
    >
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "#ece6d8", display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
      }}>
        {tx.category_icon || TYPE_ICON[tx.type] || "•"}
      </div>
      <div
        onClick={onEdit}
        style={{ flex: 1, minWidth: 0, cursor: onEdit ? "pointer" : "default" }}
        title={onEdit ? "Открыть для редактирования" : undefined}
      >
        <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tx.description || tx.category_name || TYPE_LABEL[tx.type]}
          {tx.is_family_expense && <span style={{ marginLeft: 6, color: "#9a6d17", fontSize: 11, fontWeight: 700 }}>Семейная</span>}
        </div>
        <div style={{ fontSize: 12, color: "#a6afb8" }}>
          {showDate ? `Изменено ${changedStr} · ` : ""}{tx.account_name}
        </div>
      </div>
      <div style={{
        fontWeight: 600, fontSize: 14,
        color: TYPE_COLOR[tx.type], whiteSpace: "nowrap",
      }}>
        {tx.type === "expense" ? "−" : tx.type === "income" ? "+" : ""}{formatMoneyWithCurrency(tx.amount, tx.currency)}
      </div>
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        {tx.pending_sync && (
          <span style={{ color: tx.sync_error ? "#c0432b" : "#9a6d17", fontSize: 11, marginRight: 6 }}>
            {tx.sync_error ? "Ошибка синхронизации" : "На устройстве"}
          </span>
        )}
        <button
          type="button"
          onClick={onEdit}
          disabled={tx.pending_sync}
          className="btn-ghost"
          style={{ padding: "3px 7px", fontSize: 12, border: "none", background: "transparent", color: "#7a8590" }}
          title="Изменить"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="btn-ghost"
          style={{ padding: "3px 7px", fontSize: 14, border: "none", background: "transparent", color: "#c0432b" }}
          title="Удалить"
        >
          ×
        </button>
      </div>
    </div>
  );
}
