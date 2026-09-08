
import { useState, useCallback, useEffect } from "react";
import { useUser } from "../contexts/UserContext";

import api from "../api/client";

import SettingsTabs from "../components/SettingsTabs";
import { PeriodCard } from "../components/billing/BillingParts";
import { formatDate, statusNames, styles } from "../utils/billingView";

export default function Billing() {
  const [data, setData] = useState(null);
  const [choice, setChoice] = useState("");
  const [trialAccepted, setTrialAccepted] = useState(false);
  const [paymentAccepted, setPaymentAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const { user, refresh } = useUser();

  const load = useCallback(async () => {
    const response = await api.get("/api/billing/overview");
    setData(response.data);
  }, []);

  useEffect(() => {
    load().catch(err => setError(err.response?.data?.detail || "Не удалось загрузить тариф"))
      .finally(() => setLoading(false));
  }, [load]);

  const activate = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      await api.post("/api/billing/test-family", {
        period: choice,
        acknowledge_family_data_cleanup: choice === "trial" && trialAccepted,
        accept_test_payment: choice !== "trial" && paymentAccepted,
      });
      await Promise.all([load(), refresh()]);
      setChoice("");
      setMessage(choice === "trial" ? "Тестовый период Family активирован на 7 дней" : "Тестовая оплата прошла успешно. Family активирован");
    } catch (err) { setError(err.response?.data?.detail || "Не удалось подключить Family"); }
    finally { setBusy(false); }
  };

  return <main className="page billing-page">
    <h1>Тариф и оплата</h1>
    <SettingsTabs />
    {error && <div className="billing-alert billing-error">{error}</div>}
    {message && <div className="billing-alert billing-success">{message}</div>}
    {loading ? <p>Загружаем данные…</p> : <>
      {data.plan === "personal" && !data.billing_enabled && user?.family_access && <section className="family-welcome">
        <span className="billing-badge">Бесплатный запуск</span>
        <h2>Family уже доступен вам бесплатно</h2>
        <p>Пока идёт запуск, все функции Family (семейное пространство, бюджеты, кредиты и вклады) открыты без оплаты и без подписки — ничего подключать не нужно.</p>
      </section>}

      {data.plan === "personal" && data.billing_enabled && user?.family_access && <section className="billing-card"><h2>Family предоставлен владельцем</h2><p>Доступ к семейному пространству уже активирован. Подписку оформляет владелец семьи.</p></section>}

      {data.plan === "personal" && data.billing_enabled && !user?.family_access && <section className="family-welcome">
        <span className="billing-badge">Добро пожаловать</span>
        <h2>Попробуйте CaseMoney Family</h2>
        <p>Выберите период. Сейчас используется тестовая оплата: деньги не списываются и настоящие данные карты не запрашиваются.</p>
        <div className="period-grid">
          <PeriodCard active={choice === "trial"} title="7 дней" price="Бесплатно" text="Пробный доступ" onClick={() => setChoice("trial")} />
          <PeriodCard active={choice === "month"} title="1 месяц" price={`${data.test_month_price.toLocaleString("ru-RU")} ₽`} text="Тестовая оплата" onClick={() => setChoice("month")} />
          <PeriodCard active={choice === "year"} title="1 год" price={`${data.test_year_price.toLocaleString("ru-RU")} ₽`} text="Тестовая оплата" onClick={() => setChoice("year")} />
        </div>

        {choice === "trial" && <div className="checkout-box trial-warning"><h3>Перед началом тестового периода</h3><p>Если после окончания вы вернётесь на Personal, персональные счета и операции сохранятся. Данные, созданные только в Family, в дальнейшем могут быть очищены.</p><label><input type="checkbox" checked={trialAccepted} onChange={e => setTrialAccepted(e.target.checked)} /> Я понял предупреждение и хочу начать тестовый период</label><button disabled={busy || !trialAccepted} onClick={activate}>{busy ? "Активируем…" : "Начать 7 дней бесплатно"}</button></div>}

        {choice && choice !== "trial" && <div className="checkout-box"><h3>Тестовая форма оплаты</h3><div className="test-mode">ТЕСТОВЫЙ РЕЖИМ · списания не будет</div><div className="fake-card"><label>Номер тестовой карты<input value="4242 4242 4242 4242" readOnly /></label><div><label>Срок<input value="12/30" readOnly /></label><label>CVC<input value="123" readOnly /></label></div></div><label className="payment-confirm"><input type="checkbox" checked={paymentAccepted} onChange={e => setPaymentAccepted(e.target.checked)} /> Подтверждаю тестовую оплату тарифа Family на {choice === "year" ? "год" : "месяц"}</label><button disabled={busy || !paymentAccepted} onClick={activate}>{busy ? "Проверяем…" : "Оплатить тестово"}</button></div>}
      </section>}

      {data.plan === "family" && <section className="billing-card"><h2>Family активирован</h2><dl><div><dt>Источник</dt><dd>{data.subscription?.provider === "test" ? "Тестовое подключение" : data.plan_source === "billing" ? "Подписка" : "Предоставлено администратором"}</dd></div><div><dt>Действует до</dt><dd>{formatDate(data.subscription?.current_period_end || data.plan_expires_at)}</dd></div><div><dt>Продление</dt><dd>{data.subscription?.provider === "test" ? "Не выполняется в тестовом режиме" : data.subscription?.cancel_at_period_end ? "Отключено" : "Включено"}</dd></div></dl></section>}

      <section className="billing-card"><h2>История платежей</h2>{data.payments.length === 0 ? <p>Платежей пока нет.</p> : <div className="billing-history">{data.payments.map(item => <div key={item.id}><span>{formatDate(item.paid_at || item.created_at)}</span><strong>{item.kind === "trial" ? "Пробный период" : `${Number(item.amount).toLocaleString("ru-RU")} ${item.currency}`}</strong><em>{statusNames[item.status] || item.status}</em></div>)}</div>}</section>
    </>}
    <style>{styles}</style>
  </main>;
}
