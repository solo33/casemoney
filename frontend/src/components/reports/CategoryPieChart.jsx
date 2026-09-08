import { Card } from "./ReportsParts";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

import { PIE_PALETTE } from "../../utils/reportsView";

import { formatMoney } from "../../utils/money";

export default function CategoryPieChart({ drillRoot, breakdownLabel, label, setDrillCatId, pieData, breakdownGenitive, sym }) {
  return (
    <Card
              kind="pie"
              title={
                drillRoot
                  ? `${drillRoot.category_icon ? drillRoot.category_icon + " " : ""}${drillRoot.category_name} — подкатегории`
                  : `${breakdownLabel} по категориям · ${label}`
              }
              right={drillRoot ? (
                <button
                  type="button"
                  onClick={() => setDrillCatId(null)}
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: "2px 10px" }}
                >
                  ← Назад
                </button>
              ) : undefined}
              style={{ flex: 1, minWidth: 280 }}
            >
              {pieData.length === 0 ? (
                <p style={{ color: "#a6afb8" }}>Нет {breakdownGenitive} за период</p>
              ) : (
                <>
                  {!drillRoot && pieData.some(p => p.drillable) && (
                    <p style={{ fontSize: 11.5, color: "#9c7b3c", margin: "0 0 8px", textAlign: "center" }}>
                      Кликните на сектор с подкатегориями, чтобы раскрыть
                    </p>
                  )}
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={85}
                        label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""}
                        labelLine={false}
                        onClick={(d) => { if (d?.drillable) setDrillCatId(d.id); }}
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} style={{ cursor: entry.drillable ? "pointer" : "default" }} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, n, props) => [`${formatMoney(v)} ${sym} (${props.payload.share}%)`, props.payload.name]} />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Своя легенда — переносится по строкам, не накладывается */}
                  <div style={{
                    display: "flex", flexWrap: "wrap", gap: "4px 14px",
                    marginTop: 12, justifyContent: "center",
                  }}>
                    {pieData.map((e, i) => (
                      <span key={i} style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        fontSize: 12, color: "#515c68",
                      }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: 2,
                          background: PIE_PALETTE[i % PIE_PALETTE.length], flexShrink: 0,
                        }} />
                        {e.name} <span style={{ color: "#a6afb8" }}>{e.share}%</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Card>
  );
}
