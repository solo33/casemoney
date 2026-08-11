import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { formatMoney } from "../utils/money";

const today = () => new Date().toISOString().slice(0, 10);
const blankForm = () => ({ type: "expense", amount: "", currency: "RUB", account_id: "", category_id: "", description: "", date: today() });

export default function Planning() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [transactionsResponse, accountsResponse, categoriesResponse, templatesResponse] = await Promise.all([
        api.get("/api/transactions/", { params: { is_planned: true, limit: 500 } }),
        api.get("/api/accounts/"), api.get("/api/categories/"), api.get("/api/transaction-templates/"),
      ]);
      setTransactions(transactionsResponse.data.items || []);
      setAccounts(accountsResponse.data || []);
      setCategories(categoriesResponse.data || []);
      setTemplates(templatesResponse.data || []);
      setForm(current => current.account_id ? current : { ...current, account_id: String(accountsResponse.data?.[0]?.id || "") });
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось загрузить планирование."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => transactions.reduce((result, transaction) => {
    const item = result[transaction.currency] || { income: 0, expense: 0 };
    item[transaction.type] = (item[transaction.type] || 0) + Number(transaction.amount);
    result[transaction.currency] = item;
    return result;
  }, {}), [transactions]);
  const currencies = useMemo(() => [...new Set(accounts.flatMap(account => (account.balances || []).map(balance => balance.currency)))].sort(), [accounts]);
  const change = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const save = async event => {
    event.preventDefault();
    if (!form.amount || !form.account_id) return;
    setSaving(true);
    try {
      const response = await api.post("/api/transactions/", {
        type: form.type, amount: Number(form.amount), currency: form.currency,
        account_id: Number(form.account_id), category_id: form.category_id ? Number(form.category_id) : null,
        description: form.description || null, date: `${form.date}T12:00:00`, is_planned: true,
      });
      setTransactions(current => [response.data, ...current]);
      setForm(current => ({ ...blankForm(), account_id: current.account_id, currency: current.currency }));
      setError("");
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось сохранить плановую запись."); }
    finally { setSaving(false); }
  };
  const makeActual = async transaction => {
    try {
      await api.patch(`/api/transactions/${transaction.id}`, { is_planned: false });
      setTransactions(current => current.filter(item => item.id !== transaction.id));
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось учесть операцию."); }
  };
  const remove = async transaction => {
    if (!window.confirm(`Удалить плановую запись «${transaction.description || "без названия"}»?`)) return;
    try { await api.delete(`/api/transactions/${transaction.id}`); setTransactions(current => current.filter(item => item.id !== transaction.id)); }
    catch { setError("Не удалось удалить плановую запись."); }
  };
  const saveTemplate = async () => {
    if (!form.amount || !form.account_id) { setError("Сначала заполните операцию, которую нужно сохранить как шаблон."); return; }
    const name = window.prompt("Название шаблона", form.description || (form.type === "income" ? "Регулярный доход" : "Регулярный расход"));
    if (!name?.trim()) return;
    try {
      const response = await api.post("/api/transaction-templates/", { ...form, name: name.trim(), amount: Number(form.amount), account_id: Number(form.account_id), category_id: form.category_id ? Number(form.category_id) : null });
      setTemplates(current => [...current, response.data].sort((a, b) => a.name.localeCompare(b.name, "ru")));
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось сохранить шаблон."); }
  };
  const applyTemplate = template => setForm({ type: template.type, amount: String(template.amount), currency: template.currency, account_id: String(template.account_id || ""), category_id: String(template.category_id || ""), description: template.description || "", date: today() });
  const removeTemplate = async template => {
    if (!window.confirm(`Удалить шаблон «${template.name}»?`)) return;
    try { await api.delete(`/api/transaction-templates/${template.id}`); setTemplates(current => current.filter(item => item.id !== template.id)); }
    catch { setError("Не удалось удалить шаблон."); }
  };

  if (loading) return <div className="page">Загружаем планирование…</div>;
  return <main className="page planning-page">
    <header className="page-heading"><div><h1>Планирование</h1><p>Будущие доходы и расходы не меняют остатки счетов, пока вы не отметите их как выполненные.</p></div></header>
    {error && <div className="form-error">{error}</div>}
    <section className="planning-summary">
      {Object.keys(summary).length === 0 ? <p>На будущее пока ничего не запланировано.</p> : Object.entries(summary).map(([currency, values]) => <div className="planning-summary-card" key={currency}><strong>{currency}</strong><span className="income">+{formatMoney(values.income)}</span><span className="expense">−{formatMoney(values.expense)}</span><b>{formatMoney(values.income - values.expense)}</b></div>)}
    </section>
    <section className="planning-create-card"><h2>Запланировать операцию</h2><form className="planning-form" onSubmit={save}>
      <select value={form.type} onChange={event => change("type", event.target.value)}><option value="expense">Расход</option><option value="income">Доход</option></select>
      <input required inputMode="decimal" value={form.amount} placeholder="Сумма" onChange={event => change("amount", event.target.value)} />
      <select value={form.currency} onChange={event => change("currency", event.target.value)}>{currencies.map(currency => <option key={currency}>{currency}</option>)}</select>
      <select required value={form.account_id} onChange={event => change("account_id", event.target.value)}><option value="">Счёт</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
      <select value={form.category_id} onChange={event => change("category_id", event.target.value)}><option value="">Без категории</option>{categories.map(category => <option key={category.id} value={category.id}>{category.parent_id ? "↳ " : ""}{category.name}</option>)}</select>
      <input type="date" required value={form.date} onChange={event => change("date", event.target.value)} />
      <input className="planning-description" value={form.description} placeholder="Комментарий" onChange={event => change("description", event.target.value)} />
      <button type="button" className="btn-secondary" onClick={saveTemplate}>В шаблоны</button><button type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Запланировать"}</button>
    </form></section>
    <section className="planning-templates-card"><h2>Шаблоны операций</h2><p>Сохраните регулярный платёж один раз, затем подставляйте его в план за один клик.</p>{templates.length === 0 ? <span className="empty-state">Шаблонов пока нет.</span> : <div className="planning-templates">{templates.map(template => <div key={template.id}><button type="button" onClick={() => applyTemplate(template)}><strong>{template.name}</strong><span>{template.type === "income" ? "Доход" : "Расход"} · {formatMoney(template.amount)} {template.currency}</span></button><button className="btn-ghost danger" type="button" onClick={() => removeTemplate(template)}>×</button></div>)}</div>}</section>
    <section className="planning-list-card"><h2>Будущие операции ({transactions.length})</h2>
      {transactions.length === 0 ? <p className="empty-state">Добавьте предстоящий платёж, доход или напоминание о расходе.</p> : transactions.map(transaction => <article className="planning-row" key={transaction.id}>
        <time>{new Date(transaction.date).toLocaleDateString("ru-RU")}</time><div><strong>{transaction.description || (transaction.type === "income" ? "Плановый доход" : "Плановый расход")}</strong><span>{transaction.type === "income" ? "Доход" : "Расход"}</span></div><b className={transaction.type === "income" ? "income" : "expense"}>{transaction.type === "income" ? "+" : "−"}{formatMoney(transaction.amount)} {transaction.currency}</b><div className="planning-actions"><button className="btn-secondary" type="button" onClick={() => makeActual(transaction)}>Учесть</button><button className="btn-ghost danger" type="button" onClick={() => remove(transaction)}>Удалить</button></div>
      </article>)}
    </section>
  </main>;
}
