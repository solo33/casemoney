import { formatMoney } from "../../utils/money";

export function StatCard({ label, value, color, sign = "", sym = "₽" }) {
  return (
    <div className="report-stat-card" style={{
      flex: 1, minWidth: 140, background: "#fffdf7", border: "1px solid #e4ddcd",
      borderRadius: 12, padding: "14px 18px",
    }}>
      <div style={{ fontSize: 12, color: "#7a8590", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>
        {sign}{formatMoney(value)} {sym}
      </div>
    </div>
  );
}

export function Card({ title, children, style, right, kind }) {
  return (
    <div className={`report-card${kind ? ` report-card-${kind}` : ""}`} style={{
      background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 12, padding: 18,
      ...style,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: "#44403c" }}>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}
