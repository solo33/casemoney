import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import CategoryPicker from "../components/CategoryPicker";
import { useUser } from "../contexts/UserContext";
import { formatMoney } from "../utils/money";

export default function Budget() {
  const { mainCurrency } = useUser();
  const [budgets, setBudgets] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [addForm, setAddForm] = useState(null); // { category_id, amount, currency }
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [budgetsRes, suggestionsRes, categoriesRes] = await Promise.all([
        api.get("/api/budgets/"),
        api.get("/api/budgets/suggestions"),
        api.get("/api/categories/"),
      ]);
      setBudgets(budgetsRes.data);
      setSuggestions(suggestionsRes.data);
      setCategories(categoriesRes.data.filter(c => c.type === "expense"));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Не удалось загрузить бюджет");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => ({
    limit: budgets.reduce((sum, b) => sum + b.amount, 0),
    spent: budgets.reduce((sum, b) => sum + b.spent, 0),
  }), [budgets]);

  const budgetedIds = useMemo(() => new Set(budgets.map(b => b.category_id)), [budgets]);
  const availableCategories = useMemo(
    () => categories.filter(c => !budgetedIds.has(c.id)),
    [categories, budgetedIds]
  );

  const openAddFromSuggestion = suggestion => setAddForm({
    category_id: String(suggestion.category_id),
    amount: String(Math.round(suggestion.average_amount)),
    currency: suggestion.currency,
  });
  const openAddManual = () => setAddForm({ category_id: "", amount: "", currency: mainCurrency });

  const submitAdd = async event => {
    event.preventDefault();
    if (!addForm.category_id || !addForm.amount) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/api/budgets/", {
        category_id: Number(addForm.category_id),
        amount: Number(addForm.amount),
        currency: addForm.currency,
      });
      setAddForm(null);
      setMessage("Лимит добавлен");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Не удалось создать лимит");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = budget => { setEditingId(budget.id); setEditAmount(String(budget.amount)); };
  const submitEdit = async (event, budget) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.patch(`/api/budgets/${budget.id}`, { amount: Number(editAmount) });
      setEditingId(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Не удалось изменить лимит");
    } finally {
      setBusy(false);
    }
  };

  const removeBudget = async budget => {
    if (!window.confirm(`Убрать лимит для «${budget.category_name}»?`)) return;
    setBusy(true);
    setError("");
    try {
      await api.delete(`/api/budgets/${budget.id}`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Не удалось удалить лимит");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="page">Загружаем бюджет…</div>;

  return (
    <main className="page budget-page">
      <header className="page-heading">
        <div><h1>Бюджет</h1><p>Лимиты расходов по категориям на текущий месяц.</p></div>
      </header>
      {error && <div className="form-error">{error}</div>}
      {message && <div className="budget-message">{message}</div>}

      {budgets.length > 0 && (
        <section className="budget-totals-card">
          <div><span>Всего лимит</span><strong>{formatMoney(totals.limit)} {mainCurrency}</strong></div>
          <div><span>Потрачено</span><strong className={totals.spent > totals.limit ? "danger" : ""}>{formatMoney(totals.spent)} {mainCurrency}</strong></div>
          <div><span>Остаток</span><strong>{formatMoney(totals.limit - totals.spent)} {mainCurrency}</strong></div>
        </section>
      )}

      <section className="budget-list-card">
        <h2>Лимиты категорий</h2>
        {budgets.length === 0 ? (
          <p className="empty-state">Лимитов пока нет — добавьте первый ниже.</p>
        ) : (
          <div className="budget-list">
            {budgets.map(b => (
              <div key={b.id} className={b.is_overspent ? "budget-row overspent" : "budget-row"}>
                <div className="budget-row-head">
                  <span>{b.category_icon} {b.category_name}</span>
                  <span>{formatMoney(b.spent)} / {formatMoney(b.amount)} {b.currency}</span>
                </div>
                <div className="budget-bar"><div style={{ width: `${Math.min(100, b.percent)}%` }} /></div>
                <div className="budget-row-foot">
                  <span>{b.is_overspent
                    ? `Перерасход ${formatMoney(Math.abs(b.remaining))} ${b.currency}`
                    : `Осталось ${formatMoney(b.remaining)} ${b.currency}`}</span>
                  {editingId === b.id ? (
                    <form onSubmit={event => submitEdit(event, b)} className="budget-edit-form">
                      <input type="number" min="0.01" step="0.01" value={editAmount} onChange={event => setEditAmount(event.target.value)} autoFocus />
                      <button type="submit" disabled={busy}>Сохранить</button>
                      <button type="button" className="btn-ghost" onClick={() => setEditingId(null)}>Отмена</button>
                    </form>
                  ) : (
                    <div className="budget-actions">
                      <button type="button" className="btn-secondary" onClick={() => startEdit(b)}>Изменить</button>
                      <button type="button" className="btn-ghost danger" onClick={() => removeBudget(b)}>Удалить</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="budget-suggestions-card">
          <h2>Похоже, вы регулярно тратите</h2>
          <p>Средний расход по категориям без лимита за прошлые месяцы — можно сразу поставить лимитом.</p>
          <div className="budget-suggestions">
            {suggestions.map(s => (
              <button type="button" key={s.category_id} className="budget-suggestion" onClick={() => openAddFromSuggestion(s)}>
                <span>{s.category_icon} {s.category_name}</span>
                <strong>{formatMoney(s.average_amount)} {s.currency}</strong>
              </button>
            ))}
          </div>
        </section>
      )}

      {availableCategories.length > 0 && (
        <button type="button" className="btn-secondary budget-add-trigger" onClick={openAddManual}>+ Задать лимит вручную</button>
      )}

      {addForm && (
        <div className="planning-modal-backdrop" onClick={() => setAddForm(null)}>
          <section className="planning-modal" onClick={event => event.stopPropagation()}>
            <div className="planning-modal-head"><h2>Новый лимит</h2><button type="button" className="btn-ghost" onClick={() => setAddForm(null)}>×</button></div>
            <form onSubmit={submitAdd} className="planning-modal-form">
              <label><span>Категория</span>
                <CategoryPicker categories={availableCategories} value={addForm.category_id} onChange={category_id => setAddForm({ ...addForm, category_id })} />
              </label>
              <label><span>Лимит на месяц, {addForm.currency}</span>
                <input type="number" required min="0.01" step="0.01" value={addForm.amount} onChange={event => setAddForm({ ...addForm, amount: event.target.value })} autoFocus />
              </label>
              <div className="planning-modal-actions">
                <button type="submit" disabled={busy || !addForm.category_id}>Сохранить</button>
                <button type="button" className="btn-ghost" onClick={() => setAddForm(null)}>Отмена</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
