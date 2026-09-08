import { useUser } from "../contexts/UserContext";
import { useState, useCallback, useEffect } from "react";

import api from "../api/client";

import { NAMES } from "../utils/currenciesView";

export function useCurrenciesController() {
  const { mainCurrency, updateMainCurrency } = useUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newCurrency, setNewCurrency] = useState("");
  const [savingId, setSavingId] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const res = await api.get("/api/currencies/");
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка загрузки валют");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchAll(); }, [mainCurrency, fetchAll]);

  const handleChangeMain = async (e) => {
    const cur = e.target.value;
    try {
      await updateMainCurrency(cur);
      // POST /api/currencies на случай если новой main ещё нет в списке user_currencies
      try { await api.post("/api/currencies/", { currency: cur }); } catch { /* уже есть */ }
      fetchAll();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось обновить");
    }
  };

  const saveItem = async (uc, patch) => {
    setSavingId(uc.id);
    try {
      await api.patch(`/api/currencies/${uc.id}`, patch);
      await fetchAll();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка сохранения");
    } finally {
      setSavingId(null);
    }
  };

  const deleteItem = async (uc) => {
    if (uc.currency === data.main_currency) {
      setError("Нельзя удалить основную валюту");
      return;
    }
    if (!confirm(`Удалить валюту ${uc.currency} из списка?`)) return;
    try {
      await api.delete(`/api/currencies/${uc.id}`);
      fetchAll();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось удалить");
    }
  };

  const addCurrency = async () => {
    if (!newCurrency) return;
    try {
      await api.post("/api/currencies/", {
        currency: newCurrency,
        display_name: NAMES[newCurrency] || newCurrency,
      });
      setNewCurrency("");
      fetchAll();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось добавить");
    }
  };
  return { data, loading, error, setError, newCurrency, setNewCurrency, savingId, handleChangeMain, saveItem, deleteItem, addCurrency };
}
