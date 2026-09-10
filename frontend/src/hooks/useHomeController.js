import { useUser } from "../contexts/UserContext";
import { useNavigate } from "react-router-dom";
import { useState, useMemo, useEffect, useCallback } from "react";

import { normalizeDashboardWidgets as dashboardWidgetSettings } from "../utils/dashboardWidgets";
import { getLastSuccessfulSync, SYNC_STATUS_EVENT } from "../services/syncStatus";

import { useHomeData } from "./useHomeData";
import api from "../api/client";

import { listPendingTransactions, removeOfflineMutation, LOCAL_TRANSACTION_EVENT } from "../services/offlineMutations";

import { TX_ADDED_EVENT } from "../components/QuickAddFab";

import { currencySymbol } from "../utils/money";
import { isoToday, aggregateByCurrency, isToday, RU_MONTHS_FULL, currentMonthRange } from "../utils/homeView";

export function useHomeController() {
  const { mainCurrency, user, updateUser } = useUser();
  const navigate = useNavigate();
  const [breakdownType, setBreakdownType] = useState("expense"); // expense | income
  const [forecastDays, setForecastDays] = useState(30);
  const [balanceMode, setBalanceMode] = useState("actual"); // actual | planned
  const flowMonth = new Date().getMonth() + 1;
  const flowYear = new Date().getFullYear();
  const { dashboard, grouped, accountOptions, summary, monthlyTrend, categories, initialLoading, balanceLoading, trendLoading, accountsLoading, error, setCategories, setError, fetchAll } = useHomeData({ breakdownType, flowMonth, flowYear, forecastDays });
  const [recordsTab, setRecordsTab] = useState("today"); // today | changed
  const [editingTx, setEditingTx] = useState(null);
  const [adjustingBalance, setAdjustingBalance] = useState(null);
  const [selectedDate, setSelectedDate] = useState(isoToday()); // РґР°С‚Р° С„РѕСЂРјС‹ = РґР°С‚Р° Р»РµРЅС‚С‹
  const [dayTx, setDayTx] = useState([]);                       // Р·Р°РїРёСЃРё Р·Р° РІС‹Р±СЂР°РЅРЅС‹Р№ РґРµРЅСЊ
  const [onbDismissed, setOnbDismissed] = useState(() => localStorage.getItem("cm_onb_done") === "1");
  const widgetSettings = useMemo(() => dashboardWidgetSettings(user?.dashboard_widgets), [user?.dashboard_widgets]);
  const widgetSettingsSignature = useMemo(() => JSON.stringify(user?.dashboard_widgets || {}), [user?.dashboard_widgets]);
  const [collapsedWidgets, setCollapsedWidgets] = useState(() => Object.fromEntries(
    Object.entries(dashboardWidgetSettings()).map(([id, options]) => [id, options.collapsed]),
  ));
  const [lastSyncedAt, setLastSyncedAt] = useState(() => getLastSuccessfulSync());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

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

  const effectiveAccountGroups = grouped.length > 0 ? grouped : accountOptions;
  const flatAccounts = useMemo(
    () => effectiveAccountGroups.flatMap(b => b.accounts || []),
    [effectiveAccountGroups]
  );

  // РћР±РѕРіР°С‰Р°РµРј СЃС‹СЂСѓСЋ С‚СЂР°РЅР·Р°РєС†РёСЋ (РёР· /api/transactions) РёРјРµРЅР°РјРё СЃС‡С‘С‚Р°/РєР°С‚РµРіРѕСЂРёРё
  const enrichTx = useCallback((t) => {
    const acc = flatAccounts.find(a => a.id === t.account_id);
    const cat = t.category_id ? categories.find(c => c.id === t.category_id) : null;
    return {
      ...t,
      account_name: acc?.name || "вЂ”",
      category_name: cat?.name || null,
      category_icon: cat?.icon || null,
    };
  }, [flatAccounts, categories]);

  // Р—Р°РїРёСЃРё Р·Р° РІС‹Р±СЂР°РЅРЅС‹Р№ РґРµРЅСЊ
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
    if (!confirm("РЈРґР°Р»РёС‚СЊ Р·Р°РїРёСЃСЊ?")) return;
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
      setError(e.response?.data?.detail || "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ");
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

  // РџРµСЂРµР·Р°РіСЂСѓР·РєР° Р»РµРЅС‚С‹ РґРЅСЏ РїСЂРё СЃРјРµРЅРµ РґР°С‚С‹ / РІР°Р»СЋС‚С‹
  useEffect(() => { fetchDay(selectedDate); }, [selectedDate, mainCurrency, fetchDay]);

  const sym = currencySymbol(mainCurrency);

  // breakdown СЃСѓРјРј РїРѕ РІР°Р»СЋС‚Р°Рј РїРѕ РІСЃРµРј СЃС‡РµС‚Р°Рј (С‚РѕР»СЊРєРѕ СѓС‡РёС‚С‹РІР°РµРјС‹Рµ РІ Р±Р°Р»Р°РЅСЃРµ)
  const byCurrency = useMemo(() => aggregateByCurrency(grouped), [grouped]);
  const dashboardBalancesHidden = Boolean(user?.hide_dashboard_balances);
  const toggleDashboardBalances = () => updateUser({ hide_dashboard_balances: !dashboardBalancesHidden });

  // Р“РёСЃС‚РѕРіСЂР°РјРјР° РґРІРёР¶РµРЅРёСЏ РґРµРЅРµРі: 3 РјРµСЃСЏС†Р°, СЃРІРµР¶РёРµ СЃРІРµСЂС…Сѓ (С‚РµРєСѓС‰РёР№ вЂ” В«Р­С‚РѕС‚ РјРµСЃСЏС†В»)
  const trendDesc = useMemo(() => [...monthlyTrend].reverse(), [monthlyTrend]);

  // Р·Р°РїРёСЃРё Р·Р° РІС‹Р±СЂР°РЅРЅС‹Р№ РґРµРЅСЊ (РґР»СЏ РїСЂР°РІРѕР№ РєРѕР»РѕРЅРєРё), РѕР±РѕРіР°С‰С‘РЅРЅС‹Рµ РёРјРµРЅР°РјРё
  const todayTx = useMemo(() => dayTx.map(enrichTx), [dayTx, enrichTx]);

  // Р—Р°РіРѕР»РѕРІРѕРє С‚Р°Р±Р° = РІС‹Р±СЂР°РЅРЅР°СЏ РґР°С‚Р°
  const dayLabel = useMemo(() => {
    const d = new Date(selectedDate + "T00:00:00");
    const today = isToday(d.toISOString());
    const human = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    return today ? `Р—Р°РїРёСЃРё Р·Р° ${human}` : `Р—Р°РїРёСЃРё В· ${human}`;
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
  const breakdownWord = breakdownType === "income" ? "Р”РѕС…РѕРґС‹" : "Р Р°СЃС…РѕРґС‹";

  // РћРЅР±РѕСЂРґРёРЅРі: РїРѕРєР°Р·С‹РІР°РµРј, РїРѕРєР° РЅРµС‚ СЃС‡РµС‚РѕРІ РёР»Рё РЅРµС‚ РѕРїРµСЂР°С†РёР№ (Рё РЅРµ СЃРєСЂС‹С‚ РІСЂСѓС‡РЅСѓСЋ)
  const hasAccounts = flatAccounts.length > 0;
  const hasTx = (dashboard?.recent_transactions?.length || 0) > 0
    || monthIncome > 0 || monthExpense > 0
    || (dashboard?.recently_changed?.length || 0) > 0;
  // The guided tour now handles first launch globally. Keep this compact card
  // only as a fallback for an unfinished local setup.
  const showOnboarding = !initialLoading && !accountsLoading && !onbDismissed
    && localStorage.getItem("cm_inline_onb") === "show" && (!hasAccounts || !hasTx);

  // РљР»РёРє РїРѕ РєР°С‚РµРіРѕСЂРёРё в†’ РїРµСЂРµС…РѕРґ РІ Р—Р°РїРёСЃРё СЃ С„РёР»СЊС‚СЂРѕРј (РєР°С‚РµРіРѕСЂРёСЏ + С‚РёРї + С‚РµРєСѓС‰РёР№ РјРµСЃСЏС†)
  const goToCategory = (catId) => {
    const { from, to } = currentMonthRange();
    const params = new URLSearchParams({ type: breakdownType, date_from: from, date_to: to });
    if (catId != null) params.set("category_id", String(catId));
    navigate(`/transactions?${params.toString()}`);
  };

  // РљР»РёРє РїРѕ СЃС‡С‘С‚Сѓ в†’ Р—Р°РїРёСЃРё РїРѕ СЌС‚РѕРјСѓ СЃС‡С‘С‚Сѓ
  const goToAccount = (accId) => {
    navigate(`/transactions?account_id=${accId}`);
  };
  return { mainCurrency, user, navigate, dashboard, grouped, accountOptions, breakdownType, setBreakdownType, forecastDays, setForecastDays, balanceMode, setBalanceMode, recordsTab, setRecordsTab, categories, setCategories, editingTx, setEditingTx, adjustingBalance, setAdjustingBalance, selectedDate, setSelectedDate, widgetSettings, initialLoading, balanceLoading, trendLoading, accountsLoading, error, lastSyncedAt, isOnline, dismissOnboarding, updateWidgetCollapsed, isWidgetCollapsed, fetchAll, flatAccounts, fetchDay, handleDeleteTx, sym, byCurrency, dashboardBalancesHidden, toggleDashboardBalances, trendDesc, todayTx, dayLabel, recentlyChanged, totalBalance, breakdownItems, breakdownTotal, maxCatTotal, monthLabel, breakdownColor, breakdownWord, hasAccounts, hasTx, showOnboarding, goToCategory, goToAccount };
}
