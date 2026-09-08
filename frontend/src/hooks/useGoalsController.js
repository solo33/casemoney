import { useUser } from "../contexts/UserContext";
import { useState, useCallback, useEffect } from "react";

import api from "../api/client";

import { TX_ADDED_EVENT } from "../components/QuickAddFab";

export function useGoalsController() {
  const { mainCurrency } = useUser();
  const [goals, setGoals] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);

  const blank = {
    name: "", icon: "🎯", target_amount: "",
    currency: mainCurrency, current_amount: 0,
    account_id: "", due_date: "", sort_order: 0, is_shared: false,
  };
  const [form, setForm] = useState(blank);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, a] = await Promise.all([
        api.get("/api/goals/", { params: { include_archived: true } }),
        api.get("/api/accounts/"),
      ]);
      setGoals(g.data);
      setAccounts(a.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener(TX_ADDED_EVENT, load);
    return () => window.removeEventListener(TX_ADDED_EVENT, load);
  }, [load]);

  const startAdd = () => {
    setForm({ ...blank, currency: mainCurrency });
    setAdding(true);
    setEditId(null);
  };

  const startEdit = (g) => {
    setForm({
      name: g.name,
      icon: g.icon || "🎯",
      target_amount: String(g.target_amount),
      currency: g.currency,
      current_amount: g.account_id ? 0 : g.current_amount,
      account_id: g.account_id ? String(g.account_id) : "",
      due_date: g.due_date || "",
      sort_order: g.sort_order || 0, is_shared: g.is_shared,
    });
    setEditId(g.id);
    setAdding(false);
  };

  const cancel = () => {
    setAdding(false);
    setEditId(null);
    setError(null);
  };

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        name: form.name,
        icon: form.icon || null,
        target_amount: parseFloat(form.target_amount),
        currency: form.currency,
        current_amount: parseFloat(form.current_amount) || 0,
        account_id: form.account_id ? parseInt(form.account_id) : null,
        due_date: form.due_date || null,
        sort_order: Number(form.sort_order) || 0,
        is_shared: form.is_shared,
      };
      if (editId) {
        await api.patch(`/api/goals/${editId}`, payload);
      } else {
        await api.post("/api/goals/", payload);
      }
      cancel();
      load();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка сохранения");
    }
  };

  const del = async (g) => {
    if (!confirm(`Удалить цель «${g.name}»?`)) return;
    try {
      await api.delete(`/api/goals/${g.id}`);
      load();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка удаления");
    }
  };

  const archive = async (g) => {
    if (!confirm(`Убрать цель «${g.name}» в архив? Взносы и история сохранятся.`)) return;
    try {
      await api.post(`/api/goals/${g.id}/archive`);
      load();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось архивировать цель");
    }
  };

  const restore = async (g) => {
    try {
      await api.post(`/api/goals/${g.id}/restore`);
      load();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось вернуть цель");
    }
  };

  const activeGoals = goals.filter(goal => !goal.is_archived);
  const archivedGoals = goals.filter(goal => goal.is_archived);
  return { accounts, loading, error, adding, editId, form, setForm, startAdd, startEdit, cancel, save, del, archive, restore, activeGoals, archivedGoals };
}
