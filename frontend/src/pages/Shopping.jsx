import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { formatMoney } from "../utils/money";

const blankItem = { name: "", quantity: "1", unit: "", planned_price: "", currency: "RUB", category_id: "", note: "" };

export default function Shopping() {
  const [lists, setLists] = useState([]);
  const [listId, setListId] = useState("");
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(blankItem);
  const [newList, setNewList] = useState("");
  const [expenseFor, setExpenseFor] = useState(null);
  const [expense, setExpense] = useState({ amount: "", account_id: "", category_id: "", date: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadLists = useCallback(async () => {
    const response = await api.get("/api/shopping/lists");
    setLists(response.data);
    setListId(current => current || String(response.data[0]?.id || ""));
  }, []);

  const loadItems = useCallback(async (id) => {
    if (!id) return;
    const response = await api.get(`/api/shopping/lists/${id}/items`, { params: { include_bought: true } });
    setItems(response.data);
  }, []);

  useEffect(() => {
    Promise.all([
      loadLists(),
      api.get("/api/shopping/history"),
      api.get("/api/categories/"),
      api.get("/api/accounts/grouped", { params: { convert_balances: false } }),
    ]).then(([, historyResponse, categoriesResponse, groupsResponse]) => {
      setHistory(historyResponse.data);
      setCategories(categoriesResponse.data);
      setAccounts((groupsResponse.data || []).flatMap(group => group.accounts || []));
    }).catch(() => setError("Не удалось загрузить списки покупок. Попробуйте обновить страницу."))
      .finally(() => setLoading(false));
  }, [loadLists]);

  useEffect(() => { loadItems(listId).catch(() => setError("Не удалось загрузить позиции списка")); }, [listId, loadItems]);

  const planned = useMemo(() => items.filter(item => item.status === "planned"), [items]);
  const bought = useMemo(() => items.filter(item => item.status === "bought"), [items]);

  const updateForm = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const applySuggestion = suggestion => setForm(current => ({
    ...current, name: suggestion.name, quantity: String(suggestion.quantity || 1), unit: suggestion.unit || "",
    planned_price: suggestion.planned_price ?? "", currency: suggestion.currency || "RUB", category_id: suggestion.category_id || "",
  }));

  const addItem = async event => {
    event.preventDefault();
    if (!form.name.trim() || !listId) return;
    try {
      const response = await api.post(`/api/shopping/lists/${listId}/items`, {
        ...form, quantity: Number(form.quantity || 1), planned_price: form.planned_price === "" ? null : Number(form.planned_price),
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
      const response = await api.post("/api/shopping/lists", { name: newList.trim() });
      setLists(current => [...current, response.data]); setListId(String(response.data.id)); setNewList("");
    } catch { setError("Не удалось создать список"); }
  };

  const markBought = async item => {
    try {
      const response = await api.patch(`/api/shopping/items/${item.id}`, { status: "bought", actual_price: item.planned_price });
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

  const openExpense = item => {
    setExpenseFor(item);
    setExpense({ amount: String(item.actual_price ?? item.planned_price ?? ""), account_id: "", category_id: String(item.category_id || ""), date: new Date().toISOString().slice(0, 10) });
  };

  const saveExpense = async event => {
    event.preventDefault();
    if (!expenseFor || !expense.account_id || !expense.amount) return;
    try {
      const tx = await api.post("/api/transactions/", {
        type: "expense", amount: Number(expense.amount), currency: expenseFor.currency,
        account_id: Number(expense.account_id), category_id: expense.category_id ? Number(expense.category_id) : null,
        description: expenseFor.name, date: `${expense.date}T12:00:00`,
      });
      const updated = await api.patch(`/api/shopping/items/${expenseFor.id}`, { transaction_id: tx.data.id, actual_price: Number(expense.amount), status: "bought" });
      setItems(current => current.map(row => row.id === updated.data.id ? updated.data : row));
      setExpenseFor(null);
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось добавить расход"); }
  };

  if (loading) return <div className="page">Загружаем список покупок…</div>;
  return <div className="page shopping-page">
    <div className="page-heading"><div><h1>Список покупок</h1><p>Быстро добавляйте товары, используйте прошлые покупки и сразу учитывайте расход.</p></div></div>
    {error && <div className="form-error">{error}</div>}
    <section className="shopping-toolbar">
      <label>Список<select value={listId} onChange={e => setListId(e.target.value)}>{lists.map(list => <option key={list.id} value={list.id}>{list.name}{list.is_default ? " — основной" : ""}</option>)}</select></label>
      <form onSubmit={createList} className="shopping-new-list"><input value={newList} placeholder="Новый список: Дача" onChange={e => setNewList(e.target.value)} /><button type="submit" className="btn-secondary">Создать список</button></form>
    </section>
    <section className="shopping-add-card">
      <h2>Быстро добавить</h2>
      <form className="shopping-add-form" onSubmit={addItem}>
        <input list="shopping-history" autoComplete="off" value={form.name} placeholder="Например, молоко" onChange={e => updateForm("name", e.target.value)} />
        <datalist id="shopping-history">{history.map((item, index) => <option key={`${item.name}-${index}`} value={item.name} />)}</datalist>
        <input inputMode="decimal" value={form.quantity} aria-label="Количество" onChange={e => updateForm("quantity", e.target.value)} />
        <input value={form.unit} aria-label="Единица измерения" placeholder="шт." onChange={e => updateForm("unit", e.target.value)} />
        <input inputMode="decimal" value={form.planned_price} aria-label="Цена" placeholder="Цена" onChange={e => updateForm("planned_price", e.target.value)} />
        <button type="submit">Добавить</button>
      </form>
      {history.length > 0 && <div className="shopping-suggestions"><span>Из прошлых покупок:</span>{history.slice(0, 8).map((item, index) => <button type="button" key={`${item.name}-${index}`} onClick={() => applySuggestion(item)}>{item.name}</button>)}</div>}
    </section>
    <section className="shopping-items-card">
      <h2>Купить ({planned.length})</h2>
      {planned.length === 0 ? <p className="empty-state">Список пуст. Добавьте первую покупку выше.</p> : planned.map(item => <ShoppingRow key={item.id} item={item} onBought={() => markBought(item)} onDelete={() => removeItem(item)} onExpense={() => openExpense(item)} />)}
    </section>
    {bought.length > 0 && <section className="shopping-items-card shopping-bought"><h2>Куплено ({bought.length})</h2>{bought.map(item => <ShoppingRow key={item.id} item={item} bought onReopen={() => reopen(item)} onDelete={() => removeItem(item)} onExpense={() => openExpense(item)} />)}</section>}
    {expenseFor && <div className="modal-backdrop"><form className="shopping-expense-modal" onSubmit={saveExpense}><div className="modal-heading"><h2>Добавить расход</h2><button type="button" className="btn-ghost" onClick={() => setExpenseFor(null)}>×</button></div><p>{expenseFor.name}</p><label>Сумма<input autoFocus inputMode="decimal" value={expense.amount} onChange={e => setExpense(current => ({ ...current, amount: e.target.value }))} required /></label><label>Счёт<select value={expense.account_id} onChange={e => setExpense(current => ({ ...current, account_id: e.target.value }))} required><option value="">Выберите счёт</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Категория<select value={expense.category_id} onChange={e => setExpense(current => ({ ...current, category_id: e.target.value }))}><option value="">Без категории</option>{categories.map(category => <option key={category.id} value={category.id}>{category.parent_id ? "↳ " : ""}{category.name}</option>)}</select></label><label>Дата<input type="date" value={expense.date} onChange={e => setExpense(current => ({ ...current, date: e.target.value }))} /></label><button type="submit">Добавить расход и отметить купленным</button></form></div>}
  </div>;
}

function ShoppingRow({ item, bought, onBought, onReopen, onDelete, onExpense }) {
  const price = item.actual_price ?? item.planned_price;
  return <article className={`shopping-item ${bought ? "is-bought" : ""}`}><button type="button" className="shopping-check" onClick={bought ? onReopen : onBought} aria-label={bought ? "Вернуть в список" : "Отметить купленным"}>{bought ? "✓" : ""}</button><div className="shopping-item-name"><strong>{item.name}</strong><span>{item.quantity}{item.unit ? ` ${item.unit}` : ""}{price != null ? ` · ${formatMoney(price)} ${item.currency}` : ""}</span></div><div className="shopping-item-actions">{!item.transaction_id && <button type="button" className="btn-secondary" onClick={onExpense}>Учесть расход</button>}<button type="button" className="btn-icon-danger" onClick={onDelete} aria-label="Удалить">×</button></div></article>;
}
