import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import SettingsTabs from "../components/SettingsTabs";
import { useUser } from "../contexts/UserContext";


const statusNames = { succeeded: "Успешно", active: "Активна", canceled: "Отменена", past_due: "Завершена" };
const formatDate = value => value ? new Date(value).toLocaleDateString("ru-RU") : "—";

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

function PeriodCard({ active, title, price, text, onClick }) {
  return <button type="button" className={`period-card ${active ? "active" : ""}`} onClick={onClick}><span>{title}</span><strong>{price}</strong><small>{text}</small></button>;
}

const styles = `
.billing-page{max-width:1050px}.billing-alert,.billing-locked{padding:14px;border-radius:10px;margin:12px 0}.billing-error{background:#fff0ed;color:#b43320}.billing-success{background:#ecf8ee;color:#166534}.billing-locked,.family-welcome,.billing-card{background:#fffdf7;border:1px solid #e4ddcd;border-radius:12px;padding:22px}.billing-locked h2,.family-welcome h2,.billing-card h2{margin-top:0}.family-welcome{box-shadow:inset 0 4px #c89b3c}.billing-badge{font-size:12px;font-weight:700;color:#9a6a13;text-transform:uppercase}.period-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.period-card{display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:16px;background:#fff;border:1px solid #ddd4c2;color:#173a54}.period-card.active{border-color:#173a54;box-shadow:0 0 0 2px #173a5422}.period-card span{font-size:18px;font-weight:700}.period-card strong{font-size:22px}.period-card small{color:#75808b}.checkout-box{margin-top:16px;padding:18px;border-radius:10px;background:#f8f3e8;border:1px solid #e1d5bd}.checkout-box h3{margin-top:0}.trial-warning{background:#fff7df;border-color:#e6c978}.checkout-box label{display:flex;gap:8px;align-items:flex-start}.checkout-box>button{margin-top:16px}.test-mode{display:inline-block;padding:5px 9px;margin-bottom:12px;border-radius:6px;background:#173a54;color:white;font-size:11px;font-weight:700}.fake-card{max-width:390px;padding:18px;border-radius:14px;background:linear-gradient(135deg,#173a54,#285f80);color:white;margin-bottom:14px}.fake-card label{display:grid;gap:5px}.fake-card>div{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.fake-card input{background:#ffffffee}.payment-confirm{font-size:13px}.billing-card{margin-top:16px}.billing-card dl{margin-bottom:0}.billing-card dl div,.billing-history div{display:grid;grid-template-columns:180px 1fr auto;gap:12px;padding:12px 0;border-bottom:1px solid #eee6d5}.billing-card dt{color:#738091}.billing-card dd{margin:0;font-weight:600}.billing-history em{font-style:normal;color:#738091}@media(max-width:700px){.period-grid{grid-template-columns:1fr}.billing-card dl div,.billing-history div{grid-template-columns:1fr;gap:3px}}
`;
