import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";
import { useUser } from "../contexts/UserContext";

export default function Settings() {
  const navigate = useNavigate();
  const { user, refresh } = useUser();
  const [emailForm, setEmailForm] = useState({ email: "", username: "" });
  const [pwdForm, setPwdForm] = useState({ current_password: "", new_password: "", repeat: "" });
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  // Подставим текущие значения когда user загрузится
  if (user && !emailForm.email && !emailForm.username) {
    setEmailForm({ email: user.email, username: user.username });
  }

  const flash = (text, isError = false) => {
    if (isError) { setError(text); setMsg(null); }
    else { setMsg(text); setError(null); }
    setTimeout(() => { setError(null); setMsg(null); }, 3000);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      await api.put("/api/me/", emailForm);
      await refresh();
      flash("Профиль обновлён");
    } catch (e) {
      flash(e.response?.data?.detail || "Ошибка", true);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwdForm.new_password !== pwdForm.repeat) {
      flash("Пароли не совпадают", true); return;
    }
    try {
      await api.post("/api/me/password", {
        current_password: pwdForm.current_password,
        new_password: pwdForm.new_password,
      });
      setPwdForm({ current_password: "", new_password: "", repeat: "" });
      flash("Пароль изменён");
    } catch (e) {
      flash(e.response?.data?.detail || "Ошибка смены пароля", true);
    }
  };

  const deleteAllRecords = async () => {
    if (!confirm("Удалить ВСЕ транзакции? Балансы счетов обнулятся. Восстановить нельзя.")) return;
    try {
      await api.delete("/api/me/transactions");
      flash("Все транзакции удалены");
    } catch (e) {
      flash(e.response?.data?.detail || "Ошибка", true);
    }
  };

  const resetAll = async () => {
    if (!confirm("Начать всё с начала?\n\nБудут удалены: транзакции, счета, группы, категории, валюты.\nАккаунт сохранится, но всё содержимое исчезнет навсегда.")) return;
    if (!confirm("Точно? Это действие необратимо.")) return;
    try {
      await api.post("/api/me/reset");
      flash("Все данные удалены. Перезагрузите страницу.");
    } catch (e) {
      flash(e.response?.data?.detail || "Ошибка", true);
    }
  };

  const deleteAccount = async () => {
    const confirm1 = prompt(`Чтобы удалить аккаунт, введите ваш email: ${user?.email}`);
    if (confirm1 !== user?.email) {
      if (confirm1 !== null) alert("Email не совпал. Удаление отменено.");
      return;
    }
    try {
      await api.delete("/api/me/");
      localStorage.removeItem("token");
      navigate("/login");
    } catch (e) {
      flash(e.response?.data?.detail || "Ошибка удаления", true);
    }
  };

  if (!user) return <div className="page">Загрузка...</div>;

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <h1 style={{ marginBottom: 20 }}>Настройки</h1>

      {error && <FlashBox color="#ef4444" bg="#fef2f2" border="#fecaca">{error}</FlashBox>}
      {msg && <FlashBox color="#15803d" bg="#dcfce7" border="#86efac">{msg}</FlashBox>}

      {/* Профиль */}
      <Section title="Профиль">
        <form onSubmit={saveProfile} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="Email">
            <input
              type="email"
              value={emailForm.email}
              onChange={e => setEmailForm({ ...emailForm, email: e.target.value })}
              required
            />
          </Field>
          <Field label="Имя пользователя">
            <input
              type="text"
              value={emailForm.username}
              onChange={e => setEmailForm({ ...emailForm, username: e.target.value })}
              required
            />
          </Field>
          <div>
            <button type="submit">Сохранить</button>
          </div>
        </form>
      </Section>

      {/* Основная валюта */}
      <Section title="Основная валюта">
        <p style={muted}>
          В этой валюте показываются все суммы и итоги. Управление списком валют и курсами — на странице <Link to="/currencies">Валюты</Link>.
        </p>
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>
          {user.main_currency}
        </div>
      </Section>

      {/* Смена пароля */}
      <Section title="Сменить пароль">
        <form onSubmit={changePassword} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="Текущий пароль">
            <input
              type="password"
              value={pwdForm.current_password}
              onChange={e => setPwdForm({ ...pwdForm, current_password: e.target.value })}
              required autoComplete="current-password"
            />
          </Field>
          <Field label="Новый пароль">
            <input
              type="password" minLength={4}
              value={pwdForm.new_password}
              onChange={e => setPwdForm({ ...pwdForm, new_password: e.target.value })}
              required autoComplete="new-password"
            />
          </Field>
          <Field label="Повторите новый">
            <input
              type="password" minLength={4}
              value={pwdForm.repeat}
              onChange={e => setPwdForm({ ...pwdForm, repeat: e.target.value })}
              required autoComplete="new-password"
            />
          </Field>
          <div>
            <button type="submit">Сменить пароль</button>
          </div>
        </form>
      </Section>

      {/* Экспорт */}
      <Section title="Экспорт">
        <p style={muted}>
          Скачать все транзакции в CSV (формат совместим с импортом HomeMoney).
        </p>
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={() => {
            const token = localStorage.getItem("token");
            const url = `${import.meta.env.VITE_API_URL}/api/export/csv`;
            // Скачивание через fetch + blob, чтобы передать Bearer токен
            fetch(url, { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.ok ? r.blob() : Promise.reject(r))
              .then(blob => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `casemoney_export_${Date.now()}.csv`;
                a.click();
                URL.revokeObjectURL(a.href);
              })
              .catch(() => flash("Не удалось скачать", true));
          }}>
            Скачать CSV
          </button>
        </div>
      </Section>

      {/* Опасная зона */}
      <Section title="Опасная зона" tone="danger">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <DangerRow
            title="Удалить все транзакции"
            description="Удалит ВСЕ записи доходов/расходов. Счета, категории и валюты сохранятся, но балансы обнулятся."
            label="Удалить транзакции"
            onClick={deleteAllRecords}
          />
          <DangerRow
            title="Начать всё с начала"
            description="Удалит транзакции, счета, группы, категории и валюты. Аккаунт сохранится."
            label="Начать заново"
            onClick={resetAll}
          />
          <DangerRow
            title="Удалить аккаунт"
            description="Полностью удалит пользователя и все его данные. Войти будет нельзя."
            label="Удалить аккаунт"
            onClick={deleteAccount}
            destructive
          />
        </div>
      </Section>
    </div>
  );
}

// === components ===

function Section({ title, tone, children }) {
  const danger = tone === "danger";
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${danger ? "#fecaca" : "#e2e8f0"}`,
      borderRadius: 10,
      padding: 18,
      marginBottom: 16,
    }}>
      <h3 style={{
        marginTop: 0, marginBottom: 14, fontSize: 14,
        color: danger ? "#dc2626" : "#334155",
        textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700,
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "minmax(160px, 200px) 1fr", gap: 12, alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#64748b" }}>{label}</span>
      {children}
    </label>
  );
}

function DangerRow({ title, description, label, onClick, destructive }) {
  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
      padding: "10px 0", borderTop: "1px solid #f1f5f9",
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{description}</div>
      </div>
      <button
        onClick={onClick}
        className="btn-danger"
        style={{
          background: destructive ? "#dc2626" : "#fff",
          color: destructive ? "#fff" : "#dc2626",
          border: destructive ? "none" : "1px solid #fecaca",
          padding: "6px 14px", fontSize: 13,
        }}
      >
        {label}
      </button>
    </div>
  );
}

function FlashBox({ color, bg, border, children }) {
  return (
    <div style={{
      color, background: bg, border: `1px solid ${border}`,
      padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 14,
    }}>
      {children}
    </div>
  );
}

const muted = { color: "#64748b", fontSize: 13, margin: 0 };
