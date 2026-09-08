import { formatMoney } from "../../utils/money";

export function CategoryBar({ name, icon, color, total, max, sym, onClick }) {
  const pct = max > 0 ? Math.min(100, (total / max) * 100) : 0;
  return (
    <div
      className="home-category-bar"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(120px, 1fr) 2fr auto",
        gap: 10, alignItems: "center",
        fontSize: 13,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span style={{
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        display: "flex", alignItems: "center", gap: 6, color: "#515c68",
      }}>
        {icon && <span>{icon}</span>}
        {name}
      </span>
      <div style={{
        height: 14, background: "#f6f2e9", borderRadius: 3, overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: color || "#9c7b3c",
          borderRadius: 3,
        }} />
      </div>
      <span style={{ color: "#515c68", minWidth: 80, textAlign: "right", fontWeight: 500 }}>
        {formatMoney(total)} {sym}
      </span>
    </div>
  );
}
