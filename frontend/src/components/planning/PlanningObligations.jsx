import { Link } from "react-router-dom";
import { formatMoney } from "../../utils/money";

export default function PlanningObligations({ obligations, onDate }) {
  const active = obligations.filter(item => item.status === "active");
  return <section className="planning-templates-card"><h2>Кредиты и вклады</h2><p>Ближайшие платежи по ипотеке, кредитам и поступления по вкладам. Даты и суммы настраиваются в карточке обязательства.</p>
    {active.length === 0 ? <p>Активных обязательств нет.</p> : active.map(item => <article className="planning-obligation" key={item.id}>
      <div><strong>{item.name}</strong><p>{item.next_payment_date ? `Ближайшая дата: ${new Date(`${item.next_payment_date}T12:00:00`).toLocaleDateString("ru-RU")}` : "Дата платежа не задана"}{item.monthly_payment != null ? ` · ${formatMoney(item.monthly_payment)} ${item.currency}` : ""}</p></div>
      <div className="planning-actions">{item.next_payment_date && <button type="button" className="btn-secondary" onClick={() => onDate(item.next_payment_date)}>В календаре</button>}<Link className="btn-ghost" to={item.kind === "deposit" ? "/deposits" : "/credits"}>Открыть {item.kind === "deposit" ? "вклады" : "кредиты"}</Link></div>
    </article>)}
  </section>;
}
