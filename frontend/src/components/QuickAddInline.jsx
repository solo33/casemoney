import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import api, { isRetryableServiceError } from "../api/client";
import { TX_ADDED_EVENT } from "./QuickAddFab";
import AccountOptions, { entryAccountGroups } from "./AccountOptions";
import CategoryPicker from "./CategoryPicker";
import { COMMON_CURRENCIES, sortCurrenciesRubFirst } from "../utils/money";
import { clearIdempotencyKey, idempotencyKeyFor } from "../utils/idempotency";
import useTransferQuote from "../hooks/useTransferQuote";
import { submitOrQueueTransaction } from "../services/offlineMutations";
import { cachedAccountsAndCategories, saveReferenceData } from "../services/offlineReferenceData";
import { useUser } from "../contexts/UserContext";
import AmountInput from "./AmountInput";
import CurrencyField from "./CurrencyField";

const TABS = [
  { value: "expense",  label: "↘ Расход",  color: "#c0432b" },
  { value: "transfer", label: "⇄ Перевод", color: "#2f6296" },
  { value: "income",   label: "↗ Доход",   color: "#167a4a" },
];

function isoToday() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export default function QuickAddInline({
  date,
  onDateChange,
  accountGroups: externalAccountGroups,
  categories: externalCategories,
}) {
  const { user } = useUser();
  const hasFamilyPlan = user?.plan === "family";
  const [accounts, setAccounts] = useState([]);
  const [accountGroups, setAccountGroups] = useState([]); // [{group, accounts}] для optgroup
  const [categories, setCategories] = useState([]);
  const [type, setType] = useState("expense");
  const [internalDate, setInternalDate] = useState(isoToday());
  // Дата может управляться родителем (синхронизация с лентой за день)
  const dateVal = date !== undefined ? date : internalDate;
  const setDateVal = onDateChange || setInternalDate;
  const [form, setForm] = useState({
    amount: "",
    account_id: "",
    currency: "",
    category_id: "",
    to_account_id: "",
    to_amount: "",
    to_currency: "",
    description: "",
    is_family_expense: false,
    reimbursement_amount: "",
    is_planned: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);
  const [retryable, setRetryable] = useState(false);
  const requestRef = useRef(null);

  const applyOptions = useCallback((buckets, cats) => {
    const visibleBuckets = entryAccountGroups(buckets);
    const flat = visibleBuckets.flatMap(b => b.accounts || []);
    setAccountGroups(visibleBuckets);
    setAccounts(flat);
    setCategories(cats);
    setForm(f => {
      if (f.account_id) return f;
      const first = flat[0];
      if (!first) return f;
      return {
        ...f,
        account_id: String(first.id),
        currency: sortCurrenciesRubFirst(
          (first.balances || []).map(balance => balance.currency)
        )[0] || "",
      };
    });
  }, []);

  const loadOptions = useCallback(async () => {
    const cached = cachedAccountsAndCategories();
    if (cached) applyOptions(cached.accountGroups, cached.categories);

    if (externalAccountGroups && externalCategories) {
      if (externalAccountGroups.length || externalCategories.length) {
        applyOptions(externalAccountGroups, externalCategories);
        saveReferenceData({
          accountGroups: externalAccountGroups,
          categories: externalCategories,
        });
      } else if (!cached) {
        applyOptions([], []);
      }
      return;
    }

    if (navigator.onLine === false) {
      if (!cached) setError("Для работы без сети сначала откройте приложение онлайн");
      return;
    }

    try {
      const [grp, cat] = await Promise.all([
        api.get("/api/accounts/grouped", { params: { convert_balances: false } }),
        api.get("/api/categories/"),
      ]);
      const groups = grp.data || [];
      const nextCategories = cat.data || [];
      applyOptions(groups, nextCategories);
      saveReferenceData({ accountGroups: groups, categories: nextCategories });
    } catch {
      if (!cached) setError("Не удалось загрузить счета и категории");
    }
  }, [applyOptions, externalAccountGroups, externalCategories]);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  // При смене счёта — переключиться на его первую валюту, если текущей нет
  useEffect(() => {
    if (!form.account_id || !accounts.length) return;
    const acc = accounts.find(a => String(a.id) === String(form.account_id));
    if (!acc?.balances?.length) return;
    const codes = sortCurrenciesRubFirst(acc.balances.map(b => b.currency));
    if (!codes.includes(form.currency)) {
      setForm(f => ({ ...f, currency: codes[0] }));
    }
  }, [form.account_id, accounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(form.account_id)),
    [accounts, form.account_id]
  );
  const accountCurrencies = sortCurrenciesRubFirst(
    (selectedAccount?.balances || []).map(b => b.currency)
  );

  const selectedTargetAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(form.to_account_id)),
    [accounts, form.to_account_id]
  );
  const targetCurrencies = sortCurrenciesRubFirst(
    (selectedTargetAccount?.balances || []).map(balance => balance.currency)
  );
  const sameTransferCurrency = type === "transfer"
    && Boolean(form.currency)
    && form.currency === form.to_currency;

  useEffect(() => {
    if (type !== "transfer" || !selectedTargetAccount) return;
    const codes = targetCurrencies;
    if (!codes.includes(form.to_currency)) {
      setForm(current => ({ ...current, to_currency: codes[0] || "" }));
    }
  }, [type, selectedTargetAccount, targetCurrencies.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyTransferQuote = useCallback((toAmount) => {
    setForm(current => current.to_amount === toAmount
      ? current
      : { ...current, to_amount: toAmount });
  }, []);
  const { quote, loading: quoteLoading } = useTransferQuote({
    enabled: type === "transfer" && !sameTransferCurrency,
    amount: form.amount,
    fromCurrency: form.currency,
    toCurrency: form.to_currency,
    onQuote: applyTransferQuote,
  });
  const displayedRate = Number(form.amount) > 0 && Number(form.to_amount) >= 0
    ? Number(form.to_amount) / Number(form.amount)
    : quote?.rate;

  const swapTransferAccounts = () => {
    if (!form.account_id || !form.to_account_id) return;
    const creditedAmount = sameTransferCurrency ? form.amount : form.to_amount;
    setForm(current => ({
      ...current,
      account_id: current.to_account_id,
      currency: current.to_currency,
      amount: creditedAmount || "",
      to_account_id: current.account_id,
      to_currency: current.currency,
      to_amount: current.amount || "",
    }));
  };

  const filteredCategories = type === "transfer"
    ? categories
    : categories.filter(c => c.type === type);

  const activeColor = TABS.find(t => t.value === type)?.color || "#173a54";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setRetryable(false);
    setSuccess(false);
    setSavedLocally(false);
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError("Введите сумму"); return;
    }
    if (!form.account_id) { setError("Выберите счёт"); return; }
    if (!form.currency) { setError("Выберите валюту"); return; }
    if (type === "transfer") {
      if (!form.to_account_id) { setError("Выберите счёт-получатель"); return; }
      if (String(form.to_account_id) === String(form.account_id)) {
        setError("Счёт-источник и получатель совпадают"); return;
      }
      if (!form.to_currency) { setError("Выберите валюту счёта-получателя"); return; }
      if (!sameTransferCurrency && (!form.to_amount || parseFloat(form.to_amount) <= 0)) {
        setError("Введите сумму зачисления"); return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        amount: parseFloat(form.amount),
        type,
        currency: form.currency,
        description: form.description || undefined,
        account_id: parseInt(form.account_id),
        category_id: type === "transfer" || !form.category_id ? undefined : parseInt(form.category_id),
        to_account_id: type === "transfer" ? parseInt(form.to_account_id) : undefined,
        to_amount: type === "transfer" ? parseFloat(sameTransferCurrency ? form.amount : form.to_amount) : undefined,
        to_currency: type === "transfer" ? form.to_currency : undefined,
        is_family_expense: hasFamilyPlan && type === "expense" && form.is_family_expense,
        reimbursement_amount: hasFamilyPlan && type === "expense" && form.is_family_expense
          ? parseFloat(form.reimbursement_amount || form.amount)
          : undefined,
        is_planned: hasFamilyPlan && form.is_planned,
      };
      if (dateVal) payload.date = new Date(dateVal).toISOString();
      const requestKey = idempotencyKeyFor(requestRef, payload);
      const result = await submitOrQueueTransaction(payload, requestKey);
      clearIdempotencyKey(requestRef);
      if (!result.queued) window.dispatchEvent(new CustomEvent(TX_ADDED_EVENT));
      // reset суммы/описания/категории, сохраняем счёт+валюту+дату
      setForm(f => ({
        ...f,
        amount: "",
        to_amount: "",
        description: "",
        category_id: "",
        is_family_expense: false,
        reimbursement_amount: "",
        is_planned: false,
      }));
      setSavedLocally(result.queued);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 1500);
      // событие сам перезагрузит данные на странице
      loadOptions();
    } catch (err) {
      setError(err.response?.data?.detail || "Ошибка сохранения");
      setRetryable(isRetryableServiceError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="quick-add-inline" style={{
      background: "#fffdf7",
      border: "1px solid #e4ddcd",
      borderRadius: 10,
      overflow: "visible",
      position: "relative",
      zIndex: 5,
    }}>
      {/* Tabs */}
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        {TABS.map(t => {
          const active = t.value === type;
          return (
            <button
              type="button"
              key={t.value}
              onClick={() => { setType(t.value); setForm(f => ({ ...f, category_id: "" })); }}
              style={{
                padding: "12px 20px",
                background: active ? t.color : "#f6f2e9",
                color: active ? "#fff" : "#7a8590",
                border: "none",
                borderRadius: 0,
                fontWeight: active ? 700 : 500,
                fontSize: 14,
                cursor: "pointer",
                borderBottom: active ? `3px solid ${t.color}` : "3px solid transparent",
                transition: "background 0.1s",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} style={{ padding: 16 }}>
        {/* Row 1: Со счета + Сумма + Валюта */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 110px 90px", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <label style={lbl}>Со счёта</label>
          <select
            value={form.account_id}
            onChange={e => setForm({ ...form, account_id: e.target.value })}
            required
          >
            <option value="">— выбрать —</option>
            <AccountOptions groups={accountGroups} />
          </select>
          <AmountInput
            type="number"
            placeholder="Сумма"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            required
            inputStyle={{ fontWeight: 600, fontSize: 16, textAlign: "right", width: "100%" }}
          />
          <CurrencyField
            currencies={accountCurrencies}
            value={form.currency}
            onChange={e => setForm({ ...form, currency: e.target.value })}
            fallback={COMMON_CURRENCIES}
          />
        </div>

        {/* Row 2: категория или отдельная сумма зачисления для перевода */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 110px 90px", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <label style={lbl}>
            {type === "transfer" ? "На счёт" : "Категория"}
            {type === "transfer" && form.to_account_id && (
              <button type="button" className="transfer-swap-button" onClick={swapTransferAccounts} title="Поменять счета местами" aria-label="Поменять счета отправки и получения местами">⇅</button>
            )}
          </label>
          {type === "transfer" ? (
            <select
              value={form.to_account_id}
              onChange={e => setForm({ ...form, to_account_id: e.target.value, to_currency: "", to_amount: "" })}
              required
            >
              <option value="">— получатель —</option>
              <AccountOptions groups={accountGroups} excludeId={form.account_id} />
            </select>
          ) : (
            <CategoryPicker
              categories={filteredCategories}
              value={form.category_id}
              onChange={category_id => setForm({ ...form, category_id })}
            />
          )}
          {type === "transfer" ? (
            <>
              {sameTransferCurrency ? (
                <span className="same-transfer-amount">Та же сумма</span>
              ) : (
                <AmountInput
                  type="number"
                  inputMode="decimal"
                  placeholder={quoteLoading ? "Считаем…" : "Зачислить"}
                  min="0.01"
                  step="0.01"
                  value={form.to_amount}
                  onChange={e => setForm({ ...form, to_amount: e.target.value })}
                  required
                  inputStyle={{ fontWeight: 600, fontSize: 16, textAlign: "right", width: "100%" }}
                />
              )}
              <CurrencyField
                currencies={targetCurrencies}
                value={form.to_currency}
                onChange={e => setForm({ ...form, to_currency: e.target.value, to_amount: "" })}
              />
            </>
          ) : (
            <input
              type="date"
              value={dateVal}
              onChange={e => setDateVal(e.target.value)}
              className="qai-date"
            />
          )}
        </div>

        {type === "transfer" && (
          <div className="transfer-rate-row">
            <span>
              {form.currency && form.to_currency && form.currency !== form.to_currency && displayedRate > 0
                ? `Курс: 1 ${form.currency} = ${displayedRate.toLocaleString("ru-RU", { maximumFractionDigits: 8 })} ${form.to_currency}`
                : "Зачислится та же сумма"}
              {quoteLoading ? " · обновляем курс…" : ""}
            </span>
            <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} />
          </div>
        )}

        {/* Row 3: Примечание */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <label style={lbl}>Примечание</label>
          <input
            type="text"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Например: Пятерочка"
          />
        </div>

        {hasFamilyPlan && type === "expense" && (
          <div className="family-expense-fields">
            <label>
              <input
                type="checkbox"
                checked={form.is_family_expense}
                onChange={event => setForm({
                  ...form,
                  is_family_expense: event.target.checked,
                  reimbursement_amount: event.target.checked ? (form.reimbursement_amount || form.amount) : "",
                })}
              />
              Общая семейная покупка
            </label>
            {form.is_family_expense && (
              <label>
                <span>К возмещению</span>
                <input
                  type="number"
                  min="0"
                  max={form.amount || undefined}
                  step="0.01"
                  value={form.reimbursement_amount}
                  onChange={event => setForm({ ...form, reimbursement_amount: event.target.value })}
                  placeholder={form.amount || "0"}
                />
                <span>{form.currency}</span>
              </label>
            )}
          </div>
        )}

        {/* Errors + submit */}
        {hasFamilyPlan && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12, color: "#515c68", fontSize: 13 }}>
            <input type="checkbox" checked={form.is_planned} onChange={event => setForm({ ...form, is_planned: event.target.checked })} />
            Планируемая запись — остаток пока не меняется
          </label>
        )}

        {error && (
          <div style={{ color: "#c0432b", fontSize: 13, marginBottom: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>{error}</span>
            {retryable && (
              <button type="submit" className="btn-ghost" disabled={submitting} style={{ minHeight: 34, padding: "5px 10px" }}>
                Повторить
              </button>
            )}
          </div>
        )}
        {success && (
          <div style={{ color: "#167a4a", fontSize: 13, marginBottom: 10 }}>
            {savedLocally
              ? "Изменение сохранено на устройстве и отправится автоматически при появлении связи"
              : "Запись сохранена"}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              background: activeColor,
              padding: "10px 28px",
              fontSize: 14,
              fontWeight: 600,
              opacity: submitting ? 0.6 : 1,
              cursor: submitting ? "not-allowed" : "pointer",
              border: "none",
              color: "#fff",
              borderRadius: 6,
            }}
          >
            {submitting ? "Сохраняем..." : "Записать"}
          </button>
        </div>
      </form>

      <style>{`
        .qai-date { grid-column: 3 / span 2; }
        .transfer-rate-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: -2px 0 10px 78px; color: #7a8590; font-size: 12px; }
        .transfer-rate-row input { width: 200px; }
        .family-expense-fields { margin: 0 0 12px 78px; padding: 10px 12px; background: #fff8e6; border: 1px solid #ead7a8; border-radius: 8px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
        .same-transfer-amount { align-self: stretch; display: flex; align-items: center; justify-content: flex-end; color: #7a8590; font-size: 12px; }
        label:has(.transfer-swap-button) { display: flex; align-items: center; gap: 6px; }
        .family-expense-fields label { display: flex; align-items: center; gap: 7px; font-size: 13px; color: #515c68; }
        .family-expense-fields input[type="checkbox"] { width: 18px; height: 18px; }
        .family-expense-fields input[type="number"] { width: 120px; }
        @media (max-width: 600px) {
          form > div[style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
          .qai-date { grid-column: auto !important; }
          .transfer-rate-row { margin-left: 0; align-items: stretch; flex-direction: column; }
          .transfer-rate-row input { width: 100%; }
          .family-expense-fields { margin-left: 0; align-items: stretch; flex-direction: column; }
        }
      `}</style>
    </div>
  );
}

const lbl = {
  fontSize: 13,
  color: "#7a8590",
  whiteSpace: "nowrap",
};
