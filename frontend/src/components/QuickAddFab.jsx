import { useState, useEffect } from "react";
import api from "../api/client";

// Глобальное событие, чтобы страницы могли подписаться и перезагрузить данные
export const TX_ADDED_EVENT = "casemoney:tx-added";

const TYPE_OPTIONS = [
  { value: "expense", label: "Расход", color: "#ef4444" },
  { value: "income", label: "Доход", color: "#22c55e" },
];

export default function QuickAddFab() {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    type: "expense",
    amount: "",
    account_id: "",
    category_id: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Лениво грузим аккаунты/категории только когда лист открывается
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
          setForm(f => f.account_id ? f : { ...f, account_id: String(acc.data[0].id) });
        }
      })
      .catch(() => setError("Не удалось загрузить счета/категории"));
  }, [open]);

  // Esc закрывает
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Блокировка скролла body когда открыт лист
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.account_id) { setError("Выберите счёт"); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError("Введите сумму"); return; }

    setSubmitting(true);
    try {
      await api.post("/api/transactions/", {
        amount: parseFloat(form.amount),
        type: form.type,
        description: form.description || undefined,
        account_id: parseInt(form.account_id),
        category_id: form.category_id ? parseInt(form.category_id) : undefined,
      });
      // оповещаем страницы
      window.dispatchEvent(new CustomEvent(TX_ADDED_EVENT));
      // ресет суммы/описания/категории, но запоминаем счёт и тип
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
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Добавить транзакцию"
        style={{
          position: "fixed",
          right: 20,
          bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "#6366f1",
          color: "#fff",
          border: "none",
          fontSize: 28,
          lineHeight: 1,
          cursor: "pointer",
          boxShadow: "0 6px 16px rgba(99,102,241,0.4)",
          zIndex: 90,
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        +
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.5)",
              zIndex: 200,
              animation: "fab-fade 0.15s ease-out",
            }}
          />

          {/* Bottom sheet */}
          <div
            role="dialog"
            aria-label="Быстрое добавление"
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              background: "#fff",
              borderRadius: "20px 20px 0 0",
              padding: "12px 20px calc(24px + env(safe-area-inset-bottom, 0px))",
              zIndex: 201,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 -8px 24px rgba(0,0,0,0.15)",
              animation: "fab-slide 0.2s ease-out",
            }}
          >
            {/* drag handle */}
            <div style={{
              width: 40, height: 4, borderRadius: 2,
              background: "#cbd5e1", margin: "0 auto 12px",
            }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>Быстрое добавление</h3>
              <button
                type="button"
                onClick={close}
                className="btn-ghost"
                style={{ padding: "4px 10px", fontSize: 18, lineHeight: 1 }}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Тип — сегментед */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {TYPE_OPTIONS.map(opt => {
                  const active = form.type === opt.value;
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setForm({ ...form, type: opt.value })}
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: 10,
                        border: `2px solid ${active ? opt.color : "#e2e8f0"}`,
                        background: active ? opt.color : "#fff",
                        color: active ? "#fff" : "#475569",
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Сумма */}
              <label style={{ display: "block", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Сумма</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  placeholder="0"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  autoFocus
                  required
                  style={{
                    width: "100%",
                    fontSize: 24,
                    fontWeight: 600,
                    padding: "10px 12px",
                    marginTop: 4,
                  }}
                />
              </label>

              {/* Счёт */}
              <label style={{ display: "block", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Счёт</span>
                <select
                  value={form.account_id}
                  onChange={e => setForm({ ...form, account_id: e.target.value })}
                  required
                  style={{ width: "100%", marginTop: 4 }}
                >
                  <option value="">— Выбрать —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.icon ? `${a.icon} ` : ""}{a.name} ({a.balance.toLocaleString("ru-RU")} {a.currency})
                    </option>
                  ))}
                </select>
              </label>

              {/* Категория */}
              <label style={{ display: "block", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Категория</span>
                <select
                  value={form.category_id}
                  onChange={e => setForm({ ...form, category_id: e.target.value })}
                  style={{ width: "100%", marginTop: 4 }}
                >
                  <option value="">— Без категории —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.icon ? `${c.icon} ` : ""}{c.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Описание */}
              <label style={{ display: "block", marginBottom: 16 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Описание (необязательно)</span>
                <input
                  type="text"
                  placeholder="Например: Пятёрочка"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>

              {error && (
                <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "12px",
                  fontSize: 15,
                  fontWeight: 600,
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
