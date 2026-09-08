import { useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { useState, useCallback, useEffect, useMemo } from "react";

import api from "../api/client";

import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { currencySymbol } from "../utils/money";

export function useAnnualReportController() {
  const navigate = useNavigate();
  const { mainCurrency } = useUser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [hoverCol, setHoverCol] = useState(null);
  const [mobileMonth, setMobileMonth] = useState(null);

  const onCellOver = (e) => {
    const cell = e.target.closest("td, th");
    if (cell) setHoverCol(cell.cellIndex + 1);
  };

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get(`/api/reports/annual?year=${year}`)
      .then(r => setData(r.data))
      .catch(() => setError("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => {
    fetchData();
    window.addEventListener(TX_ADDED_EVENT, fetchData);
    return () => window.removeEventListener(TX_ADDED_EVENT, fetchData);
  }, [fetchData]);
  useEffect(() => { fetchData(); }, [mainCurrency, fetchData]);

  const sym = currencySymbol(data?.main_currency || mainCurrency);

  // Фильтр пустых строк
  const hasRowData = (row) =>
    Math.abs(row.total) > 0.005 || row.monthly.some(v => Math.abs(v) > 0.005);
  const filterRows = (rows) => hideEmpty
    ? rows.filter(hasRowData)
    : rows;

  const incomeRows = data ? filterRows(data.income) : [];
  const expenseRows = data ? filterRows(data.expense) : [];

  // Колонки-месяцы масштабируются по данным: показываем только те месяцы,
  // где есть хоть какой-то доход или расход (итоги покрывают все строки).
  const visibleMonths = useMemo(() => {
    if (!data) return [...Array(12).keys()];
    const idx = [];
    for (let i = 0; i < 12; i++) {
      if (Math.abs(data.income_totals[i]) > 0.005 || Math.abs(data.expense_totals[i]) > 0.005) {
        idx.push(i);
      }
    }
    return idx.length ? idx : [...Array(12).keys()];
  }, [data]);
  return { navigate, mainCurrency, year, setYear, data, loading, error, hideEmpty, setHideEmpty, hoverCol, setHoverCol, mobileMonth, setMobileMonth, onCellOver, sym, incomeRows, expenseRows, visibleMonths };
}
