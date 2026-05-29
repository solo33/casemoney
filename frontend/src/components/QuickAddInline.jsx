import { useState, useEffect, useMemo, useCallback } from "react";
import api from "../api/client";
import { TX_ADDED_EVENT } from "./QuickAddFab";
import { COMMON_CURRENCIES } from "../utils/money";

const TABS = [
  { value: "expense",  label: "Расход",  color: "#b91c1c" },
  { value: "transfer", label: "Перевод", color: "#1d4ed8" },
  { value: "income",   label: "Доход",   color: "#15803d" },
];

function isoToday() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export default function QuickAddInline() {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [type, setType] = useState("expense");
  const [form, setForm] = useState({
    amount: "",
    account_id: "",
    currency: "",
    category_id: "",
    description: "",
    date: isoToday(),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const [acc, cat] = await Promise.all([
        api.get("/api/accounts/"),
        api.get("/api/categories/"),
      ]);
      setAccounts(acc.data);
      setCategories(cat.data);
      // подставим первый счёт + его первую валюту, если ещё не выбраны
      setForm(f => {
        if (f.account_id) return f;
        const first = acc.data[0];
        if (!first) return f;
        return {
          ...f,
          account_id: String(first.id),
          currency: first.balances?.[0]?.currency || "",
        };
      });
    } catch {
      setError("Не удалось загрузить счета/категории");
    }
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  // При смене счёта — переключиться на его первую валюту, если текущей нет
  useEffect(() => {
    if (!form.account_id || !accounts.length) return;
    const acc = accounts.find(a => String(a.id) === String(form.account_id));
    if (!acc?.balances?.length) return;
    const codes = acc.balances.map(b => b.currency);
    if (!codes.includes(form.currency)) {
      setForm(f => ({ ...f, currency: codes[0] }));
    }
  }, [form.account_id, accounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAccount = useMemo(
    () => accounts.find(a => String(a.id) === String(form.account_id)),
    [accounts, form.account_id]
  );
  const accountCurrencies = (selectedAccount?.balances || []).map(b => b.currency);

  const filteredCategories = type === "transfer"
    ? categories
    : categories.filter(c => c.type === type);

  const activeColor = TABS.find(t => t.value === type)?.color || "#9f1239";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError("Введите сумму"); return;
    }
    if (!form.account_id) { setError("Выберите счёт"); return; }
    if (!form.currency) { setError("Выберите валюту"); return; }

    setSubmitting(true);
    try {
      const payload = {
        amount: parseFloat(form.amount),
        type,
        currency: form.currency,
        description: form.description || undefined,
        account_id: parseInt(form.account_id),
        category_id: form.category_id ? parseInt(form.category_id) : undefined,
      };
      if (form.date) payload.date = new Date(form.date).toISOString();
      await api.post("/api/transactions/", payload);
      window.dispatchEvent(new CustomEvent(TX_ADDED_EVENT));
      // reset суммы/описания/категории, сохраняем счёт+валюту+дату
      setForm(f => ({ ...f, amount: "", description: "", category_id: "" }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 1500);
      // событие сам перезагрузит данные на странице
      loadOptions();
    } catch (err) {
      setError(err.response?.data?.detail || "Ошибка сохранения");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e7e5e0",
      borderRadius: 10,
      overflow: "hidden",
    }}>
      {/* Tabs */}
      <div style={{ display: "flex" }}>
        {TABS.map(t => {
          const active = t.value === type;
          return (
            <button
              type="button"
              key={t.value}
              onClick={() => { setType(t.value); setForm(f => ({ ...f, category_id: "" })); }}
              style={{
                flex: 1,
                padding: "12px 8px",
                background: active ? t.color : "#faf8f3",
                color: active ? "#fff" : "#78716c",
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
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.icon ? `${a.icon} ` : ""}{a.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Сумма"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            required
            style={{ fontWeight: 600, fontSize: 16, textAlign: "right" }}
          />
          <select
            value={form.currency}
            onChange={e => setForm({ ...form, currency: e.target.value })}
          >
            {(accountCurrencies.length > 0 ? accountCurrencies : COMMON_CURRENCIES).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Row 2: Категория + Дата */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 110px 90px", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <label style={lbl}>Категория</label>
          <select
            value={form.category_id}
            onChange={e => setForm({ ...form, category_id: e.target.value })}
            disabled={type === "transfer"}
          >
            <option value="">{type === "transfer" ? "— перевод —" : "— не выбрана —"}</option>
            {filteredCategories.map(c => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ""}{c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={form.date}
            onChange={e => setForm({ ...form, date: e.target.value })}
            style={{ gridColumn: "3 / span 2" }}
          />
        </div>

        {/* Row 3: Примечание */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <label style={lbl}>Примечание</label>
          <input
            type="text"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Например: Пятёрочка"
          />
        </div>

        {/* Errors + submit */}
        {error && (
          <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>{error}</div>
        )}
        {success && (
          <div style={{ color: "#15803d", fontSize: 13, marginBottom: 10 }}>Запись сохранена</div>
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
        @media (max-width: 600px) {
          form > div[style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

const lbl = {
  fontSize: 13,
  color: "#78716c",
  whiteSpace: "nowrap",
};
