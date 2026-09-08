import { formatMoney } from "../../utils/money";
import { RU_MONTHS_FULL } from "../../utils/homeView";

export function MonthBars({ points, sym }) {
  if (!points.length) {
    return <p style={{ color: "#a6afb8", fontSize: 14 }}>Нет данных</p>;
  }
  const maxVal = Math.max(...points.flatMap(p => [Math.abs(p.income), Math.abs(p.expense)])) || 1;

  return (
    <div aria-label="Движение денег по месяцам">
      {points.map((p, idx) => {
        const now = new Date();
        const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const m = parseInt(p.month.split("-")[1], 10);
        const label = p.month === curKey
          ? "Этот месяц"
          : RU_MONTHS_FULL[m - 1].charAt(0).toUpperCase() + RU_MONTHS_FULL[m - 1].slice(1);
        return (
          <div key={p.month} style={{
            display: "grid",
            gridTemplateColumns: "68px minmax(56px, 1fr) auto",
            alignItems: "center",
            gap: 8,
            minHeight: 34,
            padding: "4px 0",
            borderBottom: idx === points.length - 1 ? "none" : "1px solid #f1ece2",
          }}>
            <span style={{ fontSize: 11, lineHeight: 1.2, color: "#7a8590" }}>
              {label}
            </span>
            <div style={{ display: "grid", gap: 5 }} aria-hidden="true">
              <MonthBar value={p.income} max={maxVal} color="#3d9a68" />
              <MonthBar value={p.expense} max={maxVal} color="#d66a54" />
            </div>
            <div className="tabular" style={{
              display: "grid", gap: 1, minWidth: 78,
              fontSize: 11, lineHeight: 1.15, textAlign: "right", fontWeight: 600,
            }}>
              <span style={{ color: "#167a4a" }}>+{formatMoney(p.income)} {sym}</span>
              <span style={{ color: "#c0432b" }}>−{formatMoney(p.expense)} {sym}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MonthBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <div style={{
      height: 5, background: "#ece6d8", borderRadius: 999, overflow: "hidden",
    }}>
      <div style={{
        width: `${pct}%`, minWidth: pct > 0 ? 3 : 0,
        height: "100%", background: color, borderRadius: 999,
      }} />
    </div>
  );
}
