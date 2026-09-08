import { useUser } from "../contexts/UserContext";
import { useNavigate } from "react-router-dom";
import { useState, useCallback, useEffect } from "react";
import { periodLabel, isoDate, buildPeriodParams } from "../utils/reportPeriod";

import api from "../api/client";

import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { currencySymbol } from "../utils/money";

export function useReportsController() {
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
  return { gran, setGran, anchor, setAnchor, setDrillCatId, expandedRows, setExpandedRows, breakdownType, setBreakdownType, trendMonths, setTrendMonths, includePlanned, setIncludePlanned, hasFamilyPlan, summary, insights, regularPayments, aiInsight, aiLoading, aiError, loading, error, label, breakdownLabel, breakdownGenitive, requestAiInsight, sym, drillRoot, pieData, barData, goToCategory };
}
