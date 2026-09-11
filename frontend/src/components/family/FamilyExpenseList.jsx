import { formatMoney } from "../../utils/money";

export default function FamilyExpenseList({ expenses = [], title = "Общие покупки", children }) {
  return <section className="family-card">
    <h2>{title}</h2>
    <div className="family-expenses">
      {expenses.map(item => <article key={item.id}>
        <div><strong>{item.description || item.category_name || "Общий расход"}</strong>
          <span>{item.paid_by_name} · {item.account_name || "личный счёт"} · {new Date(item.date).toLocaleDateString("ru-RU")}</span>
        </div>
        <div><strong>{formatMoney(item.amount)} {item.currency}</strong>
          {item.reimbursement_amount > 0 && <span>к возмещению {formatMoney(item.reimbursement_amount)} {item.currency}</span>}
        </div>
      </article>)}
      {!expenses.length && <p>За этот месяц общих покупок нет. Отметьте расход как семейный при создании записи.</p>}
    </div>
    {children}
  </section>;
}
