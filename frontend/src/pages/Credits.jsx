import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import CategoryPicker from "../components/CategoryPicker";
import { formatMoneyWithCurrency } from "../utils/money";

const KIND_LABELS = { mortgage: "Ипотека", loan: "Кредит", credit_card: "Кредитная карта", private_debt: "Частный заём", deposit: "Депозит" };
const DEBT_KINDS = ["mortgage", "loan", "credit_card", "private_debt"];
const DEPOSIT_KINDS = ["deposit"];
const SCOPE = {
  debt: {
    kinds: DEBT_KINDS,
    defaultKind: "mortgage",
    title: "Кредиты и долги",
    description: "Будущие платежи, льготные периоды, займы и напоминания.",
    emptyTitle: "Пока нет кредитов и долгов",
    emptyText: "Добавьте будущий платёж — CaseMoney покажет ближайшую дату и напомнит о ней.",
  },
  deposit: {
    kinds: DEPOSIT_KINDS,
    defaultKind: "deposit",
    title: "Вклады",
    description: "Депозиты, проценты и ожидаемые поступления.",
    emptyTitle: "Пока нет вкладов",
    emptyText: "Добавьте вклад — CaseMoney посчитает ожидаемый доход и напомнит о поступлении.",
  },
};
const emptyForm = defaultKind => ({ name: "", kind: defaultKind, direction: defaultKind === "deposit" ? "receivable" : "owe", currency: "RUB", counterparty: "", original_amount: "", current_balance: "", credit_limit: "", monthly_payment: "", annual_interest_rate: "", early_repayment_mode: "reduce_term", interest_payout_frequency: "monthly", capitalization: false, opened_at: "", due_day: "", statement_day: "", next_payment_date: "", end_date: "", reminder_days_before: "3", source_account_id: "", linked_account_id: "", funds_received: false, funds_account_id: "", category_id: "", notes: "" });
const optionalNumber = value => value === "" || value == null ? null : Number(value);
const optionalId = value => value === "" || value == null ? null : Number(value);

export default function Credits({ scope = "debt" }) {
  const scopeConfig = SCOPE[scope];
  const [credits, setCredits] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => emptyForm(scopeConfig.defaultKind));
  const [paying, setPaying] = useState(null);
  const [payment, setPayment] = useState({ amount: "", account_id: "", notes: "", is_early_payment: false, early_repayment_mode: "reduce_term" });
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
    } catch (err) { setError(err.response?.data?.detail || `Не удалось загрузить: ${scopeConfig.title.toLowerCase()}`); }
    finally { setLoading(false); }
  }, [scopeConfig.title]);
  useEffect(() => { load(); }, [load]);

  const inScope = credits.filter(item => scopeConfig.kinds.includes(item.kind));
  const active = inScope.filter(item => item.status === "active");
  const closed = inScope.filter(item => item.status === "closed");
  const currencies = useMemo(() => {
    const values = new Set(["RUB"]);
    accounts.forEach(account => (account.balances || []).forEach(balance => values.add(balance.currency)));
    return [...values];
  }, [accounts]);

  const openCreate = () => { setEditingId(null); setForm(emptyForm(scopeConfig.defaultKind)); setShowForm(true); };
  const openEdit = item => { setEditingId(item.id); setForm(Object.fromEntries(Object.keys(emptyForm(scopeConfig.defaultKind)).map(key => [key, item[key] ?? ""]))); setShowForm(true); };

  const submitCredit = async event => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const payload = { ...form, original_amount: optionalNumber(form.original_amount), current_balance: optionalNumber(form.current_balance), credit_limit: optionalNumber(form.credit_limit), monthly_payment: optionalNumber(form.monthly_payment), annual_interest_rate: optionalNumber(form.annual_interest_rate), capitalization: Boolean(form.capitalization), funds_received: Boolean(form.funds_received), funds_account_id: optionalId(form.funds_account_id), opened_at: form.opened_at || null, interest_payout_frequency: form.kind === "deposit" ? form.interest_payout_frequency : null, due_day: optionalNumber(form.due_day), statement_day: optionalNumber(form.statement_day), reminder_days_before: Number(form.reminder_days_before || 0), source_account_id: optionalId(form.source_account_id), linked_account_id: optionalId(form.linked_account_id), category_id: optionalId(form.category_id), next_payment_date: form.next_payment_date || null, end_date: form.end_date || null, counterparty: form.counterparty || null, notes: form.notes || null };
    if (editingId) ["kind", "direction", "currency"].forEach(key => delete payload[key]);
    try {
      if (editingId) await api.patch(`/api/credits/${editingId}`, payload); else await api.post("/api/credits/", payload);
      setMessage(editingId ? "Изменения сохранены" : (scope === "deposit" ? "Вклад добавлен" : "Обязательство добавлено")); setShowForm(false); await load();
    } catch (err) { const detail = err.response?.data?.detail; setError(Array.isArray(detail) ? detail.map(item => item.msg).join("; ") : detail || "Не удалось сохранить"); }
    finally { setBusy(false); }
  };

  const openPayment = (item, early = false) => { setPaying(item); setPayment({ amount: early ? "" : item.monthly_payment || "", account_id: item.source_account_id || "", notes: "", is_early_payment: early, early_repayment_mode: item.early_repayment_mode || "reduce_term" }); };
  const submitPayment = async event => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api.post(`/api/credits/${paying.id}/payments`, { amount: Number(payment.amount), account_id: Number(payment.account_id), notes: payment.notes || null, is_early_payment: Boolean(payment.is_early_payment), early_repayment_mode: payment.is_early_payment ? payment.early_repayment_mode : null });
      setPaying(null); setMessage(payment.is_early_payment ? "Досрочное погашение записано" : paying.kind === "deposit" ? "Доход по депозиту записан" : paying.direction === "receivable" ? "Возврат получен и записан" : "Платёж записан"); await load();
    } catch (err) { setError(err.response?.data?.detail || "Не удалось записать платёж"); }
    finally { setBusy(false); }
  };
  const setStatus = async (item, status) => { setBusy(true); try { await api.patch(`/api/credits/${item.id}`, { status }); await load(); } catch (err) { setError(err.response?.data?.detail || "Не удалось изменить статус"); } finally { setBusy(false); } };
  const deleteCredit = async item => {
    const paymentCount = item.payments?.length || 0;
    const suffix = paymentCount
      ? ` Вместе с ним будут удалены ${paymentCount} связанных платеж${paymentCount === 1 ? "" : paymentCount < 5 ? "а" : "ей"} и соответствующие операции по счетам.`
      : "";
    const noun = scope === "deposit" ? "вклад" : "обязательство";
    if (!confirm(`Удалить ${noun} «${item.name}»?${suffix}\n\nВосстановить нельзя.`)) return;
    setBusy(true); setError("");
    try { await api.delete(`/api/credits/${item.id}`); setMessage(scope === "deposit" ? "Вклад и связанные платежи удалены" : "Обязательство и связанные платежи удалены"); await load(); }
    catch (err) { setError(err.response?.data?.detail || `Не удалось удалить ${noun}`); }
    finally { setBusy(false); }
  };

  return <main className="page credits-page">
    <div className="credits-title-row"><div><h1>{scopeConfig.title}</h1><p>{scopeConfig.description}</p></div><button onClick={openCreate}>+ Добавить</button></div>
    {error && <div className="credits-alert credits-error">{error}</div>}{message && <div className="credits-alert credits-success">{message}</div>}
    {showForm && <CreditForm form={form} setForm={setForm} editingId={editingId} busy={busy} accounts={accounts} categories={categories} currencies={currencies} kindOptions={scopeConfig.kinds} onSubmit={submitCredit} onCancel={() => setShowForm(false)} />}
    {loading ? <p>Обновляем данные…</p> : active.length === 0 && !showForm ? <section className="credit-empty"><h2>{scopeConfig.emptyTitle}</h2><p>{scopeConfig.emptyText}</p><button onClick={openCreate}>Добавить первый</button></section> : <div className="credits-grid">{active.map(item => <CreditCard key={item.id} item={item} busy={busy} onPay={openPayment} onEdit={openEdit} onClose={() => setStatus(item, "closed")} onDelete={() => deleteCredit(item)} />)}</div>}
    {scope === "debt" && <MortgageOverview items={active.filter(item => item.kind === "mortgage")} />}
    {closed.length > 0 && <details className="closed-credits"><summary>Закрытые ({closed.length})</summary><div className="credits-grid">{closed.map(item => <CreditCard key={item.id} item={item} busy={busy} onEdit={openEdit} onRestore={() => setStatus(item, "active")} onDelete={() => deleteCredit(item)} />)}</div></details>}
    {paying && <PaymentModal item={paying} payment={payment} setPayment={setPayment} accounts={accounts} busy={busy} onSubmit={submitPayment} onCancel={() => setPaying(null)} />}
    <style>{creditStyles}{mortgageStyles}</style>
  </main>;
}

function CreditForm({ form, setForm, editingId, busy, accounts, categories, currencies, kindOptions, onSubmit, onCancel }) {
  const depositIncome = form.kind === "deposit" && form.annual_interest_rate && (form.current_balance || form.original_amount)
    ? Number(form.current_balance || form.original_amount) * Number(form.annual_interest_rate) / 100 / (form.interest_payout_frequency === "monthly" ? 12 : 1)
    : null;
  return <section className="credit-form-card"><div className="credit-section-title"><h2>{editingId ? "Изменить запись" : "Новая запись"}</h2><button type="button" className="btn-ghost" onClick={onCancel}>×</button></div><form onSubmit={onSubmit} className="credit-form">
    <Field label="Название"><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Например, ипотека" /></Field>
    {!editingId && kindOptions.length > 1 && <Field label="Тип"><select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value, category_id: "", direction: e.target.value === "deposit" ? "receivable" : e.target.value === "private_debt" ? form.direction : "owe" })}>{kindOptions.map(value => <option key={value} value={value}>{KIND_LABELS[value]}</option>)}</select></Field>}
    {!editingId && form.kind === "private_debt" && <Field label="Направление"><select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value, funds_received: e.target.value === "receivable" ? false : form.funds_received, funds_account_id: e.target.value === "receivable" ? "" : form.funds_account_id })}><option value="owe">Я должен</option><option value="receivable">Мне должны</option></select></Field>}
    <Field label="Валюта"><select disabled={Boolean(editingId)} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>{currencies.map(item => <option key={item}>{item}</option>)}</select></Field>
    <Field label={form.kind === "deposit" ? "Банк" : "Кредитор или человек"}><input value={form.counterparty} onChange={e => setForm({ ...form, counterparty: e.target.value })} /></Field>
    <Field label={form.kind === "deposit" ? "Первоначальная сумма депозита" : "Первоначальная сумма"}><input type="number" min="0" step="0.01" value={form.original_amount} onChange={e => setForm({ ...form, original_amount: e.target.value })} /></Field>
    <Field label={form.kind === "deposit" ? "Текущая сумма депозита" : "Остаток долга"}><input type="number" min="0" step="0.01" value={form.current_balance} onChange={e => setForm({ ...form, current_balance: e.target.value })} /></Field>
    {!editingId && form.direction === "owe" && form.kind !== "deposit" && form.kind !== "credit_card" && <><label className="credit-check credit-wide"><input type="checkbox" checked={form.funds_received} onChange={e => setForm({ ...form, funds_received: e.target.checked, funds_account_id: e.target.checked ? form.funds_account_id : "" })} /><span>Деньги получены на мой счёт</span></label>{form.funds_received && <div className="credit-wide credit-funding"><Field label="Счёт зачисления"><AccountSelect required accounts={accounts} value={form.funds_account_id} onChange={value => setForm({ ...form, funds_account_id: value })} /></Field><small>Сумма увеличит остаток счёта, но не попадёт в доходы и отчёты.</small></div>}</>}
    {form.kind === "credit_card" && <Field label="Кредитный лимит"><input type="number" min="0" step="0.01" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} /></Field>}
    {form.kind === "mortgage" && <><Field label="Годовая ставка, %"><input type="number" min="0" max="100" step="0.01" value={form.annual_interest_rate} onChange={e => setForm({ ...form, annual_interest_rate: e.target.value })} /><small className="credit-field-hint">При оплате система отделит проценты от погашения тела кредита.</small></Field><Field label="После досрочного платежа"><select value={form.early_repayment_mode} onChange={e => setForm({ ...form, early_repayment_mode: e.target.value })}><option value="reduce_term">Уменьшать срок кредита</option><option value="reduce_payment">Уменьшать ежемесячный платёж</option></select><small className="credit-field-hint">Этот вариант можно изменить и в форме досрочного платежа.</small></Field></>}
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

function MortgageOverview({ items }) {
  const [schedules, setSchedules] = useState({});
  const scheduleKey = items.map(item => `${item.id}:${item.current_balance}:${item.monthly_payment}:${item.next_payment_date}`).join("|");
  useEffect(() => {
    let active = true;
    const ids = scheduleKey ? scheduleKey.split("|").map(value => Number(value.split(":")[0])) : [];
    Promise.all(ids.map(id => api.get(`/api/credits/${id}/schedule`).then(response => [id, response.data]).catch(() => [id, null])))
      .then(entries => { if (active) setSchedules(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [scheduleKey]);
  if (!items.length) return null;
  return <section className="mortgage-overview">
    <h2>Прогресс и график по ипотеке</h2>
    <p>График показывает будущие платежи по текущему остатку. История уже записанных платежей не меняется.</p>
    {items.map(item => {
      const original = Number(item.original_amount || item.current_balance || 0);
      const balance = Math.max(0, Number(item.current_balance || 0));
      const repaid = Math.max(0, original - balance);
      const progress = original ? Math.min(100, repaid / original * 100) : 0;
      const rate = Number(item.annual_interest_rate || 0) / 1200;
      const payment = Number(item.monthly_payment || 0);
      let remaining = balance;
      let months = 0;
      while (remaining > 0.01 && payment > 0 && months < 600) {
        const principal = Math.max(0, payment - remaining * rate);
        if (principal <= 0) break;
        remaining -= principal;
        months += 1;
      }
      const schedule = schedules[item.id];
      return <article key={item.id}>
        <div><strong>{item.name}</strong><span>{Math.round(progress)}% погашено</span></div>
        <div className="mortgage-progress"><i style={{ width: `${progress}%` }} /></div>
        <small>{months ? `При текущем платеже — ещё примерно ${months} мес.` : "Укажите регулярный платёж, чтобы увидеть срок."} Досрочный платёж: {item.early_repayment_mode === "reduce_payment" ? "уменьшает платёж" : "уменьшает срок"}.</small>
        {schedule?.items?.length > 0 && <details className="mortgage-schedule"><summary>Будущие платежи ({schedule.items.length})</summary><div className="mortgage-schedule-scroll"><table><thead><tr><th>Дата</th><th>Платёж</th><th>Тело</th><th>Проценты</th><th>Остаток</th></tr></thead><tbody>{schedule.items.map(row => <tr key={row.payment_date}><td>{new Date(`${row.payment_date}T12:00:00`).toLocaleDateString("ru-RU")}</td><td>{formatMoneyWithCurrency(row.payment_amount, schedule.currency)}</td><td>{formatMoneyWithCurrency(row.principal_amount, schedule.currency)}</td><td>{formatMoneyWithCurrency(row.interest_amount, schedule.currency)}</td><td>{formatMoneyWithCurrency(row.balance_after, schedule.currency)}</td></tr>)}</tbody></table></div></details>}
      </article>;
    })}
  </section>;
}

function CreditCard({ item, busy, onPay, onEdit, onClose, onRestore, onDelete }) {
  const dueText = item.next_payment_date ? new Date(`${item.next_payment_date}T12:00:00`).toLocaleDateString("ru-RU") : "не задан";
  const isDeposit = item.kind === "deposit";
  const availableCredit = item.kind === "credit_card" && item.credit_limit != null
    ? Math.max(0, Number(item.credit_limit) - Number(item.current_balance || 0))
    : null;
  const allowsEarlyPayment = item.status === "active" && item.direction === "owe" && ["mortgage", "loan", "private_debt"].includes(item.kind);
  return <article className={`credit-card ${item.is_overdue ? "credit-overdue" : ""}`}><div className="credit-card-head"><span>{KIND_LABELS[item.kind] || item.kind}</span><strong>{item.name}</strong>{item.counterparty && <small>{item.counterparty}</small>}</div><div className="credit-amount"><span>{isDeposit ? "Сумма депозита" : item.direction === "receivable" ? "Мне должны" : "Остаток"}</span><strong>{item.current_balance == null ? "—" : formatMoneyWithCurrency(item.current_balance, item.currency)}</strong></div><div className="credit-facts"><span>{isDeposit ? "Следующее поступление" : "Следующий платёж"} <strong>{dueText}</strong></span>{item.monthly_payment && <span>{isDeposit ? "Ожидаемый доход" : "Сумма"} <strong>{formatMoneyWithCurrency(item.monthly_payment, item.currency)}</strong></span>}{availableCredit != null && <span>Доступно <strong>{formatMoneyWithCurrency(availableCredit, item.currency)}</strong></span>}{item.linked_account_name && <span>Карта <strong>{item.linked_account_name}</strong></span>}</div>{item.is_overdue && <div className="credit-overdue-label">{isDeposit ? "Поступление не отмечено" : "Платёж просрочен"}</div>}<div className="credit-actions">{item.status === "active" && <button disabled={busy} onClick={() => onPay(item)}>{isDeposit ? "Доход получен" : item.direction === "receivable" ? "Получено" : "Оплачено"}</button>}{allowsEarlyPayment && <button type="button" className="btn-secondary" disabled={busy} onClick={() => onPay(item, true)}>Досрочно</button>}<button className="btn-ghost" onClick={() => onEdit(item)}>Изменить</button>{onClose && <button className="btn-ghost" onClick={onClose}>Закрыть обязательство</button>}{onRestore && <button className="btn-ghost" onClick={onRestore}>Возобновить</button>}<button className="btn-danger credit-delete" disabled={busy} onClick={onDelete}>Удалить</button></div>{item.payments?.length > 0 && <details className="credit-history"><summary>{isDeposit ? "История доходов" : "История платежей"} ({item.payments.length})</summary>{item.payments.map(payment => <div key={payment.id}><span>{new Date(payment.paid_at).toLocaleDateString("ru-RU")}</span><strong>{formatMoneyWithCurrency(payment.amount, payment.currency)}</strong>{payment.is_early_payment && <small>Досрочное погашение</small>}{payment.principal_amount != null && <small>Тело: {formatMoneyWithCurrency(payment.principal_amount, payment.currency)} · проценты: {formatMoneyWithCurrency(payment.interest_amount, payment.currency)}</small>}{payment.notes && <small>{payment.notes}</small>}</div>)}</details>}</article>;
}

function PaymentModal({ item, payment, setPayment, accounts, busy, onSubmit, onCancel }) { const isDeposit = item.kind === "deposit"; const amount = Number(payment.amount || 0); const monthlyInterest = !payment.is_early_payment && item.kind === "mortgage" && item.annual_interest_rate != null ? Math.min(amount, Number(item.current_balance || 0) * Number(item.annual_interest_rate) / 1200) : null; const principal = payment.is_early_payment ? Math.min(Number(item.current_balance || 0), amount) : monthlyInterest == null ? null : Math.min(Number(item.current_balance || 0), Math.max(0, amount - monthlyInterest)); const canChooseEarlyMode = payment.is_early_payment && item.kind === "mortgage"; return <div className="credit-modal-backdrop" onClick={onCancel}><section className="credit-payment-modal" onClick={e => e.stopPropagation()}><div className="credit-section-title"><h2>{payment.is_early_payment ? "Досрочное погашение" : isDeposit ? "Записать доход" : item.direction === "receivable" ? "Получить возврат" : "Записать платёж"}</h2><button type="button" className="btn-ghost" onClick={onCancel}>×</button></div><p>{payment.is_early_payment ? "Вся введённая сумма уменьшит тело долга, без процентов." : item.name}</p><form onSubmit={onSubmit}><Field label={`Сумма, ${item.currency}`}><input autoFocus required type="number" min="0.01" step="0.01" value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value })} /></Field>{canChooseEarlyMode && <Field label="После досрочного платежа"><select value={payment.early_repayment_mode} onChange={e => setPayment({ ...payment, early_repayment_mode: e.target.value })}><option value="reduce_term">Уменьшить срок кредита</option><option value="reduce_payment">Уменьшить ежемесячный платёж</option></select><small className="credit-field-hint">Выбор сохранится для следующих досрочных платежей.</small></Field>}{principal != null && <div className="mortgage-split"><strong>{payment.is_early_payment ? "Погашение тела кредита" : "Из этой суммы"}</strong><span>Тело кредита <b>{formatMoneyWithCurrency(principal, item.currency)}</b></span>{!payment.is_early_payment && <span>Проценты <b>{formatMoneyWithCurrency(amount - principal, item.currency)}</b></span>}{!payment.is_early_payment && <small>Расчёт по ставке {item.annual_interest_rate}% годовых. Изменить ставку можно в настройках ипотеки.</small>}</div>}<Field label={isDeposit ? "На какой счёт зачислен доход" : item.direction === "receivable" ? "На какой счёт получили" : "С какого счёта оплатили"}><AccountSelect required accounts={accounts} value={payment.account_id} onChange={value => setPayment({ ...payment, account_id: value })} /></Field><Field label="Комментарий"><input value={payment.notes} onChange={e => setPayment({ ...payment, notes: e.target.value })} /></Field><div className="credit-form-actions"><button disabled={busy} type="submit">{busy ? "Записываем…" : "Подтвердить"}</button><button className="btn-ghost" type="button" onClick={onCancel}>Отмена</button></div></form></section></div>; }

const mortgageStyles = `.credit-field-hint{display:block;color:#7a8590;line-height:1.35}.mortgage-split{display:grid;gap:6px;padding:11px 12px;border:1px solid #d9e0e4;border-radius:9px;background:#f5f8f8;font-size:13px}.mortgage-split>span{display:flex;justify-content:space-between;gap:12px;color:#526371}.mortgage-split b{color:#173a54}.mortgage-split small{color:#7a8590;line-height:1.35}.mortgage-overview{margin-top:18px;padding:18px;border:1px solid #e4ddcd;border-radius:12px;background:#fffdf7}.mortgage-overview h2{margin:0;color:#173a54;font-size:20px}.mortgage-overview>p{margin:5px 0 14px;color:#7a8590;font-size:13px}.mortgage-overview article{display:grid;gap:7px;padding:11px 0;border-top:1px solid #eee8dc}.mortgage-overview article>div:first-child{display:flex;justify-content:space-between;gap:12px}.mortgage-overview article>div:first-child span,.mortgage-overview small{color:#7a8590;font-size:12px}.mortgage-progress{height:9px;border-radius:999px;background:#eee9dd;overflow:hidden}.mortgage-progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#297c59,#4ea878)}.mortgage-schedule{margin-top:5px}.mortgage-schedule summary{cursor:pointer;color:#173a54;font-weight:700;font-size:13px}.mortgage-schedule-scroll{margin-top:9px;overflow:auto;border:1px solid #e8e1d2;border-radius:8px}.mortgage-schedule table{width:100%;min-width:640px;border-collapse:collapse;font-size:12px}.mortgage-schedule th,.mortgage-schedule td{padding:8px 10px;text-align:right;border-bottom:1px solid #eee8dc;white-space:nowrap}.mortgage-schedule th:first-child,.mortgage-schedule td:first-child{text-align:left}.mortgage-schedule th{background:#f5f0e5;color:#62707b;font-size:11px;text-transform:uppercase;letter-spacing:.03em}.mortgage-schedule tr:last-child td{border-bottom:0}@media(max-width:680px){.mortgage-overview{padding:15px}.mortgage-overview article>div:first-child{align-items:flex-start;flex-direction:column;gap:2px}.mortgage-schedule-scroll{margin-right:-2px}}`;

const creditStyles = `.credits-page{max-width:1120px;padding-bottom:96px}.credits-title-row,.credit-section-title{display:flex;justify-content:space-between;align-items:center;gap:16px}.credits-title-row h1{margin-bottom:3px}.credits-title-row p{margin:0;color:#7a8590}.credits-alert{margin:14px 0;padding:11px 14px;border-radius:8px}.credits-error{background:#fff0ec;color:#a83220}.credits-success{background:#edf8f1;color:#12683e}.credit-form-card,.credit-card,.credit-empty,.closed-credits{background:#fffdf7;border:1px solid #e4ddcd;border-radius:12px;padding:18px;margin-top:16px}.credit-section-title h2{margin:0;font-size:20px}.credit-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px;margin-top:16px}.credit-form label,.credit-payment-modal label{display:grid;gap:5px}.credit-form label>span,.credit-payment-modal label>span{color:#6f7b86;font-size:12px}.credit-wide{grid-column:1/-1}.credit-form textarea{resize:vertical}.credit-check.credit-wide,.credit-form .credit-check{display:flex;align-items:center;gap:9px;min-height:28px;cursor:pointer}.credit-check input{width:16px;height:16px;margin:0;flex:0 0 auto}.credit-check>span{font-size:14px!important;color:#515c68!important}.credit-form-actions{display:flex;gap:9px;align-items:center}.credit-funding{display:flex;align-items:end;gap:14px;padding:12px;background:#f6f1e5;border:1px solid #e5d7b8;border-radius:9px}.credit-funding label{flex:1}.credit-funding small{max-width:360px;color:#6f7b86;line-height:1.4}.credits-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.credit-card{display:grid;gap:14px}.credit-card-head{display:grid;gap:3px}.credit-card-head>span{color:#9c7b3c;font-size:11px;font-weight:700;text-transform:uppercase}.credit-card-head>strong{font-size:20px}.credit-card-head small{color:#7a8590}.credit-amount{display:grid;gap:3px}.credit-amount span{color:#7a8590;font-size:12px}.credit-amount strong{font-size:27px;color:#173a54}.credit-facts{display:grid;gap:6px;font-size:13px;color:#6f7b86}.credit-facts span{display:flex;justify-content:space-between;gap:12px}.credit-facts strong{color:#1b2531}.credit-actions{display:flex;flex-wrap:wrap;gap:7px}.credit-delete{margin-left:auto}.credit-overdue{border-color:#dc9a8b}.credit-overdue-label{color:#a83220;background:#fff0ec;border-radius:6px;padding:7px 9px;font-size:12px;font-weight:700}.credit-history{border-top:1px solid #ece6d8;padding-top:10px}.credit-history summary,.closed-credits summary{cursor:pointer;color:#173a54;font-weight:700}.credit-history>div{display:grid;grid-template-columns:1fr auto;gap:3px 12px;padding:8px 0;border-bottom:1px solid #f0ebdf}.credit-history small{grid-column:1/-1;color:#7a8590}.closed-credits{margin-top:18px}.closed-credits .credits-grid{margin-top:12px}.credit-modal-backdrop{position:fixed;inset:0;z-index:300;display:grid;place-items:center;padding:16px;background:rgba(10,29,44,.58)}.credit-payment-modal{width:min(460px,100%);background:#fffdf7;border-radius:14px;padding:20px;box-shadow:0 20px 50px rgba(10,29,44,.25)}.credit-payment-modal form{display:grid;gap:12px;margin-top:15px}.credit-empty{text-align:center;padding:35px 20px}.credit-empty h2{margin-top:0}.credit-empty p{color:#7a8590}@media(max-width:680px){.credits-page{padding-bottom:150px}.credits-title-row{align-items:stretch;flex-direction:column;gap:12px}.credits-title-row p{font-size:13px}.credits-title-row>button{width:100%}.credit-form{grid-template-columns:1fr}.credit-wide{grid-column:auto}.credit-funding{display:grid}.credit-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.credit-actions button{width:100%;min-width:0}.credit-delete{margin-left:0}.credits-grid{grid-template-columns:1fr}}`;
