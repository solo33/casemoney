import { useEffect, useState } from "react";
import Section, { muted } from "./Section";
import WebPushControl from "../../components/WebPushControl";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";

import { BANK_APPS, getBankNotificationStatus, isBankNotificationImportAvailable, requestBankNotificationPermission, saveBankNotificationSettings } from "../../services/bankNotificationImport";

export function NotificationSettings({ flash }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.get("/api/notifications/settings", { skipGlobalProgress: true })
      .then(response => { if (active) setSettings(response.data); })
      .catch(() => { if (active) setSettings({ events: {}, preferences: {} }); });
    return () => { active = false; };
  }, []);

  const setChannel = (event, channel, value) => {
    setSettings(current => ({
      ...current,
      preferences: {
        ...current.preferences,
        [event]: { ...current.preferences[event], [channel]: value },
      },
    }));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await api.put("/api/notifications/settings", { preferences: settings.preferences });
      setSettings(response.data);
      flash("Настройки уведомлений сохранены");
    } catch (error) {
      flash(error.response?.data?.detail || "Не удалось сохранить настройки уведомлений", true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Уведомления">
      <p style={muted}>Выберите, о каких событиях CaseMoney будет сообщать в колокольчике, по email и через push. Push приходит только на устройства, где вы отдельно дали разрешение.</p>
      <WebPushControl flash={flash} />
      {!settings ? <p style={muted}>Загружаем настройки…</p> : (
        <>
          <div className="notification-settings-grid">
            {Object.entries(settings.events || {}).map(([key, event]) => {
              const choice = settings.preferences?.[key] || { in_app: true, email: false, push: true };
              return <div className="notification-settings-row" key={key}>
                <div><b>{event.label}</b><small>{event.description}</small></div>
                <label><input type="checkbox" checked={choice.in_app} onChange={item => setChannel(key, "in_app", item.target.checked)} /> В приложении</label>
                <label><input type="checkbox" checked={choice.email} onChange={item => setChannel(key, "email", item.target.checked)} /> Email</label>
                <label><input type="checkbox" checked={choice.push} onChange={item => setChannel(key, "push", item.target.checked)} /> Push</label>
              </div>;
            })}
          </div>
          <button type="button" onClick={save} disabled={saving} style={{ marginTop: 14 }}>{saving ? "Сохраняем…" : "Сохранить уведомления"}</button>
        </>
      )}
    </Section>
  );
}

export function BankNotificationSettings({ flash }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isBankNotificationImportAvailable()) return undefined;
    let active = true;
    const loadStatus = () => getBankNotificationStatus().then(next => {
      if (active) setStatus(next);
    }).catch(() => {
      if (active) setStatus(null);
    });
    loadStatus();
    const onResume = () => loadStatus();
    window.addEventListener("focus", onResume);
    return () => { active = false; window.removeEventListener("focus", onResume); };
  }, []);

  if (!isBankNotificationImportAvailable()) return null;
  const banks = status?.banks || {};
  const updateBank = async (packageName, checked) => {
    const next = { ...banks, [packageName]: checked };
    setSaving(true);
    try {
      const response = await saveBankNotificationSettings({ enabled: true, banks: next });
      setStatus(response);
    } catch {
      flash("Не удалось сохранить выбор банков", true);
    } finally { setSaving(false); }
  };

  return (
    <Section title="Импорт банковских уведомлений">
      <p style={muted}>Работает только в Android‑приложении. CaseMoney создаёт черновики на этом телефоне: исходный текст push не отправляется на сервер, а операция не меняет баланс без вашего подтверждения.</p>
      {!status ? <p style={muted}>Проверяем доступ…</p> : <>
        <div className="bank-import-permission">
          <div><b>{status.permissionGranted ? "Доступ к уведомлениям разрешён" : "Доступ к уведомлениям не включён"}</b><small>Android выдаёт системный доступ ко всем уведомлениям. Приложение обрабатывает только выбранные банки и отбрасывает коды, OTP и сообщения безопасности.</small></div>
          <button type="button" className="btn-secondary" onClick={async () => { await requestBankNotificationPermission(); flash("Откройте CaseMoney после включения доступа в системных настройках."); }}>Открыть настройки Android</button>
        </div>
        <div className="bank-import-banks">
          {BANK_APPS.map(bank => <label key={bank.id}><input type="checkbox" checked={Boolean(banks[bank.id])} disabled={saving || !status.permissionGranted} onChange={event => updateBank(bank.id, event.target.checked)} /> <span><b>{bank.label}</b><small>Распознавать операции из уведомлений этого приложения</small></span></label>)}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}><button type="button" onClick={() => navigate("/bank-drafts")}>Открыть черновики</button>{status.enabled && <button type="button" className="btn-ghost" onClick={async () => { setSaving(true); try { setStatus(await saveBankNotificationSettings({ enabled: false, banks })); } finally { setSaving(false); } }}>Приостановить импорт</button>}</div>
      </>}
    </Section>
  );
}

// === components ===
