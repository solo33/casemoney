import { useState, useCallback, useEffect, useMemo } from "react";
import api from "../api/client";
import { blankItem, parseShoppingEntry } from "../utils/shoppingView";

export default function useShoppingController() {
  const [lists, setLists] = useState([]);
  const [listId, setListId] = useState("");
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(blankItem);
  const [newList, setNewList] = useState("");
  const [shareNewList, setShareNewList] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadLists = useCallback(async () => {
    const response = await api.get("/api/shopping/lists");
    setLists(response.data);
    setListId(current => response.data.some(list => String(list.id) === current) ? current : String(response.data[0]?.id || ""));
  }, []);

  useEffect(() => {
    Promise.all([
      loadLists(),
      api.get("/api/shopping/history"),
    ]).then(([, historyResponse]) => {
      setHistory(historyResponse.data);
    }).catch(() => setError("Не удалось загрузить списки покупок. Попробуйте обновить страницу."))
      .finally(() => setLoading(false));
  }, [loadLists]);

  useEffect(() => {
    let active = true;
    setItems([]);
    const refresh = async () => {
      if (!listId || document.hidden) return;
      try {
        const response = await api.get(`/api/shopping/lists/${listId}/items`, { params: { include_bought: true } });
        if (active) setItems(response.data);
      } catch { if (active) setError("Не удалось загрузить позиции списка"); }
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [listId]);

  useEffect(() => {
    const refresh = () => { if (!document.hidden) loadLists().catch(() => {}); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [loadLists]);

  const planned = useMemo(() => items.filter(item => item.status === "planned"), [items]);
  const bought = useMemo(() => items.filter(item => item.status === "bought"), [items]);

  const updateForm = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const applySuggestion = suggestion => setForm(current => ({
    ...current, name: suggestion.name, quantity: String(suggestion.quantity || 1), unit: suggestion.unit || "",
    planned_price: "", currency: suggestion.currency || "RUB", category_id: "",
  }));

  const addItem = async event => {
    event.preventDefault();
    if (!form.name.trim() || !listId) return;
    const parsedEntry = parseShoppingEntry(form.name);
    try {
      const response = await api.post(`/api/shopping/lists/${listId}/items`, {
        ...form,
        ...parsedEntry,
        quantity: parsedEntry.quantity ?? Number(form.quantity || 1),
        unit: parsedEntry.unit ?? form.unit,
        planned_price: form.planned_price === "" ? null : Number(form.planned_price),
        category_id: form.category_id || null,
      });
      setItems(current => [response.data, ...current]);
      setForm(blankItem);
      setError("");
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось добавить позицию"); }
  };

  const createList = async event => {
    event.preventDefault();
    if (!newList.trim()) return;
    try {
      const response = await api.post("/api/shopping/lists", { name: newList.trim(), is_shared: shareNewList });
      setLists(current => [...current, response.data]); setListId(String(response.data.id)); setNewList(""); setShareNewList(false);
    } catch { setError("Не удалось создать список"); }
  };

  const markBought = async item => {
    try {
      const response = await api.patch(`/api/shopping/items/${item.id}`, { status: "bought" });
      setItems(current => current.map(row => row.id === item.id ? response.data : row));
      setHistory(current => [{ ...response.data, used_count: 1 }, ...current]);
    } catch { setError("Не удалось отметить покупку"); }
  };

  const reopen = async item => {
    const response = await api.patch(`/api/shopping/items/${item.id}`, { status: "planned" });
    setItems(current => current.map(row => row.id === item.id ? response.data : row));
  };

  const removeItem = async item => {
    if (!confirm(`Удалить «${item.name}» из списка?`)) return;
    await api.delete(`/api/shopping/items/${item.id}`);
    setItems(current => current.filter(row => row.id !== item.id));
  };

  const [sharing, setSharing] = useState(false);
  const selectedList = lists.find(list => String(list.id) === listId);
  const shareList = async shared => {
    if (!selectedList || sharing) return;
    setSharing(true);
    try {
      const response = await api.patch(`/api/shopping/lists/${listId}`, { is_shared: shared });
      setLists(current => current.map(list => list.id === response.data.id ? response.data : list));
      setError("");
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось изменить доступ"); }
    finally { setSharing(false); }
  };
  return { lists, listId, setListId, history, form, newList, setNewList, shareNewList, setShareNewList, error, loading, planned, bought, updateForm, applySuggestion, addItem, createList, markBought, reopen, removeItem, selectedList, shareList, sharing };
}
