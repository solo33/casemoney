
import { useState, useCallback, useEffect, useMemo } from "react";

import api from "../api/client";

import { SCOPE, emptyForm, optionalNumber, optionalId, creditStyles, mortgageStyles } from "../utils/creditsView";
import { CreditForm, CreditCard, MortgageOverview, PaymentModal } from "../components/credits/CreditsParts";

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
    const payload = { ...form, original_amount: optionalNumber(form.original_amount), current_balance: optionalNumber(form.current_balance), credit_limit: optionalNumber(form.credit_limit), monthly_payment: optionalNumber(form.monthly_payment), annual_interest_rate: optionalNumber(form.annual_interest_rate), capitalization: Boolean(form.capitalization), funds_received: Boolean(form.funds_received), funds_account_id: optionalId(form.funds_account_id), opened_at: form.opened_at || null, interest_payout_frequency: form.kind === "deposit" ? form.interest_payout_frequency : null, interest_accrual_mode: form.kind === "deposit" ? form.interest_accrual_mode : "manual", due_day: optionalNumber(form.due_day), statement_day: optionalNumber(form.statement_day), reminder_days_before: Number(form.reminder_days_before || 0), source_account_id: optionalId(form.source_account_id), linked_account_id: optionalId(form.linked_account_id), category_id: optionalId(form.category_id), next_payment_date: form.next_payment_date || null, end_date: form.end_date || null, counterparty: form.counterparty || null, notes: form.notes || null };
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
