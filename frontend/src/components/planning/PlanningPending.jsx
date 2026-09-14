import { formatMoney } from "../../utils/money";

export default function PlanningPending({ transactions, makeActual, remove }) {
  return <section className="planning-list-card"><h2>Плановые записи к подтверждению ({transactions.length})</h2>
      {transactions.length === 0 ? <p className="empty-state">Записей к подтверждению нет. Платежи по кредитам и будущие повторения показаны в календаре.</p> : transactions.map(transaction => <article className="planning-row" key={transaction.id}>
        <time>{new Date(transaction.date).toLocaleDateString("ru-RU")}</time><div><strong>{transaction.description || (transaction.type === "income" ? "Плановый доход" : "Плановый расход")}</strong><span>{transaction.type === "income" ? "Доход" : "Расход"}</span></div><b className={transaction.type === "income" ? "income" : "expense"}>{transaction.type === "income" ? "+" : "−"}{formatMoney(transaction.amount)} {transaction.currency}</b><div className="planning-actions"><button className="btn-secondary" type="button" onClick={() => makeActual(transaction)}>Учесть</button><button className="btn-ghost danger" type="button" onClick={() => remove(transaction)}>Удалить</button></div>
      </article>)}
    </section>;
}
