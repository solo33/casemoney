import CategoryPicker from "../CategoryPicker";
import { useState, useEffect } from "react";

import api from "../../api/client";
import { formatMoneyWithCurrency } from "../../utils/money";
import { KIND_LABELS } from "../../utils/creditsView";

export function CreditForm({ form, setForm, editingId, busy, accounts, categories, currencies, kindOptions, onSubmit, onCancel }) {
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
    {form.kind === "deposit" && <><Field label="Годовая ставка, %"><input type="number" min="0" max="100" step="0.01" value={form.annual_interest_rate} onChange={e => setForm({ ...form, annual_interest_rate: e.target.value })} /></Field><Field label="Выплата процентов"><select value={form.interest_payout_frequency} onChange={e => setForm({ ...form, interest_payout_frequency: e.target.value })}><option value="monthly">Ежемесячно</option><option value="maturity">В конце срока</option></select></Field><Field label="Учёт ожидаемых процентов"><select value={form.interest_accrual_mode} onChange={e => setForm({ ...form, interest_accrual_mode: e.target.value })}><option value="manual">Только напоминание</option><option value="planned">Создавать плановый доход</option></select><small className="credit-field-hint">Плановый доход появится в расписании, но не изменит остаток до подтверждения поступления.</small></Field><Field label="Дата открытия"><input type="date" value={form.opened_at} onChange={e => setForm({ ...form, opened_at: e.target.value })} /></Field><label className="credit-check"><input type="checkbox" checked={form.capitalization} onChange={e => setForm({ ...form, capitalization: e.target.checked })} /><span>Капитализация процентов</span></label></>}
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

export function Field({ label, wide = false, children }) { return <label className={wide ? "credit-wide" : ""}><span>{label}</span>{children}</label>; }

export function AccountSelect({ accounts, value, onChange, allowEmpty = false, required = false }) { return <select required={required} value={value || ""} onChange={e => onChange(e.target.value)}><option value="">{allowEmpty ? "— не выбран —" : "Выберите счёт"}</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>; }

export function MortgageOverview({ items }) {
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

export function CreditCard({ item, busy, onPay, onEdit, onClose, onRestore, onDelete }) {
  const dueText = item.next_payment_date ? new Date(`${item.next_payment_date}T12:00:00`).toLocaleDateString("ru-RU") : "не задан";
  const isDeposit = item.kind === "deposit";
  const availableCredit = item.kind === "credit_card" && item.credit_limit != null
    ? Math.max(0, Number(item.credit_limit) - Number(item.current_balance || 0))
    : null;
  const allowsEarlyPayment = item.status === "active" && item.direction === "owe" && ["mortgage", "loan", "private_debt"].includes(item.kind);
  return <article className={`credit-card ${item.is_overdue ? "credit-overdue" : ""}`}><div className="credit-card-head"><span>{KIND_LABELS[item.kind] || item.kind}</span><strong>{item.name}</strong>{item.counterparty && <small>{item.counterparty}</small>}</div><div className="credit-amount"><span>{isDeposit ? "Сумма депозита" : item.direction === "receivable" ? "Мне должны" : "Остаток"}</span><strong>{item.current_balance == null ? "—" : formatMoneyWithCurrency(item.current_balance, item.currency)}</strong></div><div className="credit-facts"><span>{isDeposit ? "Следующее поступление" : "Следующий платёж"} <strong>{dueText}</strong></span>{item.monthly_payment && <span>{isDeposit ? "Ожидаемый доход" : "Сумма"} <strong>{formatMoneyWithCurrency(item.monthly_payment, item.currency)}</strong></span>}{availableCredit != null && <span>Доступно <strong>{formatMoneyWithCurrency(availableCredit, item.currency)}</strong></span>}{item.linked_account_name && <span>Карта <strong>{item.linked_account_name}</strong></span>}</div>{item.is_overdue && <div className="credit-overdue-label">{isDeposit ? "Поступление не отмечено" : "Платёж просрочен"}</div>}<div className="credit-actions">{item.status === "active" && <button disabled={busy} onClick={() => onPay(item)}>{isDeposit ? "Доход получен" : item.direction === "receivable" ? "Получено" : "Оплачено"}</button>}{allowsEarlyPayment && <button type="button" className="btn-secondary" disabled={busy} onClick={() => onPay(item, true)}>Досрочно</button>}<button className="btn-ghost" onClick={() => onEdit(item)}>Изменить</button>{onClose && <button className="btn-ghost" onClick={onClose}>Закрыть обязательство</button>}{onRestore && <button className="btn-ghost" onClick={onRestore}>Возобновить</button>}<button className="btn-danger credit-delete" disabled={busy} onClick={onDelete}>Удалить</button></div>{item.payments?.length > 0 && <details className="credit-history"><summary>{isDeposit ? "История доходов" : "История платежей"} ({item.payments.length})</summary>{item.payments.map(payment => <div key={payment.id}><span>{new Date(payment.paid_at).toLocaleDateString("ru-RU")}</span><strong>{formatMoneyWithCurrency(payment.amount, payment.currency)}</strong>{payment.is_early_payment && <small>Досрочное погашение</small>}{payment.principal_amount != null && <small>Тело: {formatMoneyWithCurrency(payment.principal_amount, payment.currency)} · проценты: {formatMoneyWithCurrency(payment.interest_amount, payment.currency)}</small>}{payment.notes && <small>{payment.notes}</small>}</div>)}</details>}</article>;
}

export function PaymentModal({ item, payment, setPayment, accounts, busy, onSubmit, onCancel }) {
  const isDeposit = item.kind === "deposit";
  const canChooseEarlyMode = payment.is_early_payment && item.kind === "mortgage";
  const [split, setSplit] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (payment.is_early_payment || item.kind !== "mortgage" || !Number(payment.amount)) {
      setSplit(null);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get(`/api/credits/${item.id}/payment-preview`, { params: { amount: Number(payment.amount) } });
        if (!cancelled) setSplit(response.data);
      } catch {
        if (!cancelled) setSplit(null);
      }
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [item.id, item.kind, payment.amount, payment.is_early_payment]);

  const principal = payment.is_early_payment ? Math.min(Number(item.current_balance || 0), Number(payment.amount || 0)) : split?.principal_amount;
  const interest = payment.is_early_payment ? 0 : split?.interest_amount;
  return <div className="credit-modal-backdrop" onClick={onCancel}><section className="credit-payment-modal" onClick={e => e.stopPropagation()}><div className="credit-section-title"><h2>{payment.is_early_payment ? "Досрочное погашение" : isDeposit ? "Записать доход" : item.direction === "receivable" ? "Получить возврат" : "Записать платёж"}</h2><button type="button" className="btn-ghost" onClick={onCancel}>×</button></div><p>{payment.is_early_payment ? "Вся введённая сумма уменьшит тело долга, без процентов." : item.name}</p><form onSubmit={onSubmit}><Field label={`Сумма, ${item.currency}`}><input autoFocus required type="number" min="0.01" step="0.01" value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value })} /></Field>{canChooseEarlyMode && <Field label="После досрочного платежа"><select value={payment.early_repayment_mode} onChange={e => setPayment({ ...payment, early_repayment_mode: e.target.value })}><option value="reduce_term">Уменьшить срок кредита</option><option value="reduce_payment">Уменьшить ежемесячный платёж</option></select><small className="credit-field-hint">Выбор сохранится для следующих досрочных платежей.</small></Field>}{principal != null && <div className="mortgage-split"><strong>{payment.is_early_payment ? "Погашение тела кредита" : "Из этой суммы"}</strong><span>Тело кредита <b>{formatMoneyWithCurrency(principal, item.currency)}</b></span>{!payment.is_early_payment && <span>Проценты <b>{formatMoneyWithCurrency(interest, item.currency)}</b></span>}{!payment.is_early_payment && <small>Расчёт на сервере по ставке {item.annual_interest_rate}% годовых. Изменить ставку можно в настройках ипотеки.</small>}</div>}<Field label={isDeposit ? "На какой счёт зачислен доход" : item.direction === "receivable" ? "На какой счёт получили" : "С какого счёта оплатили"}><AccountSelect required accounts={accounts} value={payment.account_id} onChange={value => setPayment({ ...payment, account_id: value })} /></Field><Field label="Комментарий"><input value={payment.notes} onChange={e => setPayment({ ...payment, notes: e.target.value })} /></Field><div className="credit-form-actions"><button disabled={busy} type="submit">{busy ? "Записываем…" : "Подтвердить"}</button><button className="btn-ghost" type="button" onClick={onCancel}>Отмена</button></div></form></section></div>;
}
