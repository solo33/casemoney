import { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import api from "../api/client";
import { useUser } from "../contexts/UserContext";

const PAGE = 50;

export default function Admin() {
  const { user, loading: userLoading } = useUser();
  const [tab, setTab] = useState("users");

  if (userLoading) return <div className="page">Загрузка...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) {
    return (
      <div className="page" style={{ maxWidth: 600 }}>
        <h1>Доступ запрещён</h1>
        <p style={{ color: "#7a8590" }}>
          Эта страница доступна только администраторам.
        </p>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 1280 }}>
      <h1 style={{ marginBottom: 16 }}>Админка</h1>

      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        borderBottom: "1px solid #e4ddcd",
      }}>
        <TabBtn active={tab === "users"} onClick={() => setTab("users")}>Пользователи</TabBtn>
        <TabBtn active={tab === "stats"} onClick={() => setTab("stats")}>Система</TabBtn>
      </div>

      {tab === "users" && <UsersTab adminId={user.id} />}
      {tab === "stats" && <StatsTab />}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
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

// ========== USERS ==========

function UsersTab({ adminId }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ q: "", is_premium: "", is_active: "" });
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE, offset: page * PAGE };
      Object.entries(filters).forEach(([k, v]) => { if (v !== "") params[k] = v; });
      const r = await api.get("/api/admin/users", { params });
      setData(r.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (k, v) => {
    setFilters(f => ({ ...f, [k]: v }));
    setPage(0);
  };

  const onUserChanged = () => {
    load();
    if (selected) {
      api.get(`/api/admin/users/${selected.id}`)
        .then(r => setSelected(r.data))
        .catch(() => {});
    }
  };

  const totalPages = Math.ceil(data.total / PAGE);

  return (
    <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 380px" : "1fr", gap: 16 }}>
      <div>
        {/* Фильтры */}
        <div style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
          padding: 12, marginBottom: 12,
          display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        }}>
          <input
            placeholder="Email или username..."
            value={filters.q}
            onChange={e => setFilter("q", e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <select value={filters.is_premium} onChange={e => setFilter("is_premium", e.target.value)}>
            <option value="">Все планы</option>
            <option value="true">★ Premium</option>
            <option value="false">Free</option>
          </select>
          <select value={filters.is_active} onChange={e => setFilter("is_active", e.target.value)}>
            <option value="">Все</option>
            <option value="true">Активные</option>
            <option value="false">Заблокированы</option>
          </select>
          {(filters.q || filters.is_premium !== "" || filters.is_active !== "") && (
            <button className="btn-ghost" onClick={() => setFilters({ q: "", is_premium: "", is_active: "" })}>
              Сбросить
            </button>
          )}
        </div>

        {/* Pagination */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 8, fontSize: 13, color: "#7a8590",
        }}>
          <span>
            {loading ? "..." : data.total === 0 ? "Нет пользователей" :
              `${page * PAGE + 1}–${Math.min((page + 1) * PAGE, data.total)} из ${data.total}`}
          </span>
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: 4 }}>
              <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}
                style={{ padding: "4px 10px" }}>‹</button>
              <span style={{ padding: "4px 10px" }}>{page + 1} / {totalPages}</span>
              <button className="btn-ghost" disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}
                style={{ padding: "4px 10px" }}>›</button>
            </div>
          )}
        </div>

        {error && <p style={{ color: "#c0432b" }}>{error}</p>}

        {/* Таблица */}
        <div className="table-wrap" style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 8,
        }}>
          <table style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Username</th>
                <th style={th}>План</th>
                <th style={th}>Статус</th>
                <th style={{ ...th, textAlign: "right" }}>Счета</th>
                <th style={{ ...th, textAlign: "right" }}>Категории</th>
                <th style={{ ...th, textAlign: "right" }}>Транзакции</th>
                <th style={th}>Создан</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(u => (
                <tr
                  key={u.id}
                  onClick={() => setSelected(u)}
                  style={{
                    borderTop: "1px solid #ece6d8",
                    background: selected?.id === u.id ? "#fdf2f4" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <td style={td}>
                    {u.email}
                    {u.is_admin && <span style={adminBadge}>ADMIN</span>}
                  </td>
                  <td style={td}>{u.username}</td>
                  <td style={td}>
                    <PlanBadge premium={u.is_premium} />
                  </td>
                  <td style={{ ...td, color: u.is_active ? "#167a4a" : "#c0432b" }}>
                    {u.is_active ? "активен" : "заблокирован"}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{u.accounts_count}</td>
                  <td style={{ ...td, textAlign: "right" }}>{u.categories_count}</td>
                  <td style={{ ...td, textAlign: "right" }}>{u.transactions_count}</td>
                  <td style={{ ...td, color: "#a6afb8", fontSize: 12 }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("ru-RU") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sidebar */}
      {selected && (
        <UserDetail
          user={selected}
          adminId={adminId}
          onClose={() => setSelected(null)}
          onChanged={onUserChanged}
        />
      )}
    </div>
  );
}

function UserDetail({ user, adminId, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

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
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {user.is_premium ? (
            <>
              <button
                disabled={busy}
                onClick={() => patch({ premium_until: new Date(Date.now() + 30 * 86400000).toISOString() }, "Продлено")}
              >
                +30 дней
              </button>
              <button
                disabled={busy}
                className="btn-danger"
                onClick={() => patch({ is_premium: false, premium_until: null }, "Отменён")}
              >
                Отменить Premium
              </button>
            </>
          ) : (
            <button
              disabled={busy}
              onClick={() => patch({
                is_premium: true,
                premium_until: new Date(Date.now() + 30 * 86400000).toISOString(),
              }, "Premium активирован")}
            >
              ★ Активировать Premium
            </button>
          )}
        </div>
        {user.premium_until && (
          <div style={{ fontSize: 12, color: "#7a8590", marginTop: 6 }}>
            До {new Date(user.premium_until).toLocaleString("ru-RU")}
          </div>
        )}
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

// ========== STATS ==========

function StatsTab() {
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const loadConfig = () => {
    api.get("/api/admin/config")
      .then(r => setConfig(r.data))
      .catch(() => {});
  };

  useEffect(() => {
    api.get("/api/admin/stats")
      .then(r => setStats(r.data))
      .catch(e => setError(e.response?.data?.detail || "Ошибка"));
    loadConfig();
  }, []);

  const patchConfig = async (patch) => {
    setSavingConfig(true);
    try {
      const r = await api.patch("/api/admin/config", patch);
      setConfig(r.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка");
    } finally {
      setSavingConfig(false);
    }
  };

  const toggleEmailVerification = () => {
    if (!config) return;
    patchConfig({ require_email_verification: !config.require_email_verification });
  };

  if (error) return <p style={{ color: "#c0432b" }}>{error}</p>;
  if (!stats) return <p>Загрузка...</p>;

  const premiumPct = stats.total_users > 0 ? (stats.premium_users / stats.total_users * 100).toFixed(1) : 0;

  // Sparkline для регистраций
  const maxCount = Math.max(...stats.new_signups_by_day.map(d => d.count), 1);

  return (
    <div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12, marginBottom: 20,
      }}>
        <Kpi label="Всего юзеров" value={stats.total_users} />
        <Kpi label="Активных" value={stats.active_users} color="#167a4a" />
        <Kpi label="Premium" value={`${stats.premium_users}`} sub={`${premiumPct}%`} color="#173a54" />
        <Kpi label="Админов" value={stats.admin_users} />
        <Kpi label="Регистраций (7д)" value={stats.new_users_last_7d} />
        <Kpi label="Регистраций (30д)" value={stats.new_users_last_30d} />
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12, marginBottom: 20,
      }}>
        <Kpi label="Всего счетов" value={stats.total_accounts} color="#515c68" />
        <Kpi label="Всего категорий" value={stats.total_categories} color="#515c68" />
        <Kpi label="Всего транзакций" value={stats.total_transactions.toLocaleString("ru-RU")} color="#515c68" />
      </div>

      <div style={{
        background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
        padding: 18,
      }}>
        <h3 style={{ marginTop: 0, fontSize: 14, color: "#515c68", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Регистрации за 30 дней
        </h3>
        {stats.new_signups_by_day.length === 0 ? (
          <p style={{ color: "#a6afb8", margin: 0 }}>Нет регистраций</p>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120 }}>
            {stats.new_signups_by_day.map(d => (
              <div
                key={d.date}
                title={`${d.date}: ${d.count}`}
                style={{
                  flex: 1, minWidth: 6,
                  height: `${(d.count / maxCount) * 100}%`,
                  background: "#173a54", borderRadius: "2px 2px 0 0",
                  minHeight: 2,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Системные настройки */}
      {config && (
        <div style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
          padding: 18, marginTop: 20,
        }}>
          <h3 style={{ marginTop: 0, fontSize: 14, color: "#515c68", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Системные настройки
          </h3>

          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: 16, padding: "12px 0", borderBottom: "1px solid #ece6d8",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1b2531", marginBottom: 4 }}>
                Требовать подтверждение email
              </div>
              <div style={{ fontSize: 12.5, color: "#7a8590", lineHeight: 1.5 }}>
                {config.require_email_verification ? (
                  <>
                    <strong style={{ color: "#167a4a" }}>Включено.</strong> При регистрации
                    отправляется письмо со ссылкой активации. До подтверждения юзер видит баннер.
                  </>
                ) : (
                  <>
                    <strong style={{ color: "#c0432b" }}>Отключено.</strong> Новые юзеры
                    активируются автоматически (письма не отправляются).
                  </>
                )}
                {!config.smtp_configured && (
                  <div style={{
                    marginTop: 8, padding: "6px 10px",
                    background: "#f4ead3", border: "1px solid #facc15", borderRadius: 6,
                    color: "#846630", fontSize: 12,
                  }}>
                    ⚠ SMTP не настроен — даже при включённой опции письма выводятся только в консоль backend.
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={toggleEmailVerification}
              disabled={savingConfig}
              className={config.require_email_verification ? "btn-danger" : ""}
              style={{ whiteSpace: "nowrap" }}
            >
              {savingConfig ? "..." :
                config.require_email_verification ? "Отключить" : "Включить"}
            </button>
          </div>

          {/* Стартовый тариф нового пользователя */}
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: 16, padding: "12px 0",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1b2531", marginBottom: 4 }}>
                Стартовый тариф нового пользователя
              </div>
              <div style={{ fontSize: 12.5, color: "#7a8590", lineHeight: 1.5 }}>
                {config.default_plan === "premium" ? (
                  <>
                    <strong style={{ color: "#173a54" }}>Premium.</strong> Новые юзеры
                    получают premium сразу при регистрации
                    {config.default_premium_days > 0
                      ? <> на <strong>{config.default_premium_days}</strong> дней.</>
                      : <> бессрочно.</>}
                  </>
                ) : (
                  <>
                    <strong style={{ color: "#167a4a" }}>Free.</strong> Новые юзеры
                    стартуют на бесплатном тарифе с лимитами.
                  </>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              <select
                value={config.default_plan}
                disabled={savingConfig}
                onChange={e => patchConfig({ default_plan: e.target.value })}
              >
                <option value="free">Free</option>
                <option value="premium">Premium</option>
              </select>
              {config.default_plan === "premium" && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#7a8590" }}>
                  дней
                  <input
                    type="number"
                    min="0"
                    defaultValue={config.default_premium_days}
                    disabled={savingConfig}
                    onBlur={e => {
                      const v = parseInt(e.target.value, 10);
                      const days = Number.isNaN(v) || v < 0 ? 0 : v;
                      if (days !== config.default_premium_days) patchConfig({ default_premium_days: days });
                    }}
                    style={{ width: 70 }}
                    title="0 = бессрочно"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Регистрация новых пользователей */}
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: 16, padding: "12px 0", borderTop: "1px solid #ece6d8",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1b2531", marginBottom: 4 }}>
                Регистрация новых пользователей
              </div>
              <div style={{ fontSize: 12.5, color: "#7a8590", lineHeight: 1.5 }}>
                {config.registration_enabled ? (
                  <><strong style={{ color: "#167a4a" }}>Открыта.</strong> Новые пользователи могут зарегистрироваться.</>
                ) : (
                  <><strong style={{ color: "#c0432b" }}>Закрыта.</strong> Кнопка регистрации скрыта, создать аккаунт нельзя.</>
                )}
              </div>
            </div>
            <button
              onClick={() => patchConfig({ registration_enabled: !config.registration_enabled })}
              disabled={savingConfig}
              className={config.registration_enabled ? "btn-danger" : ""}
              style={{ whiteSpace: "nowrap" }}
            >
              {savingConfig ? "..." : config.registration_enabled ? "Закрыть" : "Открыть"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== shared ==========

function Section({ title, children, tone }) {
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

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "#7a8590" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Kpi({ label, value, sub, color }) {
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

function PlanBadge({ premium }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
      textTransform: "uppercase", letterSpacing: 0.5,
      background: premium ? "linear-gradient(90deg, #173a54 0%, #be123c 100%)" : "transparent",
      color: premium ? "#fff" : "#173a54",
      border: premium ? "none" : "1px solid #173a54",
    }}>
      {premium ? "★ Premium" : "Free"}
    </span>
  );
}

// styles
const th = {
  padding: "10px 12px", textAlign: "left",
};
const td = {
  padding: "8px 12px",
};
const flashBox = {
  padding: "6px 10px", borderRadius: 6, fontSize: 12, marginBottom: 10,
};
const adminBadge = {
  marginLeft: 6, fontSize: 9, padding: "1px 6px",
  background: "#1b2531", color: "#fff",
  borderRadius: 4, fontWeight: 700, letterSpacing: 0.5,
  verticalAlign: "middle",
};
