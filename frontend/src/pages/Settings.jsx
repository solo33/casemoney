
import SettingsTabs from "../components/SettingsTabs";
import Section, { muted } from "../components/settings/Section";
import { NotificationSettings, BankNotificationSettings } from "../components/settings/Notifications";

import { normalizeDashboardWidgets as normalizedWidgetSettings, DASHBOARD_WIDGETS } from "../utils/dashboardWidgets";

import { useSettingsController } from "../hooks/useSettingsController";
import { FlashBox, PlanCard, Field, NavRow, DangerRow } from "../components/settings/SettingsParts";

export default function Settings() {
  const { user, limits, emailForm, setEmailForm, pwdForm, setPwdForm, error, msg, flash, saveProfile, changePassword, saveDisplayPreferences, changeMode, updateWidget, moveWidget, deleteAllRecords, resetAll, deleteAccount } = useSettingsController();
  if (!user) return <div className="page">Загрузка...</div>;

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <h1 style={{ marginBottom: 20 }}>Настройки</h1>
      <SettingsTabs />

      {error && <FlashBox color="#c0432b" bg="#fef2f0" border="#fecdd3">{error}</FlashBox>}
      {msg && <FlashBox color="#167a4a" bg="#dcfce7" border="#86efac">{msg}</FlashBox>}

      {/* Тариф */}
      <PlanCard
        limits={limits}
        selectedMode={user?.preferred_mode || "personal"}
        familyAccess={Boolean(user?.family_access)}
        onModeChange={changeMode}
      />

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

      <Section title="Отображение">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="settings-checkbox-row">
            <span>
              <b>Начальная вкладка быстрой операции</b>
              <small>Открывается первой на главной и в мобильной форме. При необходимости её можно сменить перед сохранением.</small>
            </span>
            <select
              value={user.default_quick_operation_type || "expense"}
              onChange={event => saveDisplayPreferences({ default_quick_operation_type: event.target.value })}
              aria-label="Начальная вкладка быстрой операции"
            >
              <option value="expense">Расход</option>
              <option value="income">Доход</option>
              <option value="transfer">Перевод</option>
            </select>
          </label>
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(user.show_transfer_suggestions)}
              onChange={event => saveDisplayPreferences({ show_transfer_suggestions: event.target.checked })}
            />
            <span>
              <b>Показывать подсказки переводов</b>
              <small>Предлагает связать похожие списания и поступления между вашими счетами. Ничего не меняется без подтверждения.</small>
            </span>
          </label>
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(user.hide_zero_balance_currencies)}
              onChange={event => saveDisplayPreferences({ hide_zero_balance_currencies: event.target.checked })}
            />
            <span>
              <b>Скрывать нулевые валюты на главной</b>
              <small>Счёт без ненулевых остатков также не будет показан в блоке счетов.</small>
            </span>
          </label>
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(user.hide_dashboard_balances)}
              onChange={event => saveDisplayPreferences({ hide_dashboard_balances: event.target.checked })}
            />
            <span>
              <b>Скрывать суммы на главной</b>
              <small>Удобно, если открываете приложение рядом с другими людьми. Настройку можно быстро изменить прямо в блоке «Баланс».</small>
            </span>
          </label>
        </div>
      </Section>

      <NotificationSettings flash={flash} />
      <BankNotificationSettings flash={flash} />

      <Section title="Главная страница">
        <p style={muted}>Выберите блоки главной страницы, их порядок и начальное состояние. На телефоне свёрнутые блоки остаются компактными.</p>
        <div className="dashboard-widget-settings">
          {Object.entries(normalizedWidgetSettings(user.dashboard_widgets))
            .sort(([, a], [, b]) => a.order - b.order)
            .map(([id, options], index, all) => {
              const label = DASHBOARD_WIDGETS.find(widget => widget.id === id)?.label || id;
              return (
                <div className="dashboard-widget-setting" key={id}>
                  <label className="settings-checkbox-row">
                    <input type="checkbox" checked={options.visible} onChange={event => updateWidget(id, { visible: event.target.checked })} />
                    <span><b>{label}</b><small>{options.collapsed ? "Показывается свёрнутым" : "Показывается развёрнутым"}</small></span>
                  </label>
                  <div className="dashboard-widget-actions">
                    <button type="button" className="btn-ghost" onClick={() => updateWidget(id, { collapsed: !options.collapsed })}>{options.collapsed ? "Развернуть" : "Свернуть"}</button>
                    <button type="button" className="btn-ghost" disabled={index === 0} onClick={() => moveWidget(id, -1)} aria-label={`Поднять ${label}`}>↑</button>
                    <button type="button" className="btn-ghost" disabled={index === all.length - 1} onClick={() => moveWidget(id, 1)} aria-label={`Опустить ${label}`}>↓</button>
                  </div>
                </div>
              );
            })}
        </div>
      </Section>

      {/* Импорт и экспорт */}
      <Section title="Импорт и экспорт">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <NavRow
            to="/import"
            icon="📥"
            title="Импорт"
            description="Загрузка операций из CSV, XLSX или XLS"
          />
        </div>
        <p style={muted}>
          Экспорт: скачать все операции в CSV (формат совместим с импортом).
        </p>
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={() => {
            const token = localStorage.getItem("token");
            const url = `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/export/csv`;
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

      <Section title="Документы">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <NavRow
            to="/privacy"
            icon="📄"
            title="Политика конфиденциальности"
            description="Как обрабатываются персональные данные и финансовые записи"
          />
          <NavRow
            to="/terms"
            icon="⚖"
            title="Пользовательское соглашение"
            description="Условия использования CaseMoney"
          />
          <NavRow
            to="/cookies"
            icon="🍪"
            title="Cookie"
            description="Какие технические данные хранит браузер и зачем"
          />
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
