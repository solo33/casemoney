import { useState, useEffect, useMemo } from "react";
import api from "../api/client";
import { COMMON_CURRENCIES, formatMoneyWithCurrency } from "../utils/money";

// Глобальное событие — страницы перезагружают данные после добавления
export const TX_ADDED_EVENT = "casemoney:tx-added";

const TYPE_OPTIONS = [
  { value: "expense", label: "↘ Расход", color: "#c0432b" },
  { value: "transfer", label: "⇄ Перевод", color: "#2f6296" },
  { value: "income", label: "↗ Доход", color: "#167a4a" },
];

export default function QuickAddFab() {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    type: "expense",
    amount: "",
    account_id: "",
    currency: "",       // выбранная валюта (из balances счёта или COMMON)
    category_id: "",
    to_account_id: "",  // счёт-получатель для перевода
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api.get("/api/accounts/"),
      api.get("/api/categories/"),
    ])
      .then(([acc, cat]) => {
        setAccounts(acc.data);
        setCategories(cat.data);
        if (acc.data.length > 0) {
          setForm(f => {
            const next = { ...f };
            if (!next.account_id) {
              next.account_id = String(acc.data[0].id);
              next.currency = acc.data[0].balances?.[0]?.currency || "";
            }
            return next;
          });
        }
      })
      .catch(() => setError("Не удалось загрузить счета/категории"));
  }, [open]);

  // При смене счёта подставляем первую валюту этого счёта
  useEffect(() => {
    if (!form.account_id || !accounts.length) return;
    const acc = accounts.find(a => String(a.id) === String(form.account_id));
    if (!acc) return;
    if (!acc.balances?.length) return;
    const currencies = acc.balances.map(b => b.currency);
    if (!currencies.includes(form.currency)) {
      setForm(f => ({ ...f, currency: currencies[0] }));
    }
  }, [form.account_id, accounts]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setError(null);
  };

  const selectedAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(form.account_id)),
    [accounts, form.account_id]
  );

  const accountBalances = selectedAccount?.balances || [];
  const accountCurrencies = accountBalances.map(b => b.currency);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.account_id) { setError("Выберите счёт"); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError("Введите сумму"); return; }
    if (!form.currency) { setError("Выберите валюту"); return; }
    if (form.type === "transfer") {
      if (!form.to_account_id) { setError("Выберите счёт-получатель"); return; }
      if (String(form.to_account_id) === String(form.account_id)) {
        setError("Счёт-источник и получатель совпадают"); return;
      }
    }

    setSubmitting(true);
    try {
      await api.post("/api/transactions/", {
        amount: parseFloat(form.amount),
        type: form.type,
        currency: form.currency,
        description: form.description || undefined,
        account_id: parseInt(form.account_id),
        category_id: form.type === "transfer" || !form.category_id ? undefined : parseInt(form.category_id),
        to_account_id: form.type === "transfer" ? parseInt(form.to_account_id) : undefined,
      });
      window.dispatchEvent(new CustomEvent(TX_ADDED_EVENT));
      setForm(f => ({ ...f, amount: "", description: "", category_id: "" }));
      close();
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка сохранения");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Добавить операцию"
        className="fab-add-btn"
        style={{
          position: "fixed",
          right: 20,
          bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
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
        @media (min-width: 721px) { .fab-add-btn { display: none !important; } }
      `}</style>

      {open && (
        <>
          <div
            onClick={close}
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
              zIndex: 201, maxHeight: "90vh", overflowY: "auto",
              boxShadow: "0 -8px 24px rgba(0,0,0,0.15)",
              animation: "fab-slide 0.2s ease-out",
            }}
          >
            <div style={{
              width: 40, height: 4, borderRadius: 2,
              background: "#c7cdd3", margin: "0 auto 12px",
            }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>Быстрое добавление</h3>
              <button
                type="button" onClick={close}
                className="btn-ghost"
                style={{ padding: "4px 10px", fontSize: 18, lineHeight: 1 }}
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
                  <input
                    type="number" inputMode="decimal" min="0.01" step="0.01"
                    placeholder="0"
                    value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                    autoFocus required
                    style={{
                      width: "100%", fontSize: 24, fontWeight: 600,
                      padding: "10px 12px", marginTop: 4,
                    }}
                  />
                </label>
                <label style={{ width: 110 }}>
                  <span style={{ fontSize: 12, color: "#7a8590" }}>Валюта</span>
                  <select
                    value={form.currency}
                    onChange={e => setForm({ ...form, currency: e.target.value })}
                    style={{ width: "100%", marginTop: 4, fontSize: 16, padding: "10px 12px" }}
                  >
                    {accountCurrencies.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    {accountCurrencies.length === 0 && COMMON_CURRENCIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>

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
                  {accounts.map(a => {
                    const summary = (a.balances || [])
                      .map(b => formatMoneyWithCurrency(b.balance, b.currency)).join(", ");
                    return (
                      <option key={a.id} value={a.id}>
                        {a.icon ? `${a.icon} ` : ""}{a.name}{summary ? ` — ${summary}` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>

              {/* Категория или счёт-получатель (для перевода) */}
              {form.type === "transfer" ? (
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: "#7a8590" }}>На счёт</span>
                  <select
                    value={form.to_account_id}
                    onChange={e => setForm({ ...form, to_account_id: e.target.value })}
                    required
                    style={{ width: "100%", marginTop: 4 }}
                  >
                    <option value="">— получатель —</option>
                    {accounts.filter(a => String(a.id) !== String(form.account_id)).map(a => (
                      <option key={a.id} value={a.id}>{a.icon ? `${a.icon} ` : ""}{a.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: "#7a8590" }}>Категория</span>
                  <select
                    value={form.category_id}
                    onChange={e => setForm({ ...form, category_id: e.target.value })}
                    style={{ width: "100%", marginTop: 4 }}
                  >
                    <option value="">— Без категории —</option>
                    {categories.filter(c => c.type === form.type).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.icon ? `${c.icon} ` : ""}{c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

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

              {error && (
                <p style={{ color: "#c0432b", fontSize: 13, marginBottom: 12 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%", padding: "12px", fontSize: 15, fontWeight: 600,
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Сохраняем..." : "Добавить"}
              </button>
            </form>
          </div>

          <style>{`
            @keyframes fab-fade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes fab-slide { from { transform: translateY(100%) } to { transform: translateY(0) } }
          `}</style>
        </>
      )}
    </>
  );
}
