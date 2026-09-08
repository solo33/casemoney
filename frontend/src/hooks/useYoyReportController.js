import { useUser } from "../contexts/UserContext";
import { useState, useEffect, useCallback, useMemo } from "react";

import api from "../api/client";

import { currencySymbol } from "../utils/money";

export function useYoyReportController() {
  const { mainCurrency } = useUser();
  const [type, setType] = useState("expense");
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selAccounts, setSelAccounts] = useState(new Set());   // пусто = все
  const [selCategories, setSelCategories] = useState(new Set());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoverCol, setHoverCol] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const onCellOver = (e) => {
    const cell = e.target.closest("td, th");
    if (cell) setHoverCol(cell.cellIndex + 1);
  };

  useEffect(() => {
    Promise.all([api.get("/api/accounts/"), api.get("/api/categories/")])
      .then(([a, c]) => { setAccounts(a.data); setCategories(c.data); })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = { type };
    if (selAccounts.size) params.account_ids = [...selAccounts].join(",");
    if (selCategories.size) params.category_ids = [...selCategories].join(",");
    api.get("/api/reports/yoy", { params })
      .then(r => setData(r.data))
      .catch(() => setError("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [type, selAccounts, selCategories]);

  useEffect(() => { fetchData(); }, [fetchData, mainCurrency]);

  const sym = currencySymbol(data?.main_currency || mainCurrency);
  const rootCategories = useMemo(
    () => categories.filter(c => !c.parent_id && c.type === type),
    [categories, type],
  );

  const toggle = (set, setter, id) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const accentColor = type === "income" ? "#0f6a40" : "#a93421";
  return { mainCurrency, type, setType, accounts, selAccounts, setSelAccounts, selCategories, setSelCategories, data, loading, error, hoverCol, setHoverCol, filtersOpen, setFiltersOpen, onCellOver, sym, rootCategories, toggle, accentColor };
}
