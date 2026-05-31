import { Fragment, useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { useUser } from "../contexts/UserContext";
import { currencySymbol, formatMoney } from "../utils/money";

// Пресеты периодов → query params для /api/reports/summary
function buildPresetParams(preset, custom) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1..12
  switch (preset) {
    case "current_month":
      return { period: "month", year: y, month: m };
    case "prev_month": {
      let py = y, pm = m - 1;
      if (pm < 1) { pm = 12; py -= 1; }
      return { period: "month", year: py, month: pm };
    }
    case "current_quarter": {
      const q = Math.floor((m - 1) / 3) + 1;
      return { period: "quarter", year: y, quarter: q };
    }
    case "current_year":
      return { period: "year", year: y };
    case "custom":
      return {
        period: "custom",
        date_from: custom.from,
        date_to: custom.to,
      };
    default:
      return { period: "month", year: y, month: m };
  }
}

const PRESETS = [
  { key: "current_month", label: "Этот месяц" },
  { key: "prev_month", label: "Прошлый месяц" },
  { key: "current_quarter", label: "Квартал" },
  { key: "current_year", label: "Год" },
  { key: "custom", label: "Период" },
];

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const { mainCurrency } = useUser();
  const [preset, setPreset] = useState("current_month");
  const [drillCatId, setDrillCatId] = useState(null);   // id выбранной корневой для drill-down в pie
  const [expandedRows, setExpandedRows] = useState(new Set());
  const today = useMemo(() => new Date(), []);
  const monthAgo = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d;
  }, []);
  const [custom, setCustom] = useState({ from: isoDate(monthAgo), to: isoDate(today) });

  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = buildPresetParams(preset, custom);
    Promise.all([
      api.get("/api/reports/summary", { params }),
      api.get("/api/reports/monthly-trend", { params: { months: 6 } }),
    ])
      .then(([s, t]) => { setSummary(s.data); setTrend(t.data); })
      .catch(() => setError("Ошибка загрузки отчёта"))
      .finally(() => setLoading(false));
  }, [preset, custom]);

  useEffect(() => {
    fetchData();
    window.addEventListener(TX_ADDED_EVENT, fetchData);
    return () => window.removeEventListener(TX_ADDED_EVENT, fetchData);
  }, [fetchData]);

  // Перезагружаем при смене основной валюты пользователя
  useEffect(() => { fetchData(); }, [mainCurrency, fetchData]);

  const sym = currencySymbol(summary?.main_currency || mainCurrency);

  // Drill-down: если выбрана корневая категория с детьми — показываем её детей,
  // иначе — корневые. own_total корня тоже добавляем как отдельный сегмент "Прочее".
  const drillRoot = drillCatId != null && summary
    ? summary.category_breakdown.find(c => c.category_id === drillCatId)
    : null;

  const pieData = !summary ? [] : (drillRoot
    ? [
        ...drillRoot.children.map(c => ({
          name: `${c.category_icon ? c.category_icon + " " : ""}${c.category_name}`,
          value: c.total,
          color: c.category_color,
          percent: drillRoot.total > 0 ? +(c.total / drillRoot.total * 100).toFixed(1) : 0,
          id: c.category_id,
          drillable: false,
        })),
        ...(drillRoot.own_total > 0
          ? [{
              name: `${drillRoot.category_icon ? drillRoot.category_icon + " " : ""}${drillRoot.category_name} (без подкатегории)`,
              value: drillRoot.own_total,
              color: drillRoot.category_color,
              percent: drillRoot.total > 0 ? +(drillRoot.own_total / drillRoot.total * 100).toFixed(1) : 0,
              id: null,
              drillable: false,
            }]
          : []),
      ]
    : summary.category_breakdown.map(c => ({
        name: `${c.category_icon ? c.category_icon + " " : ""}${c.category_name}`,
        value: c.total,
        color: c.category_color,
        percent: c.percent,
        id: c.category_id,
        drillable: c.children?.length > 0,
      })));

  const barData = trend ? trend.points.map(p => ({
    name: p.label,
    Доходы: p.income,
    Расходы: p.expense,
  })) : [];

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Отчёты</h1>
        <Link to="/reports/annual" style={{ fontSize: 14, color: "#173a54", textDecoration: "none", fontWeight: 500 }}>
          Годовой анализ →
        </Link>
      </div>

      {/* Переключатель периода */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12,
      }}>
        {PRESETS.map(p => {
          const active = preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${active ? "#173a54" : "#e4ddcd"}`,
                background: active ? "#173a54" : "#fff",
                color: active ? "#fff" : "#515c68",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Поля кастомного периода */}
      {preset === "custom" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, color: "#7a8590" }}>
            С{" "}
            <input
              type="date"
              value={custom.from}
              onChange={e => setCustom({ ...custom, from: e.target.value })}
              style={{ padding: "6px 10px" }}
            />
          </label>
          <label style={{ fontSize: 13, color: "#7a8590" }}>
            по{" "}
            <input
              type="date"
              value={custom.to}
              onChange={e => setCustom({ ...custom, to: e.target.value })}
              style={{ padding: "6px 10px" }}
            />
          </label>
        </div>
      )}

      {/* Заголовок периода */}
      {summary && (
        <p style={{ color: "#7a8590", fontSize: 14, marginBottom: 20 }}>
          {summary.period_label} · {summary.transactions_count} операций
        </p>
      )}

      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: "#c0432b" }}>{error}</p>}

      {summary && !loading && (
        <>
          {/* Карточки итогов */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
            <StatCard label="Доходы" value={summary.total_income} color="#167a4a" sign="+" sym={sym} />
            <StatCard label="Расходы" value={summary.total_expense} color="#c0432b" sign="−" sym={sym} />
            <StatCard
              label="Сальдо"
              value={summary.net}
              color={summary.net >= 0 ? "#167a4a" : "#c0432b"}
              sign={summary.net >= 0 ? "+" : ""}
              sym={sym}
            />
          </div>

          {/* Графики */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            {/* Bar — 6 месяцев */}
            <Card title="Доходы и расходы (6 месяцев)" style={{ flex: 2, minWidth: 320 }}>
              {barData.length === 0 ? (
                <p style={{ color: "#a6afb8" }}>Нет данных</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={barData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ece6d8" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => formatMoney(v) + " " + sym} />
                    <Legend />
                    <Bar dataKey="Доходы" fill="#167a4a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Расходы" fill="#c0432b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Pie — расходы по категориям с drill-down */}
            <Card
              title={
                drillRoot
                  ? `${drillRoot.category_icon ? drillRoot.category_icon + " " : ""}${drillRoot.category_name} — подкатегории`
                  : `Расходы по категориям · ${summary.period_label}`
              }
              right={drillRoot && (
                <button
                  type="button"
                  onClick={() => setDrillCatId(null)}
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: "2px 10px" }}
                >
                  ← Назад
                </button>
              )}
              style={{ flex: 1, minWidth: 280 }}
            >
              {pieData.length === 0 ? (
                <p style={{ color: "#a6afb8" }}>Нет расходов за период</p>
              ) : (
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
                        <Cell key={i} fill={entry.color} style={{ cursor: entry.drillable ? "pointer" : "default" }} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n, props) => [`${formatMoney(v)} ${sym} (${props.payload.percent}%)`, props.payload.name]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {!drillRoot && pieData.some(p => p.drillable) && (
                <p style={{ fontSize: 11, color: "#a6afb8", marginTop: 6, marginBottom: 0, textAlign: "center" }}>
                  Кликните на сектор с подкатегориями, чтобы раскрыть
                </p>
              )}
            </Card>
          </div>

          {/* Таблица топ категорий с раскрывающимися подкатегориями */}
          {summary.category_breakdown.length > 0 && (
            <Card title="Топ категорий по расходам">
              <div className="table-wrap">
                <table>
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
                              {formatMoney(c.total)} {sym}
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
                                {formatMoney(ch.total)} {sym}
                              </td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: "#a6afb8", fontSize: 12 }}>
                                {c.total > 0 ? ((ch.total / c.total) * 100).toFixed(1) : 0}% от родителя
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
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color, sign = "", sym = "₽" }) {
  return (
    <div style={{
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

function Card({ title, children, style, right }) {
  return (
    <div style={{
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
