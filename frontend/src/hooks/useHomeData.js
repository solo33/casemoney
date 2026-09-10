import { useState, useRef, useCallback } from "react";
import api from "../api/client";
import { cachedAccountsAndCategories, saveReferenceData } from "../services/offlineReferenceData";
import { markSyncSuccessful } from "../services/syncStatus";

export function useHomeData({ breakdownType, flowMonth, flowYear, forecastDays }) {
  const [dashboard, setDashboard] = useState(null);
  const [grouped, setGrouped] = useState([]);
  const [accountOptions, setAccountOptions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [categories, setCategories] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadVersion = useRef(0);

  const fetchAll = useCallback(async () => {
    const version = ++loadVersion.current;
    const isCurrent = () => loadVersion.current === version;
    setError(null);
    setInitialLoading(true);
    setBalanceLoading(true);
    setTrendLoading(true);
    setAccountsLoading(true);

    const cached = cachedAccountsAndCategories();
    if (cached) {
      setAccountOptions(cached.accountGroups);
      setCategories(cached.categories);
    }
    if (navigator.onLine === false) {
      setInitialLoading(false);
      setBalanceLoading(false);
      setTrendLoading(false);
      setAccountsLoading(false);
      setError(cached ? null : "Для работы без сети сначала откройте приложение онлайн");
      return;
    }

    const params = {
      period: "month",
      year: flowYear,
      month: flowMonth,
      breakdown_type: breakdownType,
    };

    // Этап 1: данные правой колонки и лёгкие опции счетов — без конвертации.
    const firstStage = await Promise.allSettled([
      api.get("/api/reports/summary", { params }),
      api.get("/api/categories/"),
      api.get("/api/accounts/grouped", { params: { convert_balances: false } }),
    ]);
    if (!isCurrent()) return;
    if (firstStage[0].status === "fulfilled") setSummary(firstStage[0].value.data);
    const nextCategories = firstStage[1].status === "fulfilled"
      ? firstStage[1].value.data
      : cached?.categories;
    const nextAccountOptions = firstStage[2].status === "fulfilled"
      ? firstStage[2].value.data
      : cached?.accountGroups;
    if (nextCategories) setCategories(nextCategories);
    if (nextAccountOptions) setAccountOptions(nextAccountOptions);
    if (firstStage[1].status === "fulfilled" || firstStage[2].status === "fulfilled") {
      saveReferenceData({
        categories: nextCategories || [],
        accountGroups: nextAccountOptions || [],
      });
    }
    if (firstStage.some(result => result.status === "rejected")) {
      setError("Часть данных главной страницы пока недоступна");
    }
    setInitialLoading(false);

    // Если весь первый пакет недоступен, последующие запросы также не запускаем.
    // Это завершает индикаторы и оставляет доступными сохранённые счета/категории.
    if (firstStage.every(result => result.status === "rejected")) {
      setBalanceLoading(false);
      setTrendLoading(false);
      setAccountsLoading(false);
      return;
    }

    // Этап 2: общий баланс и последние изменённые записи.
    try {
      const d = await api.get("/api/dashboard/", { params: { forecast_days: forecastDays } });
      if (isCurrent()) {
        setDashboard(d.data);
        markSyncSuccessful();
      }
    } catch {
      if (isCurrent()) setError("Не удалось обновить общий баланс");
    } finally {
      if (isCurrent()) setBalanceLoading(false);
    }

    // Этап 3: компактная статистика за последние месяцы.
    try {
      const t = await api.get("/api/reports/monthly-trend", { params: { months: 3 } });
      if (isCurrent()) setMonthlyTrend(t.data.points || []);
    } catch {
      if (isCurrent()) setError("Не удалось обновить статистику по месяцам");
    } finally {
      if (isCurrent()) setTrendLoading(false);
    }

    // Этап 4: полный список счетов с пересчётом в основную валюту.
    try {
      const g = await api.get("/api/accounts/grouped");
      if (isCurrent()) setGrouped(g.data);
    } catch {
      if (isCurrent()) setError("Не удалось обновить счета");
    } finally {
      if (isCurrent()) setAccountsLoading(false);
    }
  }, [breakdownType, flowMonth, flowYear, forecastDays]);

  return { dashboard, grouped, accountOptions, summary, monthlyTrend, categories, initialLoading, balanceLoading, trendLoading, accountsLoading, error, setCategories, setError, fetchAll };
}
