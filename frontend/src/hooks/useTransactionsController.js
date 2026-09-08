import { useUser } from "../contexts/UserContext";
import { useSearchParams } from "react-router-dom";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

import api from "../api/client";

import { entryAccountGroups } from "../components/AccountOptions";
import { preferredAccountCurrency, accountCurrencies as currenciesForAccount, isSameTransferCurrency, transferDisplayRate, swapTransferFields } from "../utils/transactionForm";
import { cachedAccountsAndCategories, saveReferenceData } from "../services/offlineReferenceData";

import { formatMoney, currencySymbol } from "../utils/money";

import { TX_ADDED_EVENT } from "../components/QuickAddFab";

import useTransferQuote from "./useTransferQuote";

import { idempotencyKeyFor, clearIdempotencyKey } from "../utils/idempotency";
import { submitOrQueueTransaction } from "../services/offlineMutations";

import { isoToday, PAGE_SIZE, dateRangeForPreset, toLocalIsoDate } from "../utils/transactionsView";

export function useTransactionsController() {
  const { user } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ items: [], total: 0 });
  const [accounts, setAccounts] = useState([]);
  const [accountGroups, setAccountGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagReport, setTagReport] = useState(null);
  const [frequentCategories, setFrequentCategories] = useState([]);
  const [categorySuggestion, setCategorySuggestion] = useState(null);
  const [transferSuggestions, setTransferSuggestions] = useState([]);
  const [transferFees, setTransferFees] = useState({});
  const [matchingTransferId, setMatchingTransferId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null);    // tx id или 'new'
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const createRequestRef = useRef(null);

  // Фильтры — инициализируются из URL (для глубоких ссылок из Annual)
  const [filters, setFilters] = useState(() => ({
    account_id: searchParams.get("account_id") || "",
    currency: searchParams.get("currency") || "",
    category_id: searchParams.get("category_id") || "",
    tag_id: searchParams.get("tag_id") || "",
    type: searchParams.get("type") || "",
    date_from: searchParams.get("date_from") || "",
    date_to: searchParams.get("date_to") || "",
    q: searchParams.get("q") || "",
  }));
  const [page, setPage] = useState(0);

  // При смене URL — обновим фильтры (например, переход с Annual)
  useEffect(() => {
    setFilters({
      account_id: searchParams.get("account_id") || "",
      currency: searchParams.get("currency") || "",
      category_id: searchParams.get("category_id") || "",
      tag_id: searchParams.get("tag_id") || "",
      type: searchParams.get("type") || "",
      date_from: searchParams.get("date_from") || "",
      date_to: searchParams.get("date_to") || "",
      q: searchParams.get("q") || "",
    });
    setPage(0);
  }, [searchParams]);

  // Форма создания
  const [newTx, setNewTx] = useState({
    amount: "", type: "expense", currency: "",
    description: "", account_id: "", category_id: "", to_account_id: "",
    tag_ids: [],
    to_amount: "", to_currency: "", fee_amount: "", fee_category_id: "",
    date: isoToday(),
  });

  useEffect(() => {
    if (newTx.type === "transfer" || newTx.category_id || newTx.description.trim().length < 2 || navigator.onLine === false) {
      setCategorySuggestion(null);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get("/api/automation/category-suggestion", {
          params: { description: newTx.description, transaction_type: newTx.type },
        });
        if (!cancelled) setCategorySuggestion(response.data || null);
      } catch {
        if (!cancelled) setCategorySuggestion(null);
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [newTx.description, newTx.type, newTx.category_id]);

  const applyCategorySuggestion = () => {
    if (!categorySuggestion) return;
    setNewTx(current => ({ ...current, category_id: String(categorySuggestion.category_id) }));
    setCategorySuggestion(null);
  };

  const saveSuggestedCategoryRule = async () => {
    if (!categorySuggestion || newTx.description.trim().length < 2) return;
    try {
      await api.post("/api/automation/rules", {
        pattern: newTx.description,
        category_id: categorySuggestion.category_id,
      });
      setNotice(`Правило «${newTx.description.trim()} → ${categorySuggestion.category_name}» сохранено.`);
    } catch (requestError) {
      setNotice(requestError.response?.data?.detail || "Не удалось сохранить правило.");
    }
  };

  const loadAccounts = useCallback(async () => {
    const applyOptions = (groups, nextCategories) => {
      const flatAccounts = groups.flatMap(bucket => bucket.accounts || []);
      const visibleGroups = entryAccountGroups(groups);
      const visibleAccounts = visibleGroups.flatMap(bucket => bucket.accounts || []);
      setAccountGroups(groups);
      setAccounts(flatAccounts);
      setCategories(nextCategories);
      if (visibleAccounts.length > 0 && !newTx.account_id) {
        const first = visibleAccounts[0];
        setNewTx(t => ({
          ...t,
          account_id: String(first.id),
          currency: preferredAccountCurrency(first) || "RUB",
        }));
      }
    };

    const cached = cachedAccountsAndCategories();
    if (cached) applyOptions(cached.accountGroups, cached.categories);
    if (navigator.onLine === false) return;

    try {
      const [acc, cat] = await Promise.all([
        api.get("/api/accounts/grouped", { params: { convert_balances: false } }),
        api.get("/api/categories/"),
      ]);
      const groups = acc.data || [];
      const nextCategories = cat.data || [];
      applyOptions(groups, nextCategories);
      saveReferenceData({ accountGroups: groups, categories: nextCategories });
    } catch (error) {
      if (!cached) throw error;
    }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await api.get("/api/transactions/", { params });
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => {
    api.get("/api/tags/").then(response => setTags(response.data || [])).catch(() => setTags([]));
  }, []);
  useEffect(() => {
    if (!filters.tag_id) { setTagReport(null); return; }
    api.get(`/api/tags/${filters.tag_id}/report`).then(response => setTagReport(response.data)).catch(() => setTagReport(null));
  }, [filters.tag_id]);
  useEffect(() => { loadTransactions(); }, [loadTransactions]);
  const showTransferSuggestions = Boolean(user?.show_transfer_suggestions);
  const loadTransferSuggestions = useCallback(() => {
    if (!showTransferSuggestions) {
      setTransferSuggestions([]);
      return;
    }
    api.get("/api/transactions/transfer-suggestions")
      .then(response => setTransferSuggestions(response.data || []))
      .catch(() => setTransferSuggestions([]));
  }, [showTransferSuggestions]);
  useEffect(() => { loadTransferSuggestions(); }, [loadTransferSuggestions]);
  useEffect(() => { setSelectedIds([]); setBulkCategoryId(""); }, [filters, page]);
  useEffect(() => {
    if (newTx.type === "transfer") { setFrequentCategories([]); return; }
    api.get("/api/transactions/frequent-categories", { params: { tx_type: newTx.type } })
      .then(response => setFrequentCategories(response.data || []))
      .catch(() => setFrequentCategories([]));
  }, [newTx.type]);

  const confirmTransferSuggestion = async (suggestion) => {
    const message = `Связать списание ${formatMoney(suggestion.amount)} ${currencySymbol(suggestion.currency)} со счёта «${suggestion.account_name}» и поступление на «${suggestion.to_account_name}» как перевод?`;
    if (!window.confirm(message)) return;
    setMatchingTransferId(suggestion.expense_id);
    try {
      const feeCategoryId = transferFees[suggestion.expense_id];
      await api.post(`/api/transactions/${suggestion.expense_id}/confirm-transfer-match`, {
        income_transaction_id: suggestion.income_id,
        ...(feeCategoryId ? { fee_category_id: Number(feeCategoryId) } : {}),
      });
      setNotice("Операции объединены в перевод между своими счетами.");
      loadTransactions();
      loadAccounts();
      loadTransferSuggestions();
    } catch (requestError) {
      setNotice(requestError.response?.data?.detail || "Не удалось сопоставить операции.");
    } finally {
      setMatchingTransferId(null);
    }
  };

  // Reload on FAB add
  useEffect(() => {
    const onAdded = () => { setPage(0); loadTransactions(); };
    window.addEventListener(TX_ADDED_EVENT, onAdded);
    return () => window.removeEventListener(TX_ADDED_EVENT, onAdded);
  }, [loadTransactions]);

  // Когда меняется выбранный счёт в форме создания — подкорректировать валюту
  useEffect(() => {
    if (!newTx.account_id || !accounts.length) return;
    const acc = accounts.find(a => String(a.id) === String(newTx.account_id));
    if (!acc?.balances?.length) return;
    const currency = preferredAccountCurrency(acc, newTx.currency);
    if (currency !== newTx.currency) {
      setNewTx(t => ({ ...t, currency }));
    }
  }, [newTx.account_id, accounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(newTx.account_id)),
    [accounts, newTx.account_id]
  );
  const newTxCurrencies = currenciesForAccount(selectedAccount);
  const selectedTargetAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(newTx.to_account_id)),
    [accounts, newTx.to_account_id]
  );
  const newTxTargetCurrencies = currenciesForAccount(selectedTargetAccount);
  const sameNewTransferCurrency = isSameTransferCurrency(newTx.type, newTx.currency, newTx.to_currency);

  useEffect(() => {
    if (newTx.type !== "transfer" || !selectedTargetAccount) return;
    if (!newTxTargetCurrencies.includes(newTx.to_currency)) {
      setNewTx(current => ({ ...current, to_currency: newTxTargetCurrencies[0] || "", to_amount: "" }));
    }
  }, [newTx.type, selectedTargetAccount, newTxTargetCurrencies.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyNewTransferQuote = useCallback(toAmount => {
    setNewTx(current => current.to_amount === toAmount ? current : { ...current, to_amount: toAmount });
  }, []);
  const { loading: newQuoteLoading } = useTransferQuote({
    enabled: newTx.type === "transfer" && !sameNewTransferCurrency,
    amount: newTx.amount,
    fromCurrency: newTx.currency,
    toCurrency: newTx.to_currency,
    onQuote: applyNewTransferQuote,
  });
  const newDisplayedRate = transferDisplayRate({ amount: newTx.amount, toAmount: newTx.to_amount });

  const swapNewTransferAccounts = () => {
    if (!newTx.account_id || !newTx.to_account_id) return;
    setNewTx(current => swapTransferFields(current, sameNewTransferCurrency));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (newTx.type === "transfer") {
        if (!newTx.to_account_id) { setError("Выберите счёт-получатель"); return; }
        if (String(newTx.to_account_id) === String(newTx.account_id)) {
          setError("Счёт-источник и получатель совпадают"); return;
        }
        if (!newTx.to_currency) { setError("Выберите валюту счёта-получателя"); return; }
        if (!sameNewTransferCurrency && !(parseFloat(newTx.to_amount) > 0)) {
          setError("Введите сумму зачисления"); return;
        }
      }
      const payload = {
        amount: parseFloat(newTx.amount),
        type: newTx.type,
        currency: newTx.currency || undefined,
        description: newTx.description || undefined,
        account_id: parseInt(newTx.account_id),
        category_id: newTx.type === "transfer" || !newTx.category_id ? undefined : parseInt(newTx.category_id),
        to_account_id: newTx.type === "transfer" ? parseInt(newTx.to_account_id) : undefined,
        to_amount: newTx.type === "transfer" ? parseFloat(sameNewTransferCurrency ? newTx.amount : newTx.to_amount) : undefined,
        to_currency: newTx.type === "transfer" ? newTx.to_currency : undefined,
        fee_amount: newTx.type === "transfer" && Number(newTx.fee_amount) > 0 ? parseFloat(newTx.fee_amount) : undefined,
        fee_category_id: newTx.type === "transfer" && newTx.fee_category_id ? parseInt(newTx.fee_category_id) : undefined,
        tag_ids: newTx.type === "transfer" ? [] : newTx.tag_ids.map(Number),
      };
      if (newTx.date) payload.date = new Date(newTx.date).toISOString();
      const requestKey = idempotencyKeyFor(createRequestRef, payload);
      const result = await submitOrQueueTransaction(payload, requestKey);
      clearIdempotencyKey(createRequestRef);
      setNewTx(t => ({ ...t, amount: "", description: "", category_id: "", tag_ids: [], fee_amount: "", fee_category_id: "" }));
      setEditing(null);
      setPage(0);
      if (!result.queued) {
        loadTransactions();
        loadAccounts(); // обновим балансы
      } else {
        setError("Запись сохранена на устройстве и отправится автоматически при появлении связи");
      }
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка создания");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Удалить транзакцию?")) return;
    try {
      await api.delete(`/api/transactions/${id}`);
      loadTransactions();
      loadAccounts();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка удаления");
    }
  };

  const selectedTransactions = data.items.filter(item => selectedIds.includes(item.id));
  const selectedType = selectedTransactions.length ? selectedTransactions[0].type : null;
  const canBulkCategorize = selectedTransactions.length > 0
    && selectedTransactions.every(item => item.type === selectedType)
    && selectedType !== "transfer";
  const bulkCategories = selectedType ? categories.filter(item => item.type === selectedType) : [];
  const toggleSelection = (id) => setSelectedIds(current => current.includes(id)
    ? current.filter(item => item !== id)
    : [...current, id]);
  const toggleAllPage = () => setSelectedIds(current => {
    const ids = data.items.map(item => item.id);
    return ids.length > 0 && ids.every(id => current.includes(id)) ? [] : ids;
  });
  const applyBulkCategory = async () => {
    if (!canBulkCategorize || !bulkCategoryId) return;
    setBulkSaving(true);
    setError(null);
    try {
      const response = await api.patch("/api/transactions/bulk/category", {
        transaction_ids: selectedIds,
        category_id: Number(bulkCategoryId),
      });
      setSelectedIds([]);
      setBulkCategoryId("");
      setNotice(`Категория обновлена у ${response.data.updated} ${response.data.updated === 1 ? "записи" : "записей"}.`);
      loadTransactions();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Не удалось изменить категории.");
    } finally { setBulkSaving(false); }
  };

  const accountName = (id) => accounts.find(a => a.id === id)?.name || id;
  const categoryNameFor = (id) => {
    const c = categories.find(c => c.id === id);
    if (!c) return "—";
    const parent = c.parent_id ? categories.find(p => p.id === c.parent_id) : null;
    return parent ? `${parent.name} → ${c.name}` : c.name;
  };
  const formatDate = (iso) => new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
  const formatDateTime = (iso) => new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  const filteredCategoriesForCreate = newTx.type === "transfer"
    ? categories : categories.filter(c => c.type === newTx.type);

  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  const showingFrom = data.total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min((page + 1) * PAGE_SIZE, data.total);

  const setFilter = (key, value) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    setPage(0);
    // отражаем активные фильтры в URL
    const params = {};
    Object.entries(next).forEach(([k, v]) => { if (v) params[k] = v; });
    setSearchParams(params, { replace: true });
  };

  const applyDatePreset = (preset) => {
    const range = dateRangeForPreset(preset);
    const next = {
      ...filters,
      date_from: toLocalIsoDate(range.from),
      date_to: toLocalIsoDate(range.to),
    };
    setFilters(next);
    setPage(0);
    const params = {};
    Object.entries(next).forEach(([key, value]) => { if (value) params[key] = value; });
    setSearchParams(params, { replace: true });
  };

  const resetFilters = () => {
    setFilters({ account_id: "", currency: "", category_id: "", tag_id: "", type: "", date_from: "", date_to: "", q: "" });
    setPage(0);
    setSearchParams({}, { replace: true });
  };

  const hasFilters = Object.values(filters).some(v => v);
  return { user, data, accounts, accountGroups, categories, setCategories, tags, setTags, tagReport, frequentCategories, categorySuggestion, transferSuggestions, transferFees, setTransferFees, matchingTransferId, loading, error, setError, notice, setNotice, editing, setEditing, filtersOpen, setFiltersOpen, selectedIds, setSelectedIds, bulkCategoryId, setBulkCategoryId, bulkSaving, filters, page, setPage, newTx, setNewTx, applyCategorySuggestion, saveSuggestedCategoryRule, loadAccounts, loadTransactions, showTransferSuggestions, confirmTransferSuggestion, newTxCurrencies, newTxTargetCurrencies, sameNewTransferCurrency, newQuoteLoading, newDisplayedRate, swapNewTransferAccounts, handleCreate, handleDelete, canBulkCategorize, bulkCategories, toggleSelection, toggleAllPage, applyBulkCategory, accountName, categoryNameFor, formatDate, formatDateTime, filteredCategoriesForCreate, totalPages, showingFrom, showingTo, setFilter, applyDatePreset, resetFilters, hasFilters };
}
