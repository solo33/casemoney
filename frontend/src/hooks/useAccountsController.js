import { useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { useState, useCallback, useEffect } from "react";
import { useSensors, useSensor, PointerSensor, KeyboardSensor } from "@dnd-kit/core";

import api from "../api/client";

import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { arrayMove } from "@dnd-kit/sortable";
import { UNGROUPED_KEY } from "../utils/accountsView";

export function useAccountsController() {
  const navigate = useNavigate();
  const { mainCurrency, user } = useUser();
  const [groups, setGroups] = useState([]);  // grouped response
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());  // group keys свёрнутые

  // Forms / state
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: "", type: "cash", color: "", icon: "",
    initial_currency: "RUB", initial_balance: 0,
    group_id: "",
    include_in_balance: true,
    show_for_entries: true,
    note: "",
  });
  const [expanded, setExpanded] = useState(new Set());        // account ids with expanded balances
  const [addingCurrencyTo, setAddingCurrencyTo] = useState(null);  // account.id
  const [currencyForm, setCurrencyForm] = useState({ currency: "USD", balance: 0 });
  const [activeDrag, setActiveDrag] = useState(null);
  const [adjustingBalance, setAdjustingBalance] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const fetchGroups = useCallback(async () => {
    try {
      const res = await api.get("/api/accounts/grouped");
      setGroups(res.data);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка загрузки счетов");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener(TX_ADDED_EVENT, fetchGroups);
    return () => window.removeEventListener(TX_ADDED_EVENT, fetchGroups);
  }, [fetchGroups]);

  // Загружаем один раз при открытии и повторяем при смене основной валюты.
  // Раньше соседний effect запускал второй одинаковый запрос при каждом mount.
  useEffect(() => { fetchGroups(); }, [mainCurrency, fetchGroups]);

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleGroup = (groupKey) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
  };

  const goToAccountCurrency = (accId, currency) => {
    navigate(`/transactions?account_id=${accId}&currency=${currency}`);
  };

  // --- Group ops ---

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      await api.post("/api/account-groups/", { name: newGroupName.trim(), sort_order: groups.length });
      setNewGroupName("");
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка создания группы");
    }
  };

  const handleDeleteGroup = async (group) => {
    if (!group.id) return;  // virtual ungrouped
    if (!confirm(`Удалить группу «${group.name}»? Счета останутся (без группы).`)) return;
    try {
      await api.delete(`/api/account-groups/${group.id}`);
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось удалить группу");
    }
  };

  // --- Account ops ---

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newAccount,
        group_id: newAccount.group_id ? parseInt(newAccount.group_id) : null,
      };
      if (!payload.color) delete payload.color;
      if (!payload.icon) delete payload.icon;
      payload.initial_balance = parseFloat(payload.initial_balance) || 0;
      await api.post("/api/accounts/", payload);
      setShowNewAccount(false);
      setNewAccount({
        name: "", type: "cash", color: "", icon: "",
        initial_currency: "RUB", initial_balance: 0, group_id: "",
        include_in_balance: true,
        show_for_entries: true,
        note: "",
      });
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка создания счёта");
    }
  };

  const handleDeleteAccount = async (acc) => {
    if (!confirm(`Удалить счёт «${acc.name}»? Все балансы и транзакции этого счёта будут потеряны.`)) return;
    try {
      await api.delete(`/api/accounts/${acc.id}`);
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось удалить счёт");
    }
  };

  const handleToggleInclude = async (acc) => {
    const includeInBalance = !acc.include_in_balance;
    const updateLocalValue = (value) => {
      setGroups(current => current.map(bucket => ({
        ...bucket,
        accounts: bucket.accounts.map(account => (
          account.id === acc.id
            ? { ...account, include_in_balance: value }
            : account
        )),
      })));
    };
    updateLocalValue(includeInBalance);
    try {
      await api.put(`/api/accounts/${acc.id}`, { include_in_balance: includeInBalance });
      setError(null);
    } catch (e) {
      updateLocalValue(acc.include_in_balance);
      setError(e.response?.data?.detail || "Не удалось обновить");
    }
  };

  const handleToggleShowForEntries = async (acc) => {
    const showForEntries = !acc.show_for_entries;
    const updateLocalValue = (value) => {
      setGroups(current => current.map(bucket => ({
        ...bucket,
        accounts: bucket.accounts.map(account => (
          account.id === acc.id
            ? { ...account, show_for_entries: value }
            : account
        )),
      })));
    };
    updateLocalValue(showForEntries);
    try {
      await api.put(`/api/accounts/${acc.id}`, { show_for_entries: showForEntries });
      setError(null);
    } catch (e) {
      updateLocalValue(acc.show_for_entries);
      setError(e.response?.data?.detail || "Не удалось обновить видимость счёта");
    }
  };

  const handleEditNote = async (acc) => {
    const note = window.prompt(
      "Комментарий к счёту. Не указывайте пароль, PIN, CVV или реквизиты карты.",
      acc.note || "",
    );
    if (note === null || note === (acc.note || "")) return;
    try {
      await api.put(`/api/accounts/${acc.id}`, { note: note.trim() || null });
      await fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось сохранить комментарий");
    }
  };

  // --- Currency ops ---

  const handleAddCurrency = async (e, acc) => {
    e.preventDefault();
    try {
      await api.post(`/api/accounts/${acc.id}/balances`, {
        currency: currencyForm.currency,
        balance: parseFloat(currencyForm.balance) || 0,
      });
      setAddingCurrencyTo(null);
      setCurrencyForm({ currency: "USD", balance: 0 });
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось добавить валюту");
    }
  };

  const handleDeleteCurrency = async (acc, bal) => {
    if (Math.abs(bal.balance) > 0.005) {
      setError(`Сначала обнулите баланс ${bal.currency} (сейчас ${bal.balance})`);
      return;
    }
    if (!confirm(`Удалить валюту ${bal.currency} у счёта «${acc.name}»?`)) return;
    try {
      await api.delete(`/api/accounts/${acc.id}/balances/${bal.currency}`);
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось удалить валюту");
    }
  };

  // --- DnD ---

  const handleDragStart = (event) => {
    setActiveDrag(event.active.data.current);
  };

  const bucketKey = (b) => (b.group.id ?? UNGROUPED_KEY);

  const handleDragEnd = async (event) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const dragged = active.data.current;        // { type:'account', accountId, groupKey }
    const overData = over.data.current;
    if (!dragged || !overData) return;

    // Целевая группа: либо группа счёта-цели, либо сам droppable группы
    const targetKey = overData.type === "group" ? overData.groupKey : overData.groupKey;
    const sameGroup = dragged.groupKey === targetKey;

    const targetBucket = groups.find(b => bucketKey(b) === targetKey);
    if (!targetBucket) return;
    const targetIds = targetBucket.accounts.map(a => a.id);

    // Индекс вставки
    let insertIdx;
    if (overData.type === "account") {
      insertIdx = targetIds.indexOf(overData.accountId);
      if (insertIdx < 0) insertIdx = targetIds.length;
    } else {
      insertIdx = targetIds.length; // дроп на пустую область группы → в конец
    }

    let newOrder;
    if (sameGroup) {
      const oldIdx = targetIds.indexOf(dragged.accountId);
      if (oldIdx < 0 || oldIdx === insertIdx) return;
      newOrder = arrayMove(targetIds, oldIdx, insertIdx);
    } else {
      newOrder = [...targetIds];
      newOrder.splice(insertIdx, 0, dragged.accountId);
    }

    const body = { account_ids: newOrder };
    if (!sameGroup) body.group_id = targetKey === UNGROUPED_KEY ? null : targetKey;

    try {
      await api.post("/api/accounts/reorder", body);
      fetchGroups();
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось изменить порядок");
      fetchGroups();
    }
  };

  // Итог группы (g.total_in_main) включает счета «не в балансе» — для общего
  // баланса берём только учитываемые счета, как на дашборде.
  const conversionUnavailable = groups.some(g => (g.accounts || []).some(a => a.include_in_balance !== false && a.total_in_main == null));
  const grandTotal = groups.reduce(
    (s, g) => s + (g.accounts || [])
      .filter(a => a.include_in_balance !== false)
      .reduce((x, a) => x + (a.total_in_main || 0), 0),
    0,
  );
  return { navigate, mainCurrency, user, groups, loading, error, setError, collapsedGroups, newGroupName, setNewGroupName, showNewAccount, setShowNewAccount, newAccount, setNewAccount, expanded, addingCurrencyTo, setAddingCurrencyTo, currencyForm, setCurrencyForm, activeDrag, adjustingBalance, setAdjustingBalance, sensors, fetchGroups, toggleExpand, toggleGroup, goToAccountCurrency, handleCreateGroup, handleDeleteGroup, handleCreateAccount, handleDeleteAccount, handleToggleInclude, handleToggleShowForEntries, handleEditNote, handleAddCurrency, handleDeleteCurrency, handleDragStart, handleDragEnd, conversionUnavailable, grandTotal };
}
