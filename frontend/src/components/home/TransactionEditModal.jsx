import { useState, useEffect, useCallback } from "react";

import api from "../../api/client";

import AccountOptions from "../../components/AccountOptions";
import CategoryPicker from "../../components/CategoryPicker";

import AmountInput from "../../components/AmountInput";
import CurrencyField from "../../components/CurrencyField";
import useTransferQuote from "../../hooks/useTransferQuote";
import { sortCurrenciesRubFirst } from "../../utils/money";

const TYPE_TABS = [
  { value: "expense", label: "↘ Расход", color: "#c0432b" },
  { value: "transfer", label: "⇄ Перевод", color: "#2f6296" },
  { value: "income", label: "↗ Доход", color: "#167a4a" },
];

export function TxEditModal({ tx, accounts, accountGroups, categories, canUseFamily, onCategoryCreated, onClose, onSaved }) {
  const [form, setForm] = useState({
    amount: String(tx.amount),
    type: tx.type,
    currency: tx.currency,
    account_id: String(tx.account_id),
    category_id: tx.category_id ? String(tx.category_id) : "",
    to_account_id: tx.to_account_id ? String(tx.to_account_id) : "",
    to_amount: tx.to_amount != null ? String(tx.to_amount) : "",
    to_currency: tx.to_currency || "",
    description: tx.description || "",
    date: new Date(tx.date).toISOString().slice(0, 10),
    is_family_expense: Boolean(tx.is_family_expense),
    reimbursement_amount: tx.reimbursement_amount ? String(tx.reimbursement_amount) : "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const acc = accounts.find(a => String(a.id) === form.account_id);
  const accCurrencies = sortCurrenciesRubFirst(
    (acc?.balances || []).map(b => b.currency)
  );
  const targetAccount = accounts.find(a => String(a.id) === form.to_account_id);
  const targetCurrencies = sortCurrenciesRubFirst(
    (targetAccount?.balances || []).map(b => b.currency)
  );
  const sameTransferCurrency = form.type === "transfer"
    && Boolean(form.currency)
    && form.currency === form.to_currency;
  useEffect(() => {
    if (form.type !== "transfer" || !targetAccount) return;
    if (!targetCurrencies.includes(form.to_currency)) {
      setForm(current => ({ ...current, to_currency: targetCurrencies[0] || "", to_amount: "" }));
    }
  }, [form.type, targetAccount, targetCurrencies.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const applyTransferQuote = useCallback(toAmount => {
    setForm(current => current.to_amount === toAmount ? current : { ...current, to_amount: toAmount });
  }, []);
  const { loading: quoteLoading } = useTransferQuote({
    enabled: form.type === "transfer" && !sameTransferCurrency,
    amount: form.amount,
    fromCurrency: form.currency,
    toCurrency: form.to_currency,
    onQuote: applyTransferQuote,
  });
  const displayedRate = Number(form.amount) > 0 && Number(form.to_amount) > 0
    ? Number(form.to_amount) / Number(form.amount)
    : null;
  const cats = form.type === "transfer"
    ? [] : categories.filter(c => c.type === form.type);

  const save = async (e) => {
    e.preventDefault();
    if (form.type === "transfer") {
      if (!form.to_account_id) { setErr("Выберите счёт-получатель"); return; }
      if (String(form.to_account_id) === String(form.account_id)) {
        setErr("Счёт-источник и получатель совпадают"); return;
      }
      if (!form.to_currency) { setErr("Выберите валюту счёта-получателя"); return; }
      if (!sameTransferCurrency && !(parseFloat(form.to_amount) > 0)) { setErr("Введите сумму зачисления"); return; }
    }
    setSaving(true);
    setErr(null);
    try {
      await api.patch(`/api/transactions/${tx.id}`, {
        amount: parseFloat(form.amount),
        type: form.type,
        currency: form.currency,
        account_id: parseInt(form.account_id),
        category_id: form.type === "transfer" || !form.category_id ? null : parseInt(form.category_id),
        to_account_id: form.type === "transfer" ? parseInt(form.to_account_id) : null,
        to_amount: form.type === "transfer" ? parseFloat(sameTransferCurrency ? form.amount : form.to_amount) : null,
        to_currency: form.type === "transfer" ? form.to_currency : null,
        is_family_expense: form.type === "expense" && form.is_family_expense,
        reimbursement_amount: form.type === "expense" && form.is_family_expense && form.reimbursement_amount !== ""
          ? parseFloat(form.reimbursement_amount)
          : null,
        description: form.description || null,
        date: new Date(form.date).toISOString(),
      });
      onSaved();
    } catch (e2) {
      setErr(e2.response?.data?.detail || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,30,45,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 16,
      }}
    >
      <form
        className="transaction-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Изменить запись"
        onClick={e => e.stopPropagation()}
        onSubmit={save}
        style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 12,
          padding: 20, width: "100%", maxWidth: 460, boxShadow: "0 20px 44px -16px rgba(15,30,45,0.4)",
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)" }}>Изменить запись</h3>

        <div style={{ display: "flex", gap: 6 }}>
          {TYPE_TABS.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, type: t.value, category_id: "" }))}
              style={{
                flex: 1, padding: "8px", border: "none", borderRadius: 6,
                background: form.type === t.value ? t.color : "#f6f2e9",
                color: form.type === t.value ? "#fff" : "#7a8590",
                fontWeight: form.type === t.value ? 700 : 500, cursor: "pointer", fontSize: 13,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <AmountInput
            type="number" step="0.01" min="0.01" value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            required containerStyle={{ flex: 1, minWidth: 0 }} inputStyle={{ width: "100%", textAlign: "right", fontWeight: 600, fontSize: 16 }}
          />
          <CurrencyField currencies={accCurrencies.length ? accCurrencies : [form.currency]} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
        </div>

        <select value={form.account_id} onChange={e => {
          const account = accounts.find(item => String(item.id) === e.target.value);
          const currencies = sortCurrenciesRubFirst((account?.balances || []).map(balance => balance.currency));
          setForm({ ...form, account_id: e.target.value, currency: currencies[0] || form.currency });
        }} required>
          <option value="">{form.type === "transfer" ? "— Со счёта —" : "— Счёт —"}</option>
          <AccountOptions groups={accountGroups} includeIds={[form.account_id]} />
        </select>

        {form.type === "transfer" ? (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8 }}>
            <button type="button" className="transfer-swap-button" disabled={!form.to_account_id} onClick={() => {
              const creditedAmount = sameTransferCurrency ? form.amount : form.to_amount;
              setForm(current => ({ ...current, account_id: current.to_account_id, currency: current.to_currency, amount: creditedAmount || "", to_account_id: current.account_id, to_currency: current.currency, to_amount: current.amount || "" }));
            }} aria-label="Поменять счета отправки и получения местами" title="Поменять счета местами">⇄</button>
            <select value={form.to_account_id} onChange={e => setForm({ ...form, to_account_id: e.target.value, to_currency: "", to_amount: "" })} required>
              <option value="">— На счёт (получатель) —</option>
              <AccountOptions groups={accountGroups} excludeId={form.account_id} includeIds={[form.to_account_id]} />
            </select>
            {!sameTransferCurrency && <AmountInput type="number" step="0.01" min="0.01" value={form.to_amount} onChange={e => setForm({ ...form, to_amount: e.target.value })} placeholder={quoteLoading ? "Считаем…" : "Сумма зачисления"} required inputStyle={{ width: "100%" }} />}
            <CurrencyField currencies={targetCurrencies.length ? targetCurrencies : [form.to_currency].filter(Boolean)} value={form.to_currency} onChange={e => setForm({ ...form, to_currency: e.target.value, to_amount: "" })} />
            {form.currency && form.to_currency && form.currency !== form.to_currency && displayedRate && <small style={{ gridColumn: "1 / -1", color: "#7a8590" }}>1 {form.currency} = {displayedRate.toLocaleString("ru-RU", { maximumFractionDigits: 8 })} {form.to_currency}</small>}
          </div>
        ) : (
          <CategoryPicker
            categories={cats}
            value={form.category_id}
            onChange={category_id => setForm({ ...form, category_id })}
            onCategoryCreated={onCategoryCreated}
            placeholder="— Без категории —"
          />
        )}

        <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />

        <input
          placeholder="Примечание" value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
        />

        {canUseFamily && form.type === "expense" && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #ead8a8", borderRadius: 8, background: "#fff8e6", color: "#795c19", fontSize: 14 }}>
            <input
              type="checkbox"
              checked={form.is_family_expense}
              onChange={e => setForm({ ...form, is_family_expense: e.target.checked })}
            />
            Семейная покупка
          </label>
        )}
        {canUseFamily && form.type === "expense" && form.is_family_expense && (
          <AmountInput
            type="number"
            step="0.01"
            min="0"
            value={form.reimbursement_amount}
            onChange={e => setForm({ ...form, reimbursement_amount: e.target.value })}
            placeholder="Сумма к возмещению"
            inputStyle={{ width: "100%", textAlign: "right" }}
          />
        )}

        {err && <div style={{ color: "#c0432b", fontSize: 13 }}>{err}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn-ghost">Отмена</button>
          <button type="submit" disabled={saving}>{saving ? "Сохраняем..." : "Сохранить"}</button>
        </div>
      </form>
    </div>
  );
}
