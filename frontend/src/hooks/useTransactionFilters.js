import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { dateRangeForPreset, toLocalIsoDate } from "../utils/transactionsView";

export function useTransactionFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  return { filters, page, setPage, setFilter, applyDatePreset, resetFilters, hasFilters };
}
