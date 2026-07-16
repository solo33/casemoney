import { Fragment, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AnalysisNav from "../components/AnalysisNav";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { useUser } from "../contexts/UserContext";
import { currencySymbol, formatMoney } from "../utils/money";

const GRANULARITIES = [
  { key: "day", label: "День" },
  { key: "month", label: "Месяц" },
  { key: "year", label: "Год" },
];

const RU_MONTHS_FULL = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// granularity + опорная дата → query-параметры для /api/reports/summary
function buildPeriodParams(gran, anchor) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth() + 1;
  if (gran === "day") {
    const d = isoDate(anchor);
    return { period: "custom", date_from: d, date_to: d };
  }
  if (gran === "year") {
    return { period: "year", year: y };
  }
  return { period: "month", year: y, month: m };
}

// Человекочитаемый заголовок периода
function periodLabel(gran, anchor) {
  const y = anchor.getFullYear();
  if (gran === "day") {
    return anchor.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }
  if (gran === "year") return `${y} год`;
  return `${RU_MONTHS_FULL[anchor.getMonth()]} ${y}`;
}

// Сдвиг опорной даты на ±1 шаг выбранной гранулярности
function stepAnchor(gran, anchor, dir) {
  const d = new Date(anchor);
  if (gran === "day") d.setDate(d.getDate() + dir);
  else if (gran === "year") d.setFullYear(d.getFullYear() + dir);
  else d.setMonth(d.getMonth() + dir);
  return d;
}

// Палитра для секторов пирога. Цвета категорий в базе часто одинаковые
// (дефолт при импорте), поэтому для наглядности раскрашиваем сектора по
// порядку из фиксированной палитры в духе Modern Ledger.
const PIE_PALETTE = [
  "#173a54", "#8a682d", "#245783", "#0f6a40", "#a93421", "#66727e",
  "#0f766e", "#b45309", "#6d28d9", "#be123c", "#0e7490", "#4d7c0f",
  "#9333ea", "#a16207", "#1d4ed8", "#15803d",
];

export default function Reports() {
  const { mainCurrency } = useUser();
  const navigate = useNavigate();
  const [gran, setGran] = useState("month");          // day | month | year
  const [anchor, setAnchor] = useState(new Date());   // опорная дата периода
  const [drillCatId, setDrillCatId] = useState(null);   // id выбранной корневой для drill-down в pie
  const [expandedRows, setExpandedRows] = useState(new Set());

  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const label = periodLabel(gran, anchor);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = buildPeriodParams(gran, anchor);
    Promise.all([
      api.get("/api/reports/summary", { params }),
      api.get("/api/reports/monthly-trend", { params: { months: 6 } }),
    ])
      .then(([s, t]) => { setSummary(s.data); setTrend(t.data); })
      .catch(() => setError("Ошибка загрузки анализа"))
      .finally(() => setLoading(false));
  }, [gran, anchor]);

  // Значение для пикера (<input>) под текущую гранулярность
  const pickerValue = gran === "day"
    ? isoDate(anchor)
    : gran === "month"
      ? `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`
      : String(anchor.getFullYear());

  const onPickerChange = (e) => {
    const v = e.target.value;
    if (!v) return;
    if (gran === "day") setAnchor(new Date(v + "T00:00:00"));
    else if (gran === "month") { const [y, m] = v.split("-"); setAnchor(new Date(+y, +m - 1, 1)); }
    else setAnchor(new Date(+v, anchor.getMonth(), 1));
  };

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

  // ВАЖНО: поле доли называем `share`, а не `percent`. Recharts в label/tooltip
  // подставляет в payload своё вычисленное поле `percent` (доля 0..1), и если
  // в данных уже есть `percent` в процентах (0..100), оно перетирает расчёт и
  // даёт значения вроде 2720%. Поэтому держим своё значение под другим именем.
  const pieData = !summary ? [] : (drillRoot
    ? [
        ...drillRoot.children.map(c => ({
          name: `${c.category_icon ? c.category_icon + " " : ""}${c.category_name}`,
          value: c.total,
          color: c.category_color,
          share: drillRoot.total > 0 ? +(c.total / drillRoot.total * 100).toFixed(1) : 0,
          id: c.category_id,
          drillable: false,
        })),
        ...(drillRoot.own_total > 0
          ? [{
              name: `${drillRoot.category_icon ? drillRoot.category_icon + " " : ""}${drillRoot.category_name} (без подкатегории)`,
              value: drillRoot.own_total,
              color: drillRoot.category_color,
              share: drillRoot.total > 0 ? +(drillRoot.own_total / drillRoot.total * 100).toFixed(1) : 0,
              id: null,
              drillable: false,
            }]
          : []),
      ]
    : summary.category_breakdown.map(c => ({
        name: `${c.category_icon ? c.category_icon + " " : ""}${c.category_name}`,
        value: c.total,
        color: c.category_color,
        share: c.percent,
        id: c.category_id,
        drillable: c.children?.length > 0,
      })));

  const barData = trend ? trend.points.map(p => ({
    name: p.label,
    Доходы: p.income,
    Расходы: p.expense,
  })) : [];

  // Клик по сумме категории → Записи с фильтром (категория + расход + период)
  const goToCategory = (catId) => {
    if (!summary) return;
    const params = new URLSearchParams({
      type: "expense",
      date_from: summary.date_from,
      date_to: summary.date_to,
    });
    if (catId != null) params.set("category_id", String(catId));
    navigate(`/transactions?${params.toString()}`);
  };

  return (
    <div className="page">
      <h1 style={{ margin: "0 0 12px" }}>Анализ</h1>
      <AnalysisNav />

      {/* Период: гранулярность + один пикер + стрелки */}
      <div className="report-period-controls" style={{
        display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12, alignItems: "center",
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          {GRANULARITIES.map(g => {
            const active = gran === g.key;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setGran(g.key)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: `1px solid ${active ? "#173a54" : "#e4ddcd"}`,
                  background: active ? "#173a54" : "transparent",
                  color: active ? "#fff" : "#515c68",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button type="button" className="btn-ghost" style={{ padding: "5px 11px" }}
                  onClick={() => setAnchor(a => stepAnchor(gran, a, -1))}>‹</button>
          <input
            type={gran === "day" ? "date" : gran === "month" ? "month" : "number"}
            value={pickerValue}
            onChange={onPickerChange}
            style={{ padding: "6px 10px", width: gran === "year" ? 90 : "auto" }}
          />
          <button type="button" className="btn-ghost" style={{ padding: "5px 11px" }}
                  onClick={() => setAnchor(a => stepAnchor(gran, a, 1))}>›</button>
          <button type="button" className="btn-ghost" style={{ padding: "5px 12px", fontSize: 13 }}
                  onClick={() => setAnchor(new Date())}>Сегодня</button>
        </div>
      </div>

      {/* Заголовок периода */}
      {summary && (
        <p style={{ color: "#7a8590", fontSize: 14, marginBottom: 20 }}>
          {label} · {summary.transactions_count} операций
        </p>
      )}

      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: "#c0432b" }}>{error}</p>}

      {summary && !loading && (
        <>
          {/* Карточки итогов */}
          <div className="report-stat-grid" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
            <StatCard label="Доходы" value={summary.total_income} color="#0f6a40" sign="+" sym={sym} />
            <StatCard label="Расходы" value={summary.total_expense} color="#a93421" sign="−" sym={sym} />
            <StatCard
              label="Сальдо"
              value={summary.net}
              color={summary.net >= 0 ? "#0f6a40" : "#a93421"}
              sign={summary.net >= 0 ? "+" : ""}
              sym={sym}
            />
          </div>

          {/* Графики */}
          <div className="report-chart-grid" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            {/* Bar — 6 месяцев */}
            <Card title="Доходы и расходы (6 месяцев)" kind="trend" style={{ flex: 2, minWidth: 320 }}>
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
                    <Bar dataKey="Доходы" fill="#0f6a40" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Расходы" fill="#a93421" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Pie — расходы по категориям с drill-down */}
            <Card
              kind="pie"
              title={
                drillRoot
                  ? `${drillRoot.category_icon ? drillRoot.category_icon + " " : ""}${drillRoot.category_name} — подкатегории`
                  : `Расходы по категориям · ${label}`
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
          </div>

          {/* Таблица топ категорий с раскрывающимися подкатегориями */}
          {summary.category_breakdown.length > 0 && (
            <Card title="Расходы по категориям" kind="categories">
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
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color, sign = "", sym = "₽" }) {
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

function Card({ title, children, style, right, kind }) {
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
