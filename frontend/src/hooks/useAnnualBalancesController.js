import { useUser } from "../contexts/UserContext";
import { useState, useCallback, useEffect, useMemo } from "react";

import api from "../api/client";

import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { currencySymbol } from "../utils/money";

export function useAnnualBalancesController() {
  const { mainCurrency } = useUser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoverCol, setHoverCol] = useState(null);
  const [mobileMonth, setMobileMonth] = useState(-1);

  // Делегирование: подсветка колонки по nth-child наведённой ячейки
  const onCellOver = (e) => {
    const cell = e.target.closest("td, th");
    if (cell) setHoverCol(cell.cellIndex + 1);
  };

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get(`/api/reports/annual-balances?year=${year}`)
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

  // Показываем только месяцы, где есть ненулевой остаток хотя бы по одному счёту
  const visibleMonths = useMemo(() => {
    if (!data) return [...Array(12).keys()];
    const idx = [];
    for (let i = 0; i < 12; i++) {
      if (Math.abs(data.total_monthly[i]) > 0.5) idx.push(i);
    }
    return idx.length ? idx : [...Array(12).keys()];
  }, [data]);
  return { mainCurrency, year, setYear, data, loading, error, hoverCol, setHoverCol, mobileMonth, setMobileMonth, onCellOver, sym, visibleMonths };
}
