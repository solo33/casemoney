import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import api, { isRetryableServiceError } from "../api/client";
import AccountOptions, { entryAccountGroups } from "./AccountOptions";
import CategoryPicker from "./CategoryPicker";
import {
  COMMON_CURRENCIES,
  sortCurrenciesRubFirst,
} from "../utils/money";
import { clearIdempotencyKey, idempotencyKeyFor } from "../utils/idempotency";
import useTransferQuote from "../hooks/useTransferQuote";
import { submitOrQueueTransaction } from "../services/offlineMutations";
import { cachedAccountsAndCategories, saveReferenceData } from "../services/offlineReferenceData";
import { useUser } from "../contexts/UserContext";
import AmountInput from "./AmountInput";
import CurrencyField from "./CurrencyField";

// Глобальное событие — страницы перезагружают данные после добавления
export const TX_ADDED_EVENT = "casemoney:tx-added";
export const QUICK_ADD_OPEN_EVENT = "casemoney:quick-add-open";

const TYPE_OPTIONS = [
  { value: "expense", label: "↘ Расход", color: "#c0432b" },
  { value: "transfer", label: "⇄ Перевод", color: "#2f6296" },
  { value: "income", label: "↗ Доход", color: "#167a4a" },
];

export default function QuickAddFab() {
  const { user } = useUser();
  const hasFamilyPlan = user?.plan === "family";
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [accounts, setAccounts] = useState([]);
  const [accountGroups, setAccountGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    type: "expense",
    amount: "",
    account_id: "",
    currency: "",       // выбранная валюта (из balances счёта или COMMON)
    category_id: "",
    to_account_id: "",  // счёт-получатель для перевода
    to_amount: "",
    to_currency: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
    is_family_expense: false,
    reimbursement_amount: "",
    is_planned: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [retryable, setRetryable] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);
  const requestRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const applyOptions = (rawGroups, rawCategories) => {
      const groups = entryAccountGroups(rawGroups || []);
      const flatAccounts = groups.flatMap(bucket => bucket.accounts || []);
      setAccountGroups(groups);
      setAccounts(flatAccounts);
      setCategories(rawCategories || []);
      setForm(f => {
        const currentExists = flatAccounts.some(account => String(account.id) === String(f.account_id));
        if (currentExists || flatAccounts.length === 0) return f;
        return {
          ...f,
          account_id: String(flatAccounts[0].id),
          currency: sortCurrenciesRubFirst(
            (flatAccounts[0].balances || []).map(balance => balance.currency)
          )[0] || "",
        };
      });
    };

    const cached = cachedAccountsAndCategories();
    if (cached) applyOptions(cached.accountGroups, cached.categories);
    if (navigator.onLine === false) {
      if (!cached) setError("Для работы без сети сначала откройте приложение онлайн");
      return;
    }

    Promise.all([
      api.get("/api/accounts/grouped", { params: { convert_balances: false } }),
      api.get("/api/categories/"),
    ])
      .then(([acc, cat]) => {
        const rawGroups = acc.data || [];
        const nextCategories = cat.data || [];
        applyOptions(rawGroups, nextCategories);
        saveReferenceData({ accountGroups: rawGroups, categories: nextCategories });
      })
      .catch(() => {
        if (!cached) setError("Не удалось загрузить счета/категории");
      });
  }, [open]);

  // При смене счёта подставляем первую валюту этого счёта
  useEffect(() => {
    if (!form.account_id || !accounts.length) return;
    const acc = accounts.find(a => String(a.id) === String(form.account_id));
    if (!acc) return;
    if (!acc.balances?.length) return;
    const currencies = sortCurrenciesRubFirst(acc.balances.map(b => b.currency));
    if (!currencies.includes(form.currency)) {
      setForm(f => ({ ...f, currency: currencies[0] }));
    }
  }, [form.account_id, accounts]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const openQuickAdd = () => setOpen(true);
    window.addEventListener(QUICK_ADD_OPEN_EVENT, openQuickAdd);
    return () => window.removeEventListener(QUICK_ADD_OPEN_EVENT, openQuickAdd);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = orig; };
    }
  }, [open]);

  const close = () => {
    setOpen(false);
    setStep(1);
    setError(null);
    setRetryable(false);
  };

  const continueToDetails = () => {
    setError(null);
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError("Введите сумму");
      return;
    }
    setStep(2);
  };

  const selectedAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(form.account_id)),
    [accounts, form.account_id]
  );

  const accountBalances = selectedAccount?.balances || [];
  const accountCurrencies = sortCurrenciesRubFirst(
    accountBalances.map(b => b.currency)
  );

  const selectedTargetAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(form.to_account_id)),
    [accounts, form.to_account_id]
  );
  const targetCurrencies = sortCurrenciesRubFirst(
    (selectedTargetAccount?.balances || []).map(balance => balance.currency)
  );
  const sameTransferCurrency = form.type === "transfer"
    && Boolean(form.currency)
    && form.currency === form.to_currency;

  useEffect(() => {
    if (form.type !== "transfer" || !selectedTargetAccount) return;
    const codes = targetCurrencies;
    if (!codes.includes(form.to_currency)) {
      setForm(current => ({ ...current, to_currency: codes[0] || "" }));
    }
  }, [form.type, selectedTargetAccount, targetCurrencies.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyTransferQuote = useCallback((toAmount) => {
    setForm(current => current.to_amount === toAmount
      ? current
      : { ...current, to_amount: toAmount });
  }, []);
  const { quote, loading: quoteLoading } = useTransferQuote({
    enabled: form.type === "transfer" && !sameTransferCurrency,
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step === 1) {
      continueToDetails();
      return;
    }
    setError(null);
    setSavedLocally(false);
    if (!form.account_id) { setError("Выберите счёт"); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError("Введите сумму"); return; }
    if (!form.currency) { setError("Выберите валюту"); return; }
    if (form.type === "transfer") {
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
        type: form.type,
        currency: form.currency,
        description: form.description || undefined,
        account_id: parseInt(form.account_id),
        category_id: form.type === "transfer" || !form.category_id ? undefined : parseInt(form.category_id),
        to_account_id: form.type === "transfer" ? parseInt(form.to_account_id) : undefined,
        to_amount: form.type === "transfer" ? parseFloat(sameTransferCurrency ? form.amount : form.to_amount) : undefined,
        to_currency: form.type === "transfer" ? form.to_currency : undefined,
        date: form.date ? new Date(`${form.date}T12:00:00`).toISOString() : undefined,
        is_family_expense: hasFamilyPlan && form.type === "expense" && form.is_family_expense,
        reimbursement_amount: hasFamilyPlan && form.type === "expense" && form.is_family_expense
          ? parseFloat(form.reimbursement_amount || form.amount)
          : undefined,
        is_planned: hasFamilyPlan && form.is_planned,
      };
      const requestKey = idempotencyKeyFor(requestRef, payload);
      const result = await submitOrQueueTransaction(payload, requestKey);
      clearIdempotencyKey(requestRef);
      if (!result.queued) window.dispatchEvent(new CustomEvent(TX_ADDED_EVENT));
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
      if (!result.queued) close();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка сохранения");
      setRetryable(isRetryableServiceError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Добавить операцию"
        data-tour="quick-add-mobile"
        className="fab-add-btn"
        style={{
          position: "fixed",
          right: 16,
          bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
          width: 56, height: 56, borderRadius: "50%",
          background: "#173a54", color: "#fff", border: "none",
          fontSize: 28, lineHeight: 1, cursor: "pointer",
          boxShadow: "0 6px 16px rgba(23, 58, 84, 0.4)",
          zIndex: 90, padding: 0,
          alignItems: "center", justifyContent: "center",
        }}
      >
        +
      </button>
      {/* На десктопе используется встроенная форма на Главной, плавающую кнопку прячем */}
      <style>{`
        .fab-add-btn { display: flex; }
        @media (min-width: 768px) { .fab-add-btn { display: none !important; } }
      `}</style>

      {open && (
        <>
          <div
            onClick={close}
            className="quick-add-sheet"
            style={{
              position: "fixed", inset: 0,
              background: "rgba(15,23,42,0.5)", zIndex: 200,
              animation: "fab-fade 0.15s ease-out",
            }}
          />

          <div
            role="dialog"
            aria-label="Быстрое добавление"
            style={{
              position: "fixed", left: 0, right: 0, bottom: 0,
              background: "#fffdf7",
              borderRadius: "20px 20px 0 0",
              padding: "12px 20px calc(24px + env(safe-area-inset-bottom, 0px))",
              zIndex: 201, maxHeight: "94svh", overflowY: "auto",
              boxShadow: "0 -8px 24px rgba(0,0,0,0.15)",
              animation: "fab-slide 0.2s ease-out",
            }}
          >
            <div style={{
              width: 40, height: 4, borderRadius: 2,
              background: "#c7cdd3", margin: "0 auto 12px",
            }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17 }}>Новая запись</h3>
                <div style={{ color: "#7a8590", fontSize: 12, marginTop: 2 }}>Шаг {step} из 2</div>
              </div>
              <button
                type="button" onClick={close}
                className="btn-ghost"
                style={{ width: 44, height: 44, padding: 0, fontSize: 18, lineHeight: 1 }}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {TYPE_OPTIONS.map(opt => {
                  const active = form.type === opt.value;
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setForm({ ...form, type: opt.value, category_id: "" })}
                      style={{
                        flex: 1, padding: "10px", borderRadius: 10,
                        border: `2px solid ${active ? opt.color : "#e4ddcd"}`,
                        background: active ? opt.color : "#fff",
                        color: active ? "#fff" : "#515c68",
                        fontWeight: 600, fontSize: 14, cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Сумма + валюта */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <label style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, color: "#7a8590" }}>Сумма</span>
                  <AmountInput
                    type="number" inputMode="decimal" min="0.01" step="0.01"
                    placeholder="0"
                    value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                    autoFocus required
                    inputStyle={{
                      width: "100%", fontSize: 24, fontWeight: 600,
                      padding: "10px 12px", marginTop: 4,
                    }}
                  />
                </label>
                <label style={{ width: accountCurrencies.length > 1 ? 110 : "auto" }}>
                  <span style={{ fontSize: 12, color: "#7a8590" }}>Валюта</span>
                  <div style={{ marginTop: 4 }}>
                  <CurrencyField
                    currencies={accountCurrencies}
                    value={form.currency}
                    onChange={e => setForm({ ...form, currency: e.target.value })}
                    fallback={COMMON_CURRENCIES}
                  />
                  </div>
                </label>
              </div>

              {step === 1 && (
                <>
                  {error && <p style={{ color: "#c0432b", fontSize: 13, marginBottom: 12 }}>{error}</p>}
                  <button type="button" onClick={continueToDetails} style={{ width: "100%", minHeight: 48, fontSize: 15, fontWeight: 600 }}>
                    Продолжить
                  </button>
                </>
              )}

              <div style={{ display: step === 2 ? "block" : "none" }}>

              {/* Счёт */}
              <label style={{ display: "block", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#7a8590" }}>Счёт</span>
                <select
                  value={form.account_id}
                  onChange={e => setForm({ ...form, account_id: e.target.value })}
                  required
                  style={{ width: "100%", marginTop: 4 }}
                >
                  <option value="">— Выбрать —</option>
                  <AccountOptions groups={accountGroups} />
                </select>
              </label>

              {/* Категория или счёт-получатель (для перевода) */}
              {form.type === "transfer" ? (
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: "#7a8590", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    На счёт
                    {form.to_account_id && <button type="button" className="transfer-swap-button" onClick={swapTransferAccounts} aria-label="Поменять счета отправки и получения местами" title="Поменять счета местами">⇅</button>}
                  </span>
                  <select
                    value={form.to_account_id}
                    onChange={e => setForm({ ...form, to_account_id: e.target.value, to_currency: "", to_amount: "" })}
                    required
                    style={{ width: "100%", marginTop: 4 }}
                  >
                    <option value="">— получатель —</option>
                    <AccountOptions groups={accountGroups} excludeId={form.account_id} />
                  </select>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {sameTransferCurrency ? (
                      <span style={{ flex: 1, alignSelf: "center", color: "#7a8590", fontSize: 13 }}>Зачислится та же сумма</span>
                    ) : (
                      <AmountInput
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        value={form.to_amount}
                        onChange={e => setForm({ ...form, to_amount: e.target.value })}
                        placeholder={quoteLoading ? "Считаем…" : "Сумма зачисления"}
                        required
                        inputStyle={{ width: "100%" }}
                      />
                    )}
                    <CurrencyField
                      currencies={targetCurrencies}
                      value={form.to_currency}
                      onChange={e => setForm({ ...form, to_currency: e.target.value, to_amount: "" })}
                    />
                  </div>
                  <small style={{ display: "block", marginTop: 6, color: "#7a8590" }}>
                    {form.currency && form.to_currency && form.currency !== form.to_currency && displayedRate > 0
                      ? `1 ${form.currency} = ${displayedRate.toLocaleString("ru-RU", { maximumFractionDigits: 8 })} ${form.to_currency}`
                      : "Зачислится та же сумма"}
                    {quoteLoading ? " · обновляем курс…" : ""}
                  </small>
                </label>
              ) : (
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: "#7a8590" }}>Категория</span>
                  <CategoryPicker
                    categories={categories.filter(c => c.type === form.type)}
                    value={form.category_id}
                    onChange={category_id => setForm({ ...form, category_id })}
                    style={{ width: "100%", marginTop: 4 }}
                    placeholder="— Без категории —"
                  />
                </label>
              )}

              <label style={{ display: "block", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#7a8590" }}>Дата</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  required
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>

              <label style={{ display: "block", marginBottom: 16 }}>
                <span style={{ fontSize: 12, color: "#7a8590" }}>Описание (необязательно)</span>
                <input
                  type="text"
                  placeholder="Например: Пятерочка"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>

              {hasFamilyPlan && form.type === "expense" && (
                <div style={{
                  padding: 12,
                  marginBottom: 14,
                  border: "1px solid #ead7a8",
                  borderRadius: 10,
                  background: "#fff8e6",
                }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={form.is_family_expense}
                      onChange={event => setForm({
                        ...form,
                        is_family_expense: event.target.checked,
                        reimbursement_amount: event.target.checked
                          ? (form.reimbursement_amount || form.amount)
                          : "",
                      })}
                      style={{ width: 20, height: 20 }}
                    />
                    Общая семейная покупка
                  </label>
                  {form.is_family_expense && (
                    <label style={{ display: "block", marginTop: 10 }}>
                      <span style={{ fontSize: 12, color: "#7a8590" }}>К возмещению, {form.currency}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={form.amount || undefined}
                        step="0.01"
                        value={form.reimbursement_amount}
                        onChange={event => setForm({ ...form, reimbursement_amount: event.target.value })}
                        placeholder={form.amount || "0"}
                        style={{ width: "100%", marginTop: 4 }}
                      />
                    </label>
                  )}
                </div>
              )}

              {hasFamilyPlan && (
                <label style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14, fontSize: 14, color: "#515c68" }}>
                  <input type="checkbox" checked={form.is_planned} onChange={event => setForm({ ...form, is_planned: event.target.checked })} style={{ width: 20, height: 20 }} />
                  Планируемая запись — остаток пока не меняется
                </label>
              )}

              {error && (
                <div style={{ color: "#c0432b", fontSize: 13, marginBottom: 12 }}>
                  <span>{error}</span>
                  {retryable && (
                    <button type="submit" className="btn-ghost" disabled={submitting} style={{ width: "100%", minHeight: 42, marginTop: 8 }}>
                      Повторить
                    </button>
                  )}
                </div>
              )}
              {savedLocally && (
                <p style={{ color: "#167a4a", fontSize: 13, marginBottom: 12 }}>
                  Сохранено на устройстве. Запись отправится автоматически после восстановления связи.
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%", minHeight: 48, padding: "12px", fontSize: 15, fontWeight: 600,
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Сохраняем..." : "Добавить"}
              </button>
              <button type="button" onClick={() => setStep(1)} className="btn-link" style={{ width: "100%", minHeight: 44, marginTop: 4 }}>
                ← Изменить сумму
              </button>
              </div>
            </form>
          </div>

          <style>{`
            @keyframes fab-fade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes fab-slide { from { transform: translateY(100%) } to { transform: translateY(0) } }
            @media (max-width: 767px) {
              .quick-add-sheet { top: calc(58px + env(safe-area-inset-top, 0px)); max-height: none !important; border-radius: 18px 18px 0 0 !important; padding-bottom: calc(82px + env(safe-area-inset-bottom, 0px)) !important; }
              .quick-add-sheet input, .quick-add-sheet select { min-height: 46px; }
            }
          `}</style>
        </>
      )}
    </>
  );
}
