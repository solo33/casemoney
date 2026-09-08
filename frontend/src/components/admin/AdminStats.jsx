import { useState, useEffect } from "react";
import api from "../../api/client";

import { Kpi } from "./AdminParts";

export function StatsTab() {
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
                При регистрации пользователь сам выбирает <strong style={{ color: "#167a4a" }}>Personal</strong> или <strong>Family</strong>.
                Во время бесплатного запуска оба режима доступны без оплаты.
              </div>
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

          {/* Оплата Family */}
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: 16, padding: "12px 0", borderTop: "1px solid #ece6d8",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1b2531", marginBottom: 4 }}>
                Оплата Family
              </div>
              <div style={{ fontSize: 12.5, color: "#7a8590", lineHeight: 1.5 }}>
                {config.billing_enabled ? (
                  <><strong style={{ color: "#c0432b" }}>Включена.</strong> Family доступен по подписке владельца; в неё входят он сам и ещё до двух участников.</>
                ) : (
                  <><strong style={{ color: "#167a4a" }}>Отключена (бесплатный запуск).</strong> Семейные функции бесплатны для всех пользователей, независимо от их тарифа. Включите после набора базы пользователей, чтобы вернуть реальную оплату.</>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                const next = !config.billing_enabled;
                if (next && !confirm("Включить оплату Family? После этого расширенные возможности будут доступны только владельцам активной Family-подписки и приглашённым ими участникам (до трёх адресов вместе с владельцем).")) return;
                patchConfig({ billing_enabled: next });
              }}
              disabled={savingConfig}
              className={!config.billing_enabled ? "" : "btn-danger"}
              style={{ whiteSpace: "nowrap" }}
            >
              {savingConfig ? "..." : config.billing_enabled ? "Сделать бесплатным" : "Включить оплату"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
