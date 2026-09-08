import { useUser } from "../contexts/UserContext";
import { useNavigate } from "react-router-dom";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";

import { normalizeDashboardWidgets as dashboardWidgetSettings } from "../utils/dashboardWidgets";
import { getLastSuccessfulSync, SYNC_STATUS_EVENT, markSyncSuccessful } from "../services/syncStatus";




import { cachedAccountsAndCategories, saveReferenceData } from "../services/offlineReferenceData";
import api from "../api/client";


import { listPendingTransactions, removeOfflineMutation, LOCAL_TRANSACTION_EVENT } from "../services/offlineMutations";

import { TX_ADDED_EVENT } from "../components/QuickAddFab";

import { currencySymbol } from "../utils/money";
import { isoToday, aggregateByCurrency, isToday, RU_MONTHS_FULL, currentMonthRange } from "../utils/homeView";

export function useHomeController() {
  const { mainCurrency, user, updateUser } = useUser();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [grouped, setGrouped] = useState([]);
  const [accountOptions, setAccountOptions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [breakdownType, setBreakdownType] = useState("expense"); // expense | income
  const [forecastDays, setForecastDays] = useState(30);
  const [balanceMode, setBalanceMode] = useState("actual"); // actual | planned
  const flowMonth = new Date().getMonth() + 1;
  const flowYear = new Date().getFullYear();
  const [recordsTab, setRecordsTab] = useState("today"); // today | changed
  const [categories, setCategories] = useState([]);
  const [editingTx, setEditingTx] = useState(null);
  const [adjustingBalance, setAdjustingBalance] = useState(null);
  const [selectedDate, setSelectedDate] = useState(isoToday()); // дата формы = дата ленты
  const [dayTx, setDayTx] = useState([]);                       // записи за выбранный день
  const [onbDismissed, setOnbDismissed] = useState(() => localStorage.getItem("cm_onb_done") === "1");
  const widgetSettings = useMemo(() => dashboardWidgetSettings(user?.dashboard_widgets), [user?.dashboard_widgets]);
  const widgetSettingsSignature = useMemo(() => JSON.stringify(user?.dashboard_widgets || {}), [user?.dashboard_widgets]);
  const [collapsedWidgets, setCollapsedWidgets] = useState(() => Object.fromEntries(
    Object.entries(dashboardWidgetSettings()).map(([id, options]) => [id, options.collapsed]),
  ));
  const [initialLoading, setInitialLoading] = useState(true);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => getLastSuccessfulSync());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const loadVersion = useRef(0);

  useEffect(() => {
    const onSync = event => setLastSyncedAt(event.detail?.lastSuccessfulSync || getLastSuccessfulSync());
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener(SYNC_STATUS_EVENT, onSync);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener(SYNC_STATUS_EVENT, onSync);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const dismissOnboarding = () => {
    localStorage.setItem("cm_onb_done", "1");
    setOnbDismissed(true);
  };

  useEffect(() => {
    const saved = JSON.parse(widgetSettingsSignature);
    const settings = dashboardWidgetSettings(saved);
    setCollapsedWidgets(Object.fromEntries(Object.entries(settings).map(([id, options]) => [id, Boolean(options.collapsed)])));
  }, [widgetSettingsSignature]);

  const updateWidgetCollapsed = async (id, collapsed) => {
    setCollapsedWidgets(current => ({ ...current, [id]: collapsed }));
    const current = dashboardWidgetSettings(user?.dashboard_widgets);
    try {
      await updateUser({ dashboard_widgets: { ...current, [id]: { ...current[id], collapsed } } });
    } catch {
      // The local UI state still makes the widget usable if a connection is temporarily unavailable.
    }
  };

  const isWidgetCollapsed = id => Boolean(collapsedWidgets[id]);

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

  const effectiveAccountGroups = grouped.length > 0 ? grouped : accountOptions;
  const flatAccounts = useMemo(
    () => effectiveAccountGroups.flatMap(b => b.accounts || []),
    [effectiveAccountGroups]
  );

  // Обогащаем сырую транзакцию (из /api/transactions) именами счёта/категории
  const enrichTx = useCallback((t) => {
    const acc = flatAccounts.find(a => a.id === t.account_id);
    const cat = t.category_id ? categories.find(c => c.id === t.category_id) : null;
    return {
      ...t,
      account_name: acc?.name || "—",
      category_name: cat?.name || null,
      category_icon: cat?.icon || null,
    };
  }, [flatAccounts, categories]);

  // Записи за выбранный день
  const fetchDay = useCallback(async (dateStr) => {
    const localItems = await listPendingTransactions(dateStr).catch(() => []);
    try {
      const res = await api.get("/api/transactions/", {
        params: { date_from: dateStr, date_to: dateStr, limit: 100 },
      });
      setDayTx([...localItems, ...(res.data.items || [])]);
    } catch {
      setDayTx(localItems);
    }
  }, []);

  const handleDeleteTx = async (tx) => {
    if (!confirm("Удалить запись?")) return;
    try {
      if (tx.pending_sync && tx.offline_mutation_id) {
        await removeOfflineMutation(tx.offline_mutation_id);
        setDayTx(current => current.filter(item => item.id !== tx.id));
        return;
      }
      await api.delete(`/api/transactions/${tx.id}`);
      fetchAll();
      fetchDay(selectedDate);
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось удалить");
    }
  };

  useEffect(() => {
    const reload = () => { fetchAll(); fetchDay(selectedDate); };
    window.addEventListener(TX_ADDED_EVENT, reload);
    return () => window.removeEventListener(TX_ADDED_EVENT, reload);
  }, [fetchAll, fetchDay, selectedDate]);

  useEffect(() => {
    const onLocalTransaction = (event) => {
      const transaction = event.detail?.transaction;
      if (!transaction) return;
      const localDate = String(transaction.date || "").slice(0, 10);
      if (localDate !== selectedDate) return;
      setDayTx(current => [transaction, ...current.filter(item => item.id !== transaction.id)]);
    };
    window.addEventListener(LOCAL_TRANSACTION_EVENT, onLocalTransaction);
    return () => window.removeEventListener(LOCAL_TRANSACTION_EVENT, onLocalTransaction);
  }, [selectedDate]);

  useEffect(() => { fetchAll(); }, [mainCurrency, fetchAll]);

  // Перезагрузка ленты дня при смене даты / валюты
  useEffect(() => { fetchDay(selectedDate); }, [selectedDate, mainCurrency, fetchDay]);

  const sym = currencySymbol(mainCurrency);

  // breakdown сумм по валютам по всем счетам (только учитываемые в балансе)
  const byCurrency = useMemo(() => aggregateByCurrency(grouped), [grouped]);
  const dashboardBalancesHidden = Boolean(user?.hide_dashboard_balances);
  const toggleDashboardBalances = () => updateUser({ hide_dashboard_balances: !dashboardBalancesHidden });

  // Гистограмма движения денег: 3 месяца, свежие сверху (текущий — «Этот месяц»)
  const trendDesc = useMemo(() => [...monthlyTrend].reverse(), [monthlyTrend]);

  // записи за выбранный день (для правой колонки), обогащённые именами
  const todayTx = useMemo(() => dayTx.map(enrichTx), [dayTx, enrichTx]);

  // Заголовок таба = выбранная дата
  const dayLabel = useMemo(() => {
    const d = new Date(selectedDate + "T00:00:00");
    const today = isToday(d.toISOString());
    const human = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    return today ? `Записи за ${human}` : `Записи · ${human}`;
  }, [selectedDate]);

  const recentlyChanged = dashboard?.recently_changed || [];

  const totalBalance = dashboard?.total_balance ?? null;
  const monthIncome = summary?.total_income ?? dashboard?.month_income ?? 0;
  const monthExpense = summary?.total_expense ?? dashboard?.month_expense ?? 0;
  const breakdownItems = summary?.category_breakdown || [];
  const breakdownTotal = breakdownType === "income"
    ? (summary?.total_income || 0)
    : (summary?.total_expense || 0);
  const maxCatTotal = breakdownItems.length ? breakdownItems[0].total : 0;
  const monthLabel = summary?.period_label ||
    `${RU_MONTHS_FULL[new Date().getMonth()]} ${new Date().getFullYear()}`;
  const breakdownColor = breakdownType === "income" ? "#167a4a" : "#c0432b";
  const breakdownWord = breakdownType === "income" ? "Доходы" : "Расходы";

  // Онбординг: показываем, пока нет счетов или нет операций (и не скрыт вручную)
  const hasAccounts = flatAccounts.length > 0;
  const hasTx = (dashboard?.recent_transactions?.length || 0) > 0
    || monthIncome > 0 || monthExpense > 0
    || (dashboard?.recently_changed?.length || 0) > 0;
  // The guided tour now handles first launch globally. Keep this compact card
  // only as a fallback for an unfinished local setup.
  const showOnboarding = !initialLoading && !accountsLoading && !onbDismissed
    && localStorage.getItem("cm_inline_onb") === "show" && (!hasAccounts || !hasTx);

  // Клик по категории → переход в Записи с фильтром (категория + тип + текущий месяц)
  const goToCategory = (catId) => {
    const { from, to } = currentMonthRange();
    const params = new URLSearchParams({ type: breakdownType, date_from: from, date_to: to });
    if (catId != null) params.set("category_id", String(catId));
    navigate(`/transactions?${params.toString()}`);
  };

  // Клик по счёту → Записи по этому счёту
  const goToAccount = (accId) => {
    navigate(`/transactions?account_id=${accId}`);
  };
  return { mainCurrency, user, navigate, dashboard, grouped, accountOptions, breakdownType, setBreakdownType, forecastDays, setForecastDays, balanceMode, setBalanceMode, recordsTab, setRecordsTab, categories, setCategories, editingTx, setEditingTx, adjustingBalance, setAdjustingBalance, selectedDate, setSelectedDate, widgetSettings, initialLoading, balanceLoading, trendLoading, accountsLoading, error, lastSyncedAt, isOnline, dismissOnboarding, updateWidgetCollapsed, isWidgetCollapsed, fetchAll, flatAccounts, fetchDay, handleDeleteTx, sym, byCurrency, dashboardBalancesHidden, toggleDashboardBalances, trendDesc, todayTx, dayLabel, recentlyChanged, totalBalance, breakdownItems, breakdownTotal, maxCatTotal, monthLabel, breakdownColor, breakdownWord, hasAccounts, hasTx, showOnboarding, goToCategory, goToAccount };
}
