import { card, paragraph } from "../PublicPage";

import { Link } from "react-router-dom";
import { planRows } from "../../utils/helpView";

export function PlanComparison() {
  return (
    <section id="plans" style={card} className="help-section plan-comparison">
      <div className="plan-comparison-heading">
        <div>
          <p className="plan-comparison-kicker">Тарифы</p>
          <h2>Personal или Family?</h2>
          <p style={paragraph}>Personal остаётся бесплатным для личного учёта. Family нужен, когда появляются общие деньги, планирование и финансовые обязательства.</p>
        </div>
        <Link className="plan-comparison-link" to="/settings/billing">Тариф и оплата →</Link>
      </div>
      <div className="plan-quick-grid" aria-label="Краткое сравнение тарифов">
        <article><span>PERSONAL</span><h3>Личные финансы</h3><p>Бесплатно: всё необходимое для самостоятельного учёта.</p></article>
        <article><span>FAMILY</span><h3>Общие финансы</h3><p>Для семьи: общие расходы, планирование, обязательства и расширенная аналитика.</p></article>
      </div>
      <h3 className="plan-table-title">Подробное сравнение</h3>
      <div className="plan-table-wrap"><table className="plan-table"><thead><tr><th>Возможность</th><th>Personal</th><th>Family</th></tr></thead><tbody>{planRows.map(([feature, personal, family]) => <tr key={feature}><td>{feature}</td><td>{personal}</td><td>{family}</td></tr>)}</tbody></table></div>
      <p className="plan-comparison-note">Переход на Family открывает администратор для конкретного аккаунта. Сейчас можно выбрать тестовые 7 дней либо тестовую оплату на месяц или год; персональные данные при возврате на Personal сохраняются.</p>
    </section>
  );
}
