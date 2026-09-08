import { useState, useEffect } from "react";

import api from "../../api/client";
import { flashBox } from "../../utils/adminView";

export function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="btn-ghost"
      style={{
        border: "none",
        borderBottom: active ? "3px solid #173a54" : "3px solid transparent",
        background: "transparent",
        color: active ? "#173a54" : "#7a8590",
        fontWeight: active ? 600 : 500,
        padding: "10px 16px",
        borderRadius: 0,
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

export function UserDetail({ user, adminId, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(user.plan || "personal");

  useEffect(() => {
    setSelectedPlan(user.plan || "personal");
  }, [user.id, user.plan]);

  const flash = (m, err = false) => {
    err ? setError(m) : setMsg(m);
    setTimeout(() => { setError(null); setMsg(null); }, 3000);
  };

  const patch = async (data, successMsg) => {
    setBusy(true);
    try {
      await api.patch(`/api/admin/users/${user.id}`, data);
      flash(successMsg);
      onChanged();
    } catch (e) {
      flash(e.response?.data?.detail || "Ошибка", true);
    } finally { setBusy(false); }
  };

  const resetPwd = async () => {
    const pwd = prompt(`Новый пароль для ${user.email}:`);
    if (!pwd) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/users/${user.id}/reset-password`, { new_password: pwd });
      flash("Пароль сменён");
    } catch (e) {
      flash(e.response?.data?.detail || "Ошибка", true);
    } finally { setBusy(false); }
  };

  const removeUser = async () => {
    if (!confirm(`Удалить ${user.email} навсегда?\n\nБудут удалены: все транзакции, счета, категории, валюты, цели.`)) return;
    if (!confirm("Точно? Восстановить нельзя.")) return;
    setBusy(true);
    try {
      await api.delete(`/api/admin/users/${user.id}`);
      flash("Удалено");
      onChanged();
      onClose();
    } catch (e) {
      flash(e.response?.data?.detail || "Ошибка", true);
    } finally { setBusy(false); }
  };

  return (
    <div style={{
      background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
      padding: 18, position: "sticky", top: 70, alignSelf: "start",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontFamily: "var(--serif)" }}>{user.username}</h3>
        <button onClick={onClose} className="btn-ghost" style={{ padding: "2px 8px", fontSize: 16 }}>×</button>
      </div>

      <div style={{ fontSize: 13, color: "#515c68", marginBottom: 16 }}>
        <div style={{ color: "#1b2531", fontWeight: 500, marginBottom: 4 }}>{user.email}</div>
        <div>ID: {user.id} · {user.main_currency}</div>
        <div>Создан: {user.created_at ? new Date(user.created_at).toLocaleString("ru-RU") : "—"}</div>
      </div>

      {error && <div style={{ ...flashBox, color: "#c0432b", background: "#fef2f0", border: "1px solid #fecdd3" }}>{error}</div>}
      {msg && <div style={{ ...flashBox, color: "#167a4a", background: "#dcfce7", border: "1px solid #86efac" }}>{msg}</div>}

      {/* План */}
      <Section title="План">
        <div style={{ marginBottom: 10 }}><PlanBadge plan={user.plan} /></div>
        <label style={{ display: "grid", gap: 5, marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: "#515c68" }}>Назначить тариф</span>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={selectedPlan}
              disabled={busy}
              onChange={event => setSelectedPlan(event.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            >
              <option value="personal">Personal — бесплатно</option>
              <option value="family">Family — семейные функции</option>
            </select>
            <button
              type="button"
              disabled={busy || selectedPlan === user.plan}
              onClick={() => {
                const planLabel = selectedPlan === "family" ? "Family" : "Personal";
                if (!confirm(`Назначить пользователю тариф ${planLabel}?`)) return;
                patch({ plan: selectedPlan }, `Тариф ${planLabel} назначен администратором`);
              }}
            >
              Назначить
            </button>
          </div>
        </label>
        <div style={{ fontSize: 12, color: "#7a8590", margin: "-3px 0 12px" }}>
          Назначение действует сразу, отменяет активное автопродление и не требует оплаты.
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={Boolean(user.family_upgrade_enabled)}
            disabled={busy || user.plan === "family"}
            onChange={event => patch(
              { family_upgrade_enabled: event.target.checked },
              event.target.checked ? "Пользователь может подключить Family" : "Подключение Family отключено",
            )}
          />
          <span>Разрешить пользователю перейти на Family</span>
        </label>
        <div style={{ fontSize: 12, color: "#7a8590", marginTop: 6 }}>
          После включения пользователь увидит выбор тестового периода, месяца или года в разделе «Тариф и оплата».
        </div>
      </Section>

      {/* Статус */}
      <Section title="Статус">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            disabled={busy}
            className={user.is_active ? "btn-danger" : ""}
            onClick={() => patch({ is_active: !user.is_active },
              user.is_active ? "Заблокирован" : "Разблокирован")}
          >
            {user.is_active ? "Заблокировать" : "Разблокировать"}
          </button>
          <button
            disabled={busy || user.id === adminId}
            onClick={() => patch({ is_admin: !user.is_admin },
              user.is_admin ? "Снят admin" : "Назначен admin")}
            title={user.id === adminId ? "Себя нельзя менять" : ""}
          >
            {user.is_admin ? "Снять admin" : "Сделать admin"}
          </button>
        </div>
      </Section>

      {/* Безопасность */}
      <Section title="Безопасность">
        <button disabled={busy} onClick={resetPwd}>Сменить пароль</button>
      </Section>

      {/* Опасная зона */}
      <Section title="Опасная зона" tone="danger">
        <button
          disabled={busy || user.id === adminId}
          className="btn-danger"
          onClick={removeUser}
          title={user.id === adminId ? "Удалить себя нельзя" : ""}
        >
          Удалить пользователя
        </button>
      </Section>

      {/* Данные */}
      <Section title="Данные">
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          <Row label="Счета" value={user.accounts_count} />
          <Row label="Категории" value={user.categories_count} />
          <Row label="Транзакции" value={user.transactions_count} />
        </div>
        <p style={{ fontSize: 11, color: "#a6afb8", marginTop: 8 }}>
          Сами транзакции и счета не доступны из админки.
        </p>
      </Section>
    </div>
  );
}

export function Section({ title, children, tone }) {
  const danger = tone === "danger";
  return (
    <div style={{ marginBottom: 14, paddingTop: 12, borderTop: "1px solid #ece6d8" }}>
      <div style={{
        fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4,
        color: danger ? "#c0432b" : "#7a8590",
        marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "#7a8590" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export function Kpi({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
      padding: 16,
    }}>
      <div style={{ fontSize: 11, color: "#7a8590", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{
        fontFamily: "var(--serif)", fontSize: 30, fontWeight: 500,
        color: color || "#1b2531", lineHeight: 1.1, marginTop: 4,
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#a6afb8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function PlanBadge({ plan = "personal" }) {
  const family = plan === "family";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
      textTransform: "uppercase", letterSpacing: 0.5,
      background: family ? "#fff2cc" : "transparent",
      color: family ? "#8a641d" : "#173a54",
      border: `1px solid ${family ? "#c99b3b" : "#173a54"}`,
    }}>
      {family ? "Family" : "Personal"}
    </span>
  );
}
