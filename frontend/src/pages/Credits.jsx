import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import CategoryPicker from "../components/CategoryPicker";
import { formatMoneyWithCurrency } from "../utils/money";

const KIND_LABELS = { mortgage: "Ипотека", loan: "Кредит", credit_card: "Кредитная карта", private_debt: "Частный заём", deposit: "Депозит" };
const emptyForm = () => ({ name: "", kind: "mortgage", direction: "owe", currency: "RUB", counterparty: "", original_amount: "", current_balance: "", credit_limit: "", monthly_payment: "", annual_interest_rate: "", interest_payout_frequency: "monthly", capitalization: false, opened_at: "", due_day: "", statement_day: "", next_payment_date: "", end_date: "", reminder_days_before: "3", source_account_id: "", linked_account_id: "", funds_received: false, funds_account_id: "", category_id: "", notes: "" });
const optionalNumber = value => value === "" || value == null ? null : Number(value);
const optionalId = value => value === "" || value == null ? null : Number(value);

export default function Credits() {
  const [credits, setCredits] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [paying, setPaying] = useState(null);
  const [payment, setPayment] = useState({ amount: "", account_id: "", notes: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [creditResponse, accountResponse, categoryResponse] = await Promise.all([
        api.get("/api/credits/"), api.get("/api/accounts/grouped", { params: { convert_balances: false } }), api.get("/api/categories/"),
      ]);
      setCredits(creditResponse.data);
      setAccounts(accountResponse.data.flatMap(group => group.accounts || []));
      setCategories(categoryResponse.data);
    } catch (err) { setError(err.response?.data?.detail || "Не удалось загрузить обязательства и депозиты"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const active = credits.filter(item => item.status === "active");
  const closed = credits.filter(item => item.status === "closed");
  const currencies = useMemo(() => {
    const values = new Set(["RUB"]);
    accounts.forEach(account => (account.balances || []).forEach(balance => values.add(balance.currency)));
    return [...values];
  }, [accounts]);

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setShowForm(true); };
  const openEdit = item => { setEditingId(item.id); setForm(Object.fromEntries(Object.keys(emptyForm()).map(key => [key, item[key] ?? ""]))); setShowForm(true); };

  const submitCredit = async event => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const payload = { ...form, original_amount: optionalNumber(form.original_amount), current_balance: optionalNumber(form.current_balance), credit_limit: optionalNumber(form.credit_limit), monthly_payment: optionalNumber(form.monthly_payment), annual_interest_rate: optionalNumber(form.annual_interest_rate), capitalization: Boolean(form.capitalization), funds_received: Boolean(form.funds_received), funds_account_id: optionalId(form.funds_account_id), opened_at: form.opened_at || null, interest_payout_frequency: form.kind === "deposit" ? form.interest_payout_frequency : null, due_day: optionalNumber(form.due_day), statement_day: optionalNumber(form.statement_day), reminder_days_before: Number(form.reminder_days_before || 0), source_account_id: optionalId(form.source_account_id), linked_account_id: optionalId(form.linked_account_id), category_id: optionalId(form.category_id), next_payment_date: form.next_payment_date || null, end_date: form.end_date || null, counterparty: form.counterparty || null, notes: form.notes || null };
    if (editingId) ["kind", "direction", "currency"].forEach(key => delete payload[key]);
    try {
      if (editingId) await api.patch(`/api/credits/${editingId}`, payload); else await api.post("/api/credits/", payload);
      setMessage(editingId ? "Изменения сохранены" : "Обязательство добавлено"); setShowForm(false); await load();
    } catch (err) { const detail = err.response?.data?.detail; setError(Array.isArray(detail) ? detail.map(item => item.msg).join("; ") : detail || "Не удалось сохранить"); }
    finally { setBusy(false); }
  };

  const openPayment = item => { setPaying(item); setPayment({ amount: item.monthly_payment || "", account_id: item.source_account_id || "", notes: "" }); };
  const submitPayment = async event => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api.post(`/api/credits/${paying.id}/payments`, { amount: Number(payment.amount), account_id: Number(payment.account_id), notes: payment.notes || null });
      setPaying(null); setMessage(paying.kind === "deposit" ? "Доход по депозиту записан" : paying.direction === "receivable" ? "Возврат получен и записан" : "Платёж записан"); await load();
    } catch (err) { setError(err.response?.data?.detail || "Не удалось записать платёж"); }
    finally { setBusy(false); }
  };
  const setStatus = async (item, status) => { setBusy(true); try { await api.patch(`/api/credits/${item.id}`, { status }); await load(); } catch (err) { setError(err.response?.data?.detail || "Не удалось изменить статус"); } finally { setBusy(false); } };
  const deleteCredit = async item => {
    const paymentCount = item.payments?.length || 0;
    const suffix = paymentCount
      ? ` Вместе с ним будут удалены ${paymentCount} связанных платеж${paymentCount === 1 ? "" : paymentCount < 5 ? "а" : "ей"} и соответствующие операции по счетам.`
      : "";
    if (!confirm(`Удалить обязательство «${item.name}»?${suffix}\n\nВосстановить нельзя.`)) return;
    setBusy(true); setError("");
    try { await api.delete(`/api/credits/${item.id}`); setMessage("Обязательство и связанные платежи удалены"); await load(); }
    catch (err) { setError(err.response?.data?.detail || "Не удалось удалить обязательство"); }
    finally { setBusy(false); }
  };

  return <main className="page credits-page">
    <div className="credits-title-row"><div><h1>Обязательства и депозиты</h1><p>Будущие расходы и доходы, льготные периоды, займы и напоминания.</p></div><button onClick={openCreate}>+ Добавить</button></div>
    {error && <div className="credits-alert credits-error">{error}</div>}{message && <div className="credits-alert credits-success">{message}</div>}
    {showForm && <CreditForm form={form} setForm={setForm} editingId={editingId} busy={busy} accounts={accounts} categories={categories} currencies={currencies} onSubmit={submitCredit} onCancel={() => setShowForm(false)} />}
    {loading ? <p>Обновляем данные…</p> : active.length === 0 && !showForm ? <section className="credit-empty"><h2>Пока нет обязательств и депозитов</h2><p>Добавьте будущий платёж или доход — CaseMoney покажет ближайшую дату и напомнит о ней.</p><button onClick={openCreate}>Добавить первый</button></section> : <div className="credits-grid">{active.map(item => <CreditCard key={item.id} item={item} busy={busy} onPay={openPayment} onEdit={openEdit} onClose={() => setStatus(item, "closed")} onDelete={() => deleteCredit(item)} />)}</div>}
    {closed.length > 0 && <details className="closed-credits"><summary>Закрытые обязательства ({closed.length})</summary><div className="credits-grid">{closed.map(item => <CreditCard key={item.id} item={item} busy={busy} onEdit={openEdit} onRestore={() => setStatus(item, "active")} onDelete={() => deleteCredit(item)} />)}</div></details>}
    {paying && <PaymentModal item={paying} payment={payment} setPayment={setPayment} accounts={accounts} busy={busy} onSubmit={submitPayment} onCancel={() => setPaying(null)} />}
    <style>{creditStyles}</style>
  </main>;
}

function CreditForm({ form, setForm, editingId, busy, accounts, categories, currencies, onSubmit, onCancel }) {
  const depositIncome = form.kind === "deposit" && form.annual_interest_rate && (form.current_balance || form.original_amount)
    ? Number(form.current_balance || form.original_amount) * Number(form.annual_interest_rate) / 100 / (form.interest_payout_frequency === "monthly" ? 12 : 1)
    : null;
  return <section className="credit-form-card"><div className="credit-section-title"><h2>{editingId ? "Изменить обязательство" : "Новое обязательство"}</h2><button type="button" className="btn-ghost" onClick={onCancel}>×</button></div><form onSubmit={onSubmit} className="credit-form">
    <Field label="Название"><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Например, ипотека" /></Field>
    {!editingId && <Field label="Тип"><select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value, category_id: "", direction: e.target.value === "deposit" ? "receivable" : e.target.value === "private_debt" ? form.direction : "owe" })}>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
    {!editingId && form.kind === "private_debt" && <Field label="Направление"><select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value, funds_received: e.target.value === "receivable" ? false : form.funds_received, funds_account_id: e.target.value === "receivable" ? "" : form.funds_account_id })}><option value="owe">Я должен</option><option value="receivable">Мне должны</option></select></Field>}
    <Field label="Валюта"><select disabled={Boolean(editingId)} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>{currencies.map(item => <option key={item}>{item}</option>)}</select></Field>
    <Field label={form.kind === "deposit" ? "Банк" : "Кредитор или человек"}><input value={form.counterparty} onChange={e => setForm({ ...form, counterparty: e.target.value })} /></Field>
    <Field label={form.kind === "deposit" ? "Первоначальная сумма депозита" : "Первоначальная сумма"}><input type="number" min="0" step="0.01" value={form.original_amount} onChange={e => setForm({ ...form, original_amount: e.target.value })} /></Field>
    <Field label={form.kind === "deposit" ? "Текущая сумма депозита" : "Остаток долга"}><input type="number" min="0" step="0.01" value={form.current_balance} onChange={e => setForm({ ...form, current_balance: e.target.value })} /></Field>
    {!editingId && form.direction === "owe" && form.kind !== "deposit" && form.kind !== "credit_card" && <><label className="credit-check credit-wide"><input type="checkbox" checked={form.funds_received} onChange={e => setForm({ ...form, funds_received: e.target.checked, funds_account_id: e.target.checked ? form.funds_account_id : "" })} /><span>Деньги получены на мой счёт</span></label>{form.funds_received && <div className="credit-wide credit-funding"><Field label="Счёт зачисления"><AccountSelect required accounts={accounts} value={form.funds_account_id} onChange={value => setForm({ ...form, funds_account_id: value })} /></Field><small>Сумма увеличит остаток счёта, но не попадёт в доходы и отчёты.</small></div>}</>}
    {form.kind === "credit_card" && <Field label="Кредитный лимит"><input type="number" min="0" step="0.01" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} /></Field>}
    {form.kind === "deposit" && <><Field label="Годовая ставка, %"><input type="number" min="0" max="100" step="0.01" value={form.annual_interest_rate} onChange={e => setForm({ ...form, annual_interest_rate: e.target.value })} /></Field><Field label="Выплата процентов"><select value={form.interest_payout_frequency} onChange={e => setForm({ ...form, interest_payout_frequency: e.target.value })}><option value="monthly">Ежемесячно</option><option value="maturity">В конце срока</option></select></Field><Field label="Дата открытия"><input type="date" value={form.opened_at} onChange={e => setForm({ ...form, opened_at: e.target.value })} /></Field><label className="credit-check"><input type="checkbox" checked={form.capitalization} onChange={e => setForm({ ...form, capitalization: e.target.checked })} /><span>Капитализация процентов</span></label></>}
    <Field label={form.kind === "deposit" ? "Ожидаемый доход" : form.kind === "credit_card" ? "Сумма для льготного периода" : "Регулярный платёж"}><input type="number" min="0.01" step="0.01" value={depositIncome == null ? form.monthly_payment : depositIncome.toFixed(2)} readOnly={depositIncome != null} onChange={e => setForm({ ...form, monthly_payment: e.target.value })} /></Field>
    <Field label={form.kind === "deposit" ? "Ближайшая дата поступления" : "Ближайшая дата платежа"}><input type="date" value={form.next_payment_date} onChange={e => setForm({ ...form, next_payment_date: e.target.value })} /></Field>
    <Field label={form.kind === "deposit" ? "День ежемесячного поступления" : "День ежемесячного платежа"}><input type="number" min="1" max="31" value={form.due_day} onChange={e => setForm({ ...form, due_day: e.target.value })} /></Field>
    {form.kind === "credit_card" && <Field label="День формирования выписки"><input type="number" min="1" max="31" value={form.statement_day} onChange={e => setForm({ ...form, statement_day: e.target.value })} /></Field>}
    <Field label="Напомнить за, дней"><input type="number" min="0" max="30" value={form.reminder_days_before} onChange={e => setForm({ ...form, reminder_days_before: e.target.value })} /></Field>
    <Field label={form.kind === "deposit" ? "Счёт для зачисления дохода" : "Обычный счёт оплаты"}><AccountSelect accounts={accounts} value={form.source_account_id} onChange={value => setForm({ ...form, source_account_id: value })} allowEmpty /></Field>
    {form.kind === "credit_card" && <Field label="Счёт кредитной карты"><AccountSelect accounts={accounts} value={form.linked_account_id} onChange={value => setForm({ ...form, linked_account_id: value })} required /></Field>}
    {form.kind !== "credit_card" && <Field label={form.kind === "deposit" ? "Категория дохода" : "Категория платежа"}><CategoryPicker categories={categories.filter(item => item.type === (form.kind === "deposit" ? "income" : "expense"))} value={form.category_id} onChange={value => setForm({ ...form, category_id: value })} /></Field>}
    <Field label="Дата окончания" wide><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></Field>
    <Field label="Комментарий" wide><textarea rows="2" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
    <div className="credit-wide credit-form-actions"><button disabled={busy} type="submit">{busy ? "Сохраняем…" : "Сохранить"}</button><button type="button" className="btn-ghost" onClick={onCancel}>Отмена</button></div>
  </form></section>;
}

function Field({ label, wide = false, children }) { return <label className={wide ? "credit-wide" : ""}><span>{label}</span>{children}</label>; }
function AccountSelect({ accounts, value, onChange, allowEmpty = false, required = false }) { return <select required={required} value={value || ""} onChange={e => onChange(e.target.value)}><option value="">{allowEmpty ? "— не выбран —" : "Выберите счёт"}</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>; }

function CreditCard({ item, busy, onPay, onEdit, onClose, onRestore, onDelete }) {
  const dueText = item.next_payment_date ? new Date(`${item.next_payment_date}T12:00:00`).toLocaleDateString("ru-RU") : "не задан";
  const isDeposit = item.kind === "deposit";
  const availableCredit = item.kind === "credit_card" && item.credit_limit != null
    ? Math.max(0, Number(item.credit_limit) - Number(item.current_balance || 0))
    : null;
  return <article className={`credit-card ${item.is_overdue ? "credit-overdue" : ""}`}><div className="credit-card-head"><span>{KIND_LABELS[item.kind] || item.kind}</span><strong>{item.name}</strong>{item.counterparty && <small>{item.counterparty}</small>}</div><div className="credit-amount"><span>{isDeposit ? "Сумма депозита" : item.direction === "receivable" ? "Мне должны" : "Остаток"}</span><strong>{item.current_balance == null ? "—" : formatMoneyWithCurrency(item.current_balance, item.currency)}</strong></div><div className="credit-facts"><span>{isDeposit ? "Следующее поступление" : "Следующий платёж"} <strong>{dueText}</strong></span>{item.monthly_payment && <span>{isDeposit ? "Ожидаемый доход" : "Сумма"} <strong>{formatMoneyWithCurrency(item.monthly_payment, item.currency)}</strong></span>}{availableCredit != null && <span>Доступно <strong>{formatMoneyWithCurrency(availableCredit, item.currency)}</strong></span>}{item.linked_account_name && <span>Карта <strong>{item.linked_account_name}</strong></span>}</div>{item.is_overdue && <div className="credit-overdue-label">{isDeposit ? "Поступление не отмечено" : "Платёж просрочен"}</div>}<div className="credit-actions">{item.status === "active" && <button disabled={busy} onClick={() => onPay(item)}>{isDeposit ? "Доход получен" : item.direction === "receivable" ? "Получено" : "Оплачено"}</button>}<button className="btn-ghost" onClick={() => onEdit(item)}>Изменить</button>{onClose && <button className="btn-ghost" onClick={onClose}>Закрыть обязательство</button>}{onRestore && <button className="btn-ghost" onClick={onRestore}>Возобновить</button>}<button className="btn-danger credit-delete" disabled={busy} onClick={onDelete}>Удалить</button></div>{item.payments?.length > 0 && <details className="credit-history"><summary>{isDeposit ? "История доходов" : "История платежей"} ({item.payments.length})</summary>{item.payments.map(payment => <div key={payment.id}><span>{new Date(payment.paid_at).toLocaleDateString("ru-RU")}</span><strong>{formatMoneyWithCurrency(payment.amount, payment.currency)}</strong>{payment.notes && <small>{payment.notes}</small>}</div>)}</details>}</article>;
}

function PaymentModal({ item, payment, setPayment, accounts, busy, onSubmit, onCancel }) { const isDeposit = item.kind === "deposit"; return <div className="credit-modal-backdrop" onClick={onCancel}><section className="credit-payment-modal" onClick={e => e.stopPropagation()}><div className="credit-section-title"><h2>{isDeposit ? "Записать доход" : item.direction === "receivable" ? "Получить возврат" : "Записать платёж"}</h2><button type="button" className="btn-ghost" onClick={onCancel}>×</button></div><p>{item.name}</p><form onSubmit={onSubmit}><Field label={`Сумма, ${item.currency}`}><input autoFocus required type="number" min="0.01" step="0.01" value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value })} /></Field><Field label={isDeposit ? "На какой счёт зачислен доход" : item.direction === "receivable" ? "На какой счёт получили" : "С какого счёта оплатили"}><AccountSelect required accounts={accounts} value={payment.account_id} onChange={value => setPayment({ ...payment, account_id: value })} /></Field><Field label="Комментарий"><input value={payment.notes} onChange={e => setPayment({ ...payment, notes: e.target.value })} /></Field><div className="credit-form-actions"><button disabled={busy} type="submit">{busy ? "Записываем…" : "Подтвердить"}</button><button className="btn-ghost" type="button" onClick={onCancel}>Отмена</button></div></form></section></div>; }

const creditStyles = `.credits-page{max-width:1120px;padding-bottom:96px}.credits-title-row,.credit-section-title{display:flex;justify-content:space-between;align-items:center;gap:16px}.credits-title-row h1{margin-bottom:3px}.credits-title-row p{margin:0;color:#7a8590}.credits-alert{margin:14px 0;padding:11px 14px;border-radius:8px}.credits-error{background:#fff0ec;color:#a83220}.credits-success{background:#edf8f1;color:#12683e}.credit-form-card,.credit-card,.credit-empty,.closed-credits{background:#fffdf7;border:1px solid #e4ddcd;border-radius:12px;padding:18px;margin-top:16px}.credit-section-title h2{margin:0;font-size:20px}.credit-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px;margin-top:16px}.credit-form label,.credit-payment-modal label{display:grid;gap:5px}.credit-form label>span,.credit-payment-modal label>span{color:#6f7b86;font-size:12px}.credit-wide{grid-column:1/-1}.credit-form textarea{resize:vertical}.credit-check.credit-wide,.credit-form .credit-check{display:flex;align-items:center;gap:9px;min-height:28px;cursor:pointer}.credit-check input{width:16px;height:16px;margin:0;flex:0 0 auto}.credit-check>span{font-size:14px!important;color:#515c68!important}.credit-form-actions{display:flex;gap:9px;align-items:center}.credit-funding{display:flex;align-items:end;gap:14px;padding:12px;background:#f6f1e5;border:1px solid #e5d7b8;border-radius:9px}.credit-funding label{flex:1}.credit-funding small{max-width:360px;color:#6f7b86;line-height:1.4}.credits-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.credit-card{display:grid;gap:14px}.credit-card-head{display:grid;gap:3px}.credit-card-head>span{color:#9c7b3c;font-size:11px;font-weight:700;text-transform:uppercase}.credit-card-head>strong{font-size:20px}.credit-card-head small{color:#7a8590}.credit-amount{display:grid;gap:3px}.credit-amount span{color:#7a8590;font-size:12px}.credit-amount strong{font-size:27px;color:#173a54}.credit-facts{display:grid;gap:6px;font-size:13px;color:#6f7b86}.credit-facts span{display:flex;justify-content:space-between;gap:12px}.credit-facts strong{color:#1b2531}.credit-actions{display:flex;flex-wrap:wrap;gap:7px}.credit-delete{margin-left:auto}.credit-overdue{border-color:#dc9a8b}.credit-overdue-label{color:#a83220;background:#fff0ec;border-radius:6px;padding:7px 9px;font-size:12px;font-weight:700}.credit-history{border-top:1px solid #ece6d8;padding-top:10px}.credit-history summary,.closed-credits summary{cursor:pointer;color:#173a54;font-weight:700}.credit-history>div{display:grid;grid-template-columns:1fr auto;gap:3px 12px;padding:8px 0;border-bottom:1px solid #f0ebdf}.credit-history small{grid-column:1/-1;color:#7a8590}.closed-credits{margin-top:18px}.closed-credits .credits-grid{margin-top:12px}.credit-modal-backdrop{position:fixed;inset:0;z-index:300;display:grid;place-items:center;padding:16px;background:rgba(10,29,44,.58)}.credit-payment-modal{width:min(460px,100%);background:#fffdf7;border-radius:14px;padding:20px;box-shadow:0 20px 50px rgba(10,29,44,.25)}.credit-payment-modal form{display:grid;gap:12px;margin-top:15px}.credit-empty{text-align:center;padding:35px 20px}.credit-empty h2{margin-top:0}.credit-empty p{color:#7a8590}@media(max-width:680px){.credits-title-row{align-items:flex-end}.credits-title-row p{font-size:13px}.credit-form{grid-template-columns:1fr}.credit-wide{grid-column:auto}.credit-funding{display:grid}.credit-delete{margin-left:0}.credits-grid{grid-template-columns:1fr}}`;
