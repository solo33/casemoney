import { useState, useEffect, useMemo, useCallback } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";

function formatMoney(v) {
  return v.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

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
  const [preset, setPreset] = useState("current_month");
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

  const pieData = summary ? summary.category_breakdown.map(c => ({
    name: `${c.category_icon ? c.category_icon + " " : ""}${c.category_name}`,
    value: c.total,
    color: c.category_color,
    percent: c.percent,
  })) : [];

  const barData = trend ? trend.points.map(p => ({
    name: p.label,
    Доходы: p.income,
    Расходы: p.expense,
  })) : [];

  return (
    <div className="page">
      <h1 style={{ marginBottom: 16 }}>Отчёты</h1>

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
                border: `1px solid ${active ? "#6366f1" : "#e2e8f0"}`,
                background: active ? "#6366f1" : "#fff",
                color: active ? "#fff" : "#475569",
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
          <label style={{ fontSize: 13, color: "#64748b" }}>
            С{" "}
            <input
              type="date"
              value={custom.from}
              onChange={e => setCustom({ ...custom, from: e.target.value })}
              style={{ padding: "6px 10px" }}
            />
          </label>
          <label style={{ fontSize: 13, color: "#64748b" }}>
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
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 20 }}>
          {summary.period_label} · {summary.transactions_count} операций
        </p>
      )}

      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: "#ef4444" }}>{error}</p>}

      {summary && !loading && (
        <>
          {/* Карточки итогов */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
            <StatCard label="Доходы" value={summary.total_income} color="#22c55e" sign="+" />
            <StatCard label="Расходы" value={summary.total_expense} color="#ef4444" sign="−" />
            <StatCard
              label="Сальдо"
              value={summary.net}
              color={summary.net >= 0 ? "#22c55e" : "#ef4444"}
              sign={summary.net >= 0 ? "+" : ""}
            />
          </div>

          {/* Графики */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            {/* Bar — 6 месяцев */}
            <Card title="Доходы и расходы (6 месяцев)" style={{ flex: 2, minWidth: 320 }}>
              {barData.length === 0 ? (
                <p style={{ color: "#94a3b8" }}>Нет данных</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={barData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => formatMoney(v) + " ₽"} />
                    <Legend />
                    <Bar dataKey="Доходы" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Расходы" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Pie — расходы по категориям */}
            <Card title={`Расходы по категориям · ${summary.period_label}`} style={{ flex: 1, minWidth: 280 }}>
              {pieData.length === 0 ? (
                <p style={{ color: "#94a3b8" }}>Нет расходов за период</p>
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
                    >
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, n, props) => [`${formatMoney(v)} ₽ (${props.payload.percent}%)`, props.payload.name]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Таблица топ категорий */}
          {summary.category_breakdown.length > 0 && (
            <Card title="Топ категорий по расходам">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b", minWidth: 32 }}></th>
                      <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 13, color: "#64748b" }}>Категория</th>
                      <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#64748b" }}>Сумма</th>
                      <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#64748b" }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.category_breakdown.map(c => (
                      <tr key={String(c.category_id)} style={{ borderTop: "1px solid #f1f5f9" }}>
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
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>
                          {formatMoney(c.total)} ₽
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "#64748b" }}>
                          {c.percent}%
                        </td>
                      </tr>
                    ))}
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

function StatCard({ label, value, color, sign = "" }) {
  return (
    <div style={{
      flex: 1, minWidth: 140, background: "#fff", border: "1px solid #e2e8f0",
      borderRadius: 12, padding: "14px 18px",
    }}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>
        {sign}{formatMoney(value)} ₽
      </div>
    </div>
  );
}

function Card({ title, children, style }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18,
      ...style,
    }}>
      <h3 style={{ marginTop: 0, marginBottom: 14, fontSize: 14, color: "#334155" }}>{title}</h3>
      {children}
    </div>
  );
}
