import { Card } from "./ReportsParts";
import { Fragment } from "react";
import { formatMoney } from "../../utils/money";

export default function CategoryReport({ breakdownLabel, breakdownType, setBreakdownType, summary, breakdownGenitive, expandedRows, setExpandedRows, goToCategory, sym }) {
  return (
    <Card
              title={`${breakdownLabel} по категориям`}
              kind="categories"
              right={(
                <div style={{ display: "flex", gap: 4 }}>
                  {[
                    ["expense", "Расходы"],
                    ["income", "Доходы"],
                  ].map(([type, title]) => (
                    <button
                      key={type}
                      type="button"
                      className={breakdownType === type ? "" : "btn-ghost"}
                      onClick={() => setBreakdownType(type)}
                      style={{ fontSize: 12, padding: "4px 8px" }}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              )}
            >
              {summary.category_breakdown.length === 0 ? (
                <p style={{ color: "#a6afb8", margin: 0 }}>Нет {breakdownGenitive} за период.</p>
              ) : (
              <div className="table-wrap">
                <table className="report-table">
                  <thead>
                    <tr style={{ background: "#f6f2e9" }}>
                      <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#7a8590", minWidth: 32 }}></th>
                      <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#7a8590" }}>Категория</th>
                      <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#7a8590" }}>Сумма</th>
                      <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#7a8590" }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.category_breakdown.map(c => {
                      const hasChildren = c.children && c.children.length > 0;
                      const expanded = expandedRows.has(c.category_id);
                      const toggle = () => {
                        if (!hasChildren) return;
                        const next = new Set(expandedRows);
                        if (next.has(c.category_id)) next.delete(c.category_id); else next.add(c.category_id);
                        setExpandedRows(next);
                      };
                      return (
                        <Fragment key={String(c.category_id)}>
                          <tr
                            style={{
                              borderTop: "1px solid #ece6d8",
                              cursor: hasChildren ? "pointer" : "default",
                            }}
                            onClick={toggle}
                          >
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{
                                display: "inline-block",
                                width: 14, height: 14, borderRadius: 4,
                                background: c.category_color, verticalAlign: "middle",
                              }} />
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ fontSize: 16, marginRight: 8 }}>{c.category_icon || ""}</span>
                              {c.category_name}
                              {hasChildren && (
                                <span style={{ marginLeft: 6, color: "#a6afb8", fontSize: 12 }}>
                                  {expanded ? "▾" : "▸"} {c.children.length}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>
                              <span
                                onClick={(e) => { e.stopPropagation(); goToCategory(c.category_id); }}
                                style={{ color: "#9c7b3c", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
                                title="Открыть записи по этой категории"
                              >
                                {formatMoney(c.total)} {sym}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: "#7a8590" }}>
                              {c.percent}%
                            </td>
                          </tr>
                          {expanded && c.children.map(ch => (
                            <tr key={`${c.category_id}-${ch.category_id}`} style={{
                              borderTop: "1px solid #f6f2e9", background: "#fafbfc",
                            }}>
                              <td style={{ padding: "8px 12px" }}>
                                <span style={{
                                  display: "inline-block",
                                  width: 10, height: 10, borderRadius: 3,
                                  background: ch.category_color, verticalAlign: "middle",
                                  marginLeft: 12,
                                }} />
                              </td>
                              <td style={{ padding: "8px 12px", color: "#515c68", fontSize: 13 }}>
                                <span style={{ color: "#a6afb8", marginRight: 6 }}>↳</span>
                                {ch.category_icon && <span style={{ marginRight: 6 }}>{ch.category_icon}</span>}
                                {ch.category_name}
                              </td>
                              <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 13 }}>
                                <span
                                  onClick={(e) => { e.stopPropagation(); goToCategory(ch.category_id); }}
                                  style={{ color: "#9c7b3c", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
                                  title="Открыть записи по этой подкатегории"
                                >
                                  {formatMoney(ch.total)} {sym}
                                </span>
                              </td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: "#a6afb8", fontSize: 12 }}>
                                {c.total > 0 ? ((ch.total / c.total) * 100).toFixed(1) : 0}%
                              </td>
                            </tr>
                          ))}
                          {expanded && c.own_total > 0 && (
                            <tr key={`${c.category_id}-own`} style={{ background: "#fafbfc" }}>
                              <td></td>
                              <td style={{ padding: "8px 12px", color: "#a6afb8", fontSize: 13, fontStyle: "italic" }}>
                                <span style={{ color: "#a6afb8", marginRight: 6 }}>↳</span>
                                напрямую без подкатегории
                              </td>
                              <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 13, color: "#7a8590" }}>
                                {formatMoney(c.own_total)} {sym}
                              </td>
                              <td></td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
          </Card>
  );
}
