import { useState } from "react";

import api from "../../api/client";

import AccountOptions from "../../components/AccountOptions";

import CategoryPicker from "../../components/CategoryPicker";
import TagPicker from "../../components/TagPicker";
import { currencySymbol, formatMoney } from "../../utils/money";
import { accountCurrencies as currenciesForAccount, isSameTransferCurrency, preferredAccountCurrency, swapTransferFields, transferDisplayRate } from "../../utils/transactionForm";

import AmountInput from "../../components/AmountInput";
import CurrencyField from "../../components/CurrencyField";

const TYPE_LABEL = { income: "Доход", expense: "Расход", transfer: "Перевод" };
const TYPE_COLOR = { income: "#167a4a", expense: "#c0432b", transfer: "#2f6296" };
const TYPE_ICON = { income: "↗", expense: "↘", transfer: "⇄" };
export function Th({ children, align = "left" }) {
  return (
    <th style={{
      padding: "10px 12px", textAlign: align,
    }}>
      {children}
    </th>
  );
}

export function Row({ tx, accountName, categoryName, formatDate, formatDateTime, onEdit, onDelete, checked, onToggle }) {
  return (
    <tr style={{ borderTop: "1px solid #ece6d8", background: tx.is_family_expense ? "#fff8e6" : undefined }}>
      <td style={{ padding: "8px 4px 8px 10px" }}><input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Выбрать запись ${tx.id}`} /></td>
      <td style={{ padding: "8px 12px", color: "#7a8590", fontSize: 13, whiteSpace: "nowrap" }}>
        {formatDate(tx.date)}
      </td>
      <td style={{ padding: "8px 12px", color: "#7a8590", fontSize: 12, whiteSpace: "nowrap" }}>
        {formatDateTime(tx.updated_at || tx.created_at || tx.date)}
      </td>
      <td style={{ padding: "8px 12px", color: TYPE_COLOR[tx.type], fontWeight: 500, fontSize: 13 }}>
        {TYPE_ICON[tx.type]} {TYPE_LABEL[tx.type]}
        {tx.is_family_expense && <small style={{ marginLeft: 6, color: "#9a6d17", fontWeight: 700 }}>Семейная</small>}
      </td>
      <td style={{
        padding: "8px 12px", textAlign: "right",
        fontWeight: 600, color: TYPE_COLOR[tx.type], whiteSpace: "nowrap",
      }}>
        {tx.type === "expense" ? "−" : tx.type === "transfer" ? "" : "+"}{formatMoney(tx.amount)} {currencySymbol(tx.currency)}
      </td>
      <td style={{ padding: "8px 12px", fontSize: 13 }}>{accountName(tx.account_id)}</td>
      <td style={{ padding: "8px 12px", fontSize: 13 }}>
        {tx.type === "transfer"
          ? <span style={{ color: "#2f6296" }}>→ {accountName(tx.to_account_id)}</span>
          : (tx.category_id ? categoryName(tx.category_id) : "—")}
      </td>
      <td style={{
        padding: "8px 12px", color: "#515c68", fontSize: 13,
        maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }} title={tx.description}>
        {tx.description || "—"}{(tx.tags || []).length > 0 && <small className="transaction-tags-inline"> · {(tx.tags || []).map(tag => `#${tag.name}`).join(" ")}</small>}
      </td>
      <td style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>
        <button className="btn-ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={onEdit}>
          ✎
        </button>
        <button className="btn-ghost" style={{ padding: "3px 8px", fontSize: 12, color: "#c0432b", marginLeft: 4 }} onClick={onDelete}>
          ×
        </button>
      </td>
    </tr>
  );
}

export function MobileTransactionCard({ tx, accountName, categoryName, formatDate, formatDateTime, onEdit, onDelete, checked, onToggle }) {
  const category = tx.type === "transfer"
    ? `→ ${accountName(tx.to_account_id)}`
    : (tx.category_id ? categoryName(tx.category_id) : "Без категории");
  const title = tx.description || category || TYPE_LABEL[tx.type];
  return (
    <article className="mobile-transaction-card" style={tx.is_family_expense ? { background: "#fff8e6", borderColor: "#e7c76e" } : undefined}>
      <label className="mobile-transaction-select"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Выбрать запись ${tx.id}`} /></label>
      <button type="button" className="mobile-transaction-main" onClick={onEdit} aria-label={`Изменить запись ${title}`}>
        <span className="mobile-transaction-icon" style={{ color: TYPE_COLOR[tx.type] }}>{TYPE_ICON[tx.type]}</span>
        <span className="mobile-transaction-copy">
          <strong>{title}{tx.is_family_expense && <em style={{ marginLeft: 6, color: "#9a6d17", fontStyle: "normal", fontSize: 11 }}>Семейная</em>}</strong>
          <small>{formatDate(tx.date)} · {accountName(tx.account_id)} · {category}</small>
          <small>Изменено: {formatDateTime(tx.updated_at || tx.created_at || tx.date)}</small>
          {(tx.tags || []).length > 0 && <small className="transaction-tags-mobile">{(tx.tags || []).map(tag => `#${tag.name}`).join(" ")}</small>}
        </span>
        <span className="mobile-transaction-amount" style={{ color: TYPE_COLOR[tx.type] }}>
          {tx.type === "expense" ? "−" : tx.type === "income" ? "+" : ""}{formatMoney(tx.amount)} {currencySymbol(tx.currency)}
        </span>
      </button>
      <button type="button" className="mobile-transaction-delete btn-ghost" onClick={onDelete} aria-label={`Удалить запись ${title}`}>×</button>
    </article>
  );
}

export function EditRow({ tx, accounts, accountGroups, categories, tags, canUseFamily, onCategoryCreated, onTagCreated, onCancel, onSaved }) {
  const [form, setForm] = useState({
    amount: String(tx.amount),
    type: tx.type,
    currency: tx.currency,
    account_id: String(tx.account_id),
    category_id: tx.category_id ? String(tx.category_id) : "",
    tag_ids: (tx.tags || []).map(tag => String(tag.id)),
    to_account_id: tx.to_account_id ? String(tx.to_account_id) : "",
    to_amount: tx.to_amount != null ? String(tx.to_amount) : "",
    to_currency: tx.to_currency || "",
    fee_amount: tx.fee_amount != null ? String(tx.fee_amount) : "",
    fee_category_id: tx.fee_category_id ? String(tx.fee_category_id) : "",
    description: tx.description || "",
    date: new Date(tx.date).toISOString().slice(0, 10),
    is_family_expense: Boolean(tx.is_family_expense),
    reimbursement_amount: tx.reimbursement_amount ? String(tx.reimbursement_amount) : "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const acc = accounts.find(a => String(a.id) === form.account_id);
  const accCurrencies = currenciesForAccount(acc);
  const targetAccount = accounts.find(a => String(a.id) === form.to_account_id);
  const targetCurrencies = currenciesForAccount(targetAccount);
  const displayedRate = transferDisplayRate({ amount: form.amount, toAmount: form.to_amount });
  const sameTransferCurrency = isSameTransferCurrency(form.type, form.currency, form.to_currency);
  const cats = form.type === "transfer" ? [] : categories.filter(c => c.type === form.type);

  const save = async () => {
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
      const payload = {
        amount: parseFloat(form.amount),
        type: form.type,
        currency: form.currency,
        account_id: parseInt(form.account_id),
        category_id: form.type === "transfer" || !form.category_id ? null : parseInt(form.category_id),
        to_account_id: form.type === "transfer" ? parseInt(form.to_account_id) : null,
        to_amount: form.type === "transfer" ? parseFloat(sameTransferCurrency ? form.amount : form.to_amount) : null,
        to_currency: form.type === "transfer" ? form.to_currency : null,
        fee_amount: form.type === "transfer" && Number(form.fee_amount) > 0 ? parseFloat(form.fee_amount) : null,
        fee_category_id: form.type === "transfer" && form.fee_category_id ? parseInt(form.fee_category_id) : null,
        is_family_expense: form.type === "expense" && form.is_family_expense,
        reimbursement_amount: form.type === "expense" && form.is_family_expense && form.reimbursement_amount !== ""
          ? parseFloat(form.reimbursement_amount)
          : null,
        tag_ids: form.type === "transfer" ? [] : form.tag_ids.map(Number),
        description: form.description || null,
        date: new Date(form.date).toISOString(),
      };
      await api.patch(`/api/transactions/${tx.id}`, payload);
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.detail || "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr style={{ background: "#fefce8", borderTop: "2px solid #facc15" }}>
      <td colSpan={9} style={{ padding: 12 }}>
        {err && <div style={{ color: "#c0432b", fontSize: 13, marginBottom: 6 }}>{err}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value, category_id: "" })}>
            <option value="expense">Расход</option>
            <option value="income">Доход</option>
            <option value="transfer">Перевод</option>
          </select>
          <AmountInput
            type="number" step="0.01" value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            inputStyle={{ width: 110, textAlign: "right" }}
          />
          <CurrencyField currencies={accCurrencies.length ? accCurrencies : [form.currency]} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
          <select value={form.account_id} onChange={e => {
            const account = accounts.find(item => String(item.id) === e.target.value);
            setForm({ ...form, account_id: e.target.value, currency: preferredAccountCurrency(account, form.currency) });
          }}>
            <AccountOptions groups={accountGroups} includeIds={[form.account_id]} />
          </select>
          {form.type === "transfer" ? (
            <>
              <button type="button" className="transfer-swap-button" disabled={!form.to_account_id} onClick={() => {
                setForm(current => swapTransferFields(current, sameTransferCurrency));
              }} aria-label="Поменять счета отправки и получения местами" title="Поменять счета местами">⇄</button>
              <select value={form.to_account_id} onChange={e => {
                const account = accounts.find(item => String(item.id) === e.target.value);
                setForm({
                  ...form,
                  to_account_id: e.target.value,
                  to_currency: preferredAccountCurrency(account),
                  to_amount: "",
                });
              }} required>
                <option value="">— На счёт —</option>
                <AccountOptions
                  groups={accountGroups}
                  excludeId={form.account_id}
                  includeIds={[form.to_account_id]}
                />
              </select>
              {!sameTransferCurrency && <AmountInput
                type="number"
                step="0.01"
                min="0.01"
                value={form.to_amount}
                onChange={e => setForm({ ...form, to_amount: e.target.value })}
                placeholder="Зачислено"
                inputStyle={{ width: 110, textAlign: "right" }}
              />}
              <CurrencyField
                currencies={targetCurrencies.length ? targetCurrencies : [form.to_currency].filter(Boolean)}
                value={form.to_currency}
                onChange={e => setForm({ ...form, to_currency: e.target.value })}
              />
              {form.currency && form.to_currency && form.currency !== form.to_currency && displayedRate && (
                <span style={{ color: "#7a8590", fontSize: 12 }}>
                  1 {form.currency} = {displayedRate.toLocaleString("ru-RU", { maximumFractionDigits: 8 })} {form.to_currency}
                </span>
              )}
              <AmountInput type="number" step="0.01" min="0" value={form.fee_amount} onChange={e => setForm({ ...form, fee_amount: e.target.value })} placeholder="Комиссия" inputStyle={{ width: 110, textAlign: "right" }} />
              <CategoryPicker categories={categories.filter(c => c.type === "expense")} value={form.fee_category_id} onChange={fee_category_id => setForm({ ...form, fee_category_id })} placeholder="Категория комиссии" style={{ minWidth: 180 }} />
            </>
          ) : (
            <CategoryPicker
              categories={cats}
              value={form.category_id}
              onChange={category_id => setForm({ ...form, category_id })}
              onCategoryCreated={onCategoryCreated}
              placeholder="— Без категории —"
              style={{ minWidth: 180 }}
            />
          )}
          {form.type !== "transfer" && <TagPicker
            tags={tags}
            value={form.tag_ids}
            onChange={tag_ids => setForm({ ...form, tag_ids })}
            onTagCreated={onTagCreated}
          />}
          <input
            placeholder="Описание"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            style={{ flex: 1, minWidth: 180 }}
          />
          {canUseFamily && form.type === "expense" && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#795c19", fontSize: 13, whiteSpace: "nowrap" }}>
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
              placeholder="К возмещению"
              inputStyle={{ width: 130, textAlign: "right" }}
            />
          )}
          <button onClick={save} disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
          <button className="btn-ghost" onClick={onCancel}>Отмена</button>
        </div>
      </td>
    </tr>
  );
}

export function Pagination({ page, totalPages, onChange }) {
  const go = (p) => onChange(Math.max(0, Math.min(totalPages - 1, p)));
  // Показываем "± 2" вокруг текущей + первая/последняя
  const pages = new Set([0, totalPages - 1, page]);
  for (let d = 1; d <= 2; d++) {
    if (page - d >= 0) pages.add(page - d);
    if (page + d < totalPages) pages.add(page + d);
  }
  const list = Array.from(pages).sort((a, b) => a - b);

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
      <button className="btn-ghost" disabled={page === 0} onClick={() => go(page - 1)}
        style={{ padding: "4px 10px" }}>‹</button>
      {list.map((p, i) => {
        const prev = list[i - 1];
        const gap = prev !== undefined && p - prev > 1;
        return (
          <span key={p} style={{ display: "flex", gap: 4 }}>
            {gap && <span style={{ color: "#a6afb8", padding: "0 4px" }}>…</span>}
            <button
              type="button"
              onClick={() => go(p)}
              className={p === page ? "" : "btn-ghost"}
              style={{
                padding: "4px 10px", fontSize: 13,
                minWidth: 32, fontWeight: p === page ? 600 : 400,
              }}
            >
              {p + 1}
            </button>
          </span>
        );
      })}
      <button className="btn-ghost" disabled={page === totalPages - 1} onClick={() => go(page + 1)}
        style={{ padding: "4px 10px" }}>›</button>
    </div>
  );
}
