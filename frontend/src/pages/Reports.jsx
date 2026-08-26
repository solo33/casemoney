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

const TREND_PERIODS = [3, 6, 12, 24];

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
  const { mainCurrency, user } = useUser();
  const navigate = useNavigate();
  const [gran, setGran] = useState("month");          // day | month | year
  const [anchor, setAnchor] = useState(new Date());   // опорная дата периода
  const [drillCatId, setDrillCatId] = useState(null);   // id выбранной корневой для drill-down в pie
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [breakdownType, setBreakdownType] = useState("expense");
  const [trendMonths, setTrendMonths] = useState(6);
  const [includePlanned, setIncludePlanned] = useState(false);
  const hasFamilyPlan = Boolean(user?.family_access);

  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState(null);
  const [insights, setInsights] = useState(null);
  const [regularPayments, setRegularPayments] = useState([]);
  const [aiInsight, setAiInsight] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const label = periodLabel(gran, anchor);

  const trendEndDate = gran === "year"
    ? `${anchor.getFullYear()}-12-31`
    : isoDate(anchor);
  const breakdownLabel = breakdownType === "income" ? "Доходы" : "Расходы";
  const breakdownGenitive = breakdownType === "income" ? "доходов" : "расходов";

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = { ...buildPeriodParams(gran, anchor), breakdown_type: breakdownType, include_planned: includePlanned };
    Promise.all([
      api.get("/api/reports/summary", { params }),
      api.get("/api/reports/monthly-trend", { params: { months: trendMonths, end_date: trendEndDate, include_planned: includePlanned } }),
      hasFamilyPlan
        ? api.post("/api/finance-insights/summary", { period_days: 30 })
        : Promise.resolve({ data: null }),
      hasFamilyPlan
        ? api.get("/api/automation/regular-payments")
        : Promise.resolve({ data: [] }),
    ])
      .then(([s, t, i, regular]) => { setSummary(s.data); setTrend(t.data); setInsights(i.data); setRegularPayments(regular.data || []); })
      .catch(() => setError("Ошибка загрузки анализа"))
      .finally(() => setLoading(false));
  }, [gran, anchor, breakdownType, trendMonths, trendEndDate, includePlanned, hasFamilyPlan]);

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

  useEffect(() => {
    setDrillCatId(null);
    setExpandedRows(new Set());
  }, [breakdownType]);

  const requestAiInsight = async (scenario) => {
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await api.post("/api/finance-ai/insight", { scenario, period_days: 30 });
      setAiInsight(response.data);
    } catch (requestError) {
      setAiError(requestError.response?.data?.detail || "Не удалось получить подсказку.");
    } finally {
      setAiLoading(false);
    }
  };

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

  // Клик по сумме категории → Записи с фильтром (категория + тип + период)
  const goToCategory = (catId) => {
    if (!summary) return;
    const params = new URLSearchParams({
      type: breakdownType,
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
      {hasFamilyPlan && (
        <label className="report-planned-toggle">
          <input
            type="checkbox"
            checked={includePlanned}
            onChange={event => setIncludePlanned(event.target.checked)}
          />
          Показать планируемые записи
        </label>
      )}

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

          {hasFamilyPlan && insights && (
            <section className="finance-insights-card">
              <div>
                <p className="finance-insights-eyebrow">ФИНАНСОВЫЙ ПОМОЩНИК</p>
                <h2>Наблюдения за 30 дней</h2>
                <p>Подсказки строятся только по вашим суммам и категориям. Свободные вопросы и доступ к личным данным других людей отключены.</p>
              </div>
              <div className="finance-insights-list">
                {(insights.insights || []).map((item, index) => (
                  <article key={`${item.title}-${index}`} className={`finance-insight finance-insight-${item.kind}`}>
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                  </article>
                ))}
              </div>
              <div className="finance-ai-actions">
                <b>AI-помощник</b>
                <span>Работает только с итогами и категориями за 30 дней — без свободных вопросов и без доступа к отдельным операциям.</span>
                <div>
                  <button type="button" className="btn-ghost" disabled={aiLoading} onClick={() => requestAiInsight("monthly_overview")}>Итог месяца</button>
                  <button type="button" className="btn-ghost" disabled={aiLoading} onClick={() => requestAiInsight("spending_anomalies")}>Проверить расходы</button>
                  <button type="button" className="btn-ghost" disabled={aiLoading} onClick={() => requestAiInsight("budget_tips")}>Идеи для бюджета</button>
                </div>
                {aiLoading && <small>Готовим подсказку…</small>}
                {aiError && <small className="finance-ai-error">{aiError}</small>}
                {aiInsight && <div className="finance-ai-result">
                  {aiInsight.recommendations.map((item, index) => <p key={`${index}-${item}`}>{item}</p>)}
                  <small>{aiInsight.source_note} Осталось подсказок в этом месяце: {aiInsight.remaining_requests}.</small>
                </div>}
              </div>
            </section>
          )}

          {hasFamilyPlan && regularPayments.length > 0 && (
            <section className="report-regular-card">
              <div><p className="finance-insights-eyebrow">ФИНАНСОВАЯ КАРТИНА</p><h2>Регулярные платежи и поступления</h2><p>Найдены по истории операций. Это подсказки: они не создают записи и не меняют план без вашего решения.</p></div>
              <div className="report-regular-grid">{regularPayments.map(item => <article key={item.key}>
                <div><strong>{item.description}</strong><span>{item.transaction_type === "expense" ? "Расход" : "Доход"} · {item.cadence} · {item.account_name}</span><small>Следующее ориентировочно {new Date(`${item.next_date}T12:00:00`).toLocaleDateString("ru-RU")}</small></div>
                <b className={item.transaction_type === "expense" ? "is-expense" : "is-income"}>{item.transaction_type === "expense" ? "−" : "+"}{formatMoney(item.amount)} {item.currency}</b>
              </article>)}</div>
            </section>
          )}

          {/* Графики */}
          <div className="report-chart-grid" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            <Card
              title={`Доходы и расходы · ${trendMonths} мес.`}
              kind="trend"
              style={{ flex: 2, minWidth: 320 }}
              right={(
                <label style={{ display: "flex", alignItems: "center", gap: 5, color: "#7a8590", fontSize: 12 }}>
                  Период
                  <select
                    value={trendMonths}
                    onChange={event => setTrendMonths(Number(event.target.value))}
                    aria-label="Период графика доходов и расходов"
                    style={{ padding: "3px 5px", fontSize: 12 }}
                  >
                    {TREND_PERIODS.map(months => <option key={months} value={months}>{months} мес.</option>)}
                  </select>
                </label>
              )}
            >
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

            {/* Pie — выбранный тип операций по категориям с drill-down */}
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
          </div>

          {/* Таблица категорий с раскрывающимися подкатегориями */}
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
