import { useTransactionBulkCategory } from "./useTransactionBulkCategory";
import { useTransactionTransferSuggestions } from "./useTransactionTransferSuggestions";
import { useTransactionCategorySuggestions } from "./useTransactionCategorySuggestions";
import { useUser } from "../contexts/UserContext";
import { useTransactionFilters } from "./useTransactionFilters";
import { useState, useRef, useEffect, useCallback } from "react";

import api from "../api/client";

import { entryAccountGroups } from "../components/AccountOptions";
import { preferredAccountCurrency } from "../utils/transactionForm";
import { cachedAccountsAndCategories, saveReferenceData } from "../services/offlineReferenceData";


import { TX_ADDED_EVENT } from "../components/QuickAddFab";

import { useTransactionTransferDraft } from "./useTransactionTransferDraft";

import { idempotencyKeyFor, clearIdempotencyKey } from "../utils/idempotency";
import { submitOrQueueTransaction } from "../services/offlineMutations";

import { isoToday, PAGE_SIZE } from "../utils/transactionsView";

export function useTransactionsController() {
  const { user } = useUser();
  const { filters, page, setPage, setFilter, applyDatePreset, resetFilters, hasFilters } = useTransactionFilters();
  const [data, setData] = useState({ items: [], total: 0 });
  const [accounts, setAccounts] = useState([]);
  const [accountGroups, setAccountGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagReport, setTagReport] = useState(null);
  const [frequentCategories, setFrequentCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null);    // tx id или 'new'
  const [filtersOpen, setFiltersOpen] = useState(false);
  const createRequestRef = useRef(null);

  // Форма создания
  const [newTx, setNewTx] = useState({
    amount: "", type: "expense", currency: "",
    description: "", account_id: "", category_id: "", to_account_id: "",
    tag_ids: [],
    to_amount: "", to_currency: "", fee_amount: "", fee_category_id: "",
    date: isoToday(),
  });

  const { categorySuggestion, applyCategorySuggestion, saveSuggestedCategoryRule } = useTransactionCategorySuggestions(newTx, setNewTx, setNotice);

  const loadAccounts = useCallback(async () => {
    const applyOptions = (groups, nextCategories) => {
      const flatAccounts = groups.flatMap(bucket => bucket.accounts || []);
      const visibleGroups = entryAccountGroups(groups);
      const visibleAccounts = visibleGroups.flatMap(bucket => bucket.accounts || []);
      setAccountGroups(groups);
      setAccounts(flatAccounts);
      setCategories(nextCategories);
      if (visibleAccounts.length > 0) {
        const first = visibleAccounts[0];
        setNewTx(t => t.account_id ? t : ({
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
  }, []);

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
  useEffect(() => {
    if (newTx.type === "transfer") { setFrequentCategories([]); return; }
    api.get("/api/transactions/frequent-categories", { params: { tx_type: newTx.type } })
      .then(response => setFrequentCategories(response.data || []))
      .catch(() => setFrequentCategories([]));
  }, [newTx.type]);

  const { showTransferSuggestions, transferSuggestions, transferFees, setTransferFees, matchingTransferId, confirmTransferSuggestion } = useTransactionTransferSuggestions(user, loadTransactions, loadAccounts, setNotice);

  // Reload on FAB add
  useEffect(() => {
    const onAdded = () => { setPage(0); loadTransactions(); };
    window.addEventListener(TX_ADDED_EVENT, onAdded);
    return () => window.removeEventListener(TX_ADDED_EVENT, onAdded);
  }, [loadTransactions, setPage]);

  const { newTxCurrencies, newTxTargetCurrencies, sameNewTransferCurrency, newQuoteLoading, newDisplayedRate, swapNewTransferAccounts } = useTransactionTransferDraft(newTx, setNewTx, accounts);

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

  const { selectedIds, setSelectedIds, bulkCategoryId, setBulkCategoryId, bulkSaving, canBulkCategorize, bulkCategories, toggleSelection, toggleAllPage, applyBulkCategory } = useTransactionBulkCategory({ data, categories, filters, page, loadTransactions, setError, setNotice });

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

  return { user, data, accounts, accountGroups, categories, setCategories, tags, setTags, tagReport, frequentCategories, categorySuggestion, transferSuggestions, transferFees, setTransferFees, matchingTransferId, loading, error, setError, notice, setNotice, editing, setEditing, filtersOpen, setFiltersOpen, selectedIds, setSelectedIds, bulkCategoryId, setBulkCategoryId, bulkSaving, filters, page, setPage, newTx, setNewTx, applyCategorySuggestion, saveSuggestedCategoryRule, loadAccounts, loadTransactions, showTransferSuggestions, confirmTransferSuggestion, newTxCurrencies, newTxTargetCurrencies, sameNewTransferCurrency, newQuoteLoading, newDisplayedRate, swapNewTransferAccounts, handleCreate, handleDelete, canBulkCategorize, bulkCategories, toggleSelection, toggleAllPage, applyBulkCategory, accountName, categoryNameFor, formatDate, formatDateTime, filteredCategoriesForCreate, totalPages, showingFrom, showingTo, setFilter, applyDatePreset, resetFilters, hasFilters };
}
