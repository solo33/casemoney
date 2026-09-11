import { Link } from "react-router-dom";
import { formatMoney } from "../../utils/money";
import FamilyExpenseList from "./FamilyExpenseList";

export default function FamilyOverview({ controller }) {
  const { report, analyticsPeriod, pendingExpenses, recurringSuggestions } = controller;
  const expenses = [...(report?.expenses || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  return <>
    <div className="family-summary-grid">
      {(report?.totals || []).map(item => <article className="family-stat" key={item.currency}>
        <span>Общие расходы · {String(analyticsPeriod.month).padStart(2, "0")}.{analyticsPeriod.year}</span>
        <strong>{formatMoney(item.amount)} {item.currency}</strong>
      </article>)}
      {!report?.totals?.length && <article className="family-stat"><span>Общие расходы за месяц</span><strong>Пока нет</strong></article>}
      {(report?.outstanding || []).map(item => <article className="family-stat family-stat-accent" key={`${item.user_id}-${item.currency}`}>
        <span>К возмещению за всё время: {item.name}</span><strong>{formatMoney(item.amount)} {item.currency}</strong>
        <Link to="/family/settlements">Посмотреть расчёты →</Link>
      </article>)}
    </div>
    {(pendingExpenses.items.length > 0 || recurringSuggestions.length > 0) && <section className="family-card family-attention">
      <h2>Требует внимания</h2>
      {pendingExpenses.items.length > 0 && <Link to="/family/purchases">Перенести покупки в мой учёт: {pendingExpenses.items.length} →</Link>}
      {recurringSuggestions.length > 0 && <Link to="/planning#family-suggestions">Предложения регулярных платежей: {recurringSuggestions.length} →</Link>}
    </section>}
    <FamilyExpenseList expenses={expenses} title="Последние общие покупки">
      <Link className="family-inline-link" to="/family/purchases">Все покупки за месяц →</Link>
    </FamilyExpenseList>
  </>;
}
