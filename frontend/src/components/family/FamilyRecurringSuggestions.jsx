import { formatMoney } from "../../utils/money";
import api from "../../api/client";

export default function FamilyRecurringSuggestions({ recurringSuggestions, submit, setMessage }) {
  return (
    <section className="family-card family-recurring-suggestions">
            <div className="family-recurring-heading">
              <div>
                <p className="family-eyebrow">Family</p>
                <h2>Регулярные платежи</h2>
                <p>Находим только повторяющиеся общие расходы. Ничего не создаём без подтверждения.</p>
              </div>
              <span className="family-recurring-badge">{recurringSuggestions.length}</span>
            </div>
            {recurringSuggestions.length ? (
              <div className="family-recurring-list">
                {recurringSuggestions.map(item => (
                  <article key={item.fingerprint} className="family-recurring-item">
                    <div className="family-recurring-copy">
                      <strong>{item.description}</strong>
                      <span>{item.frequency_label} · {item.occurrences} повторения · следующий {new Date(`${item.next_date}T12:00:00`).toLocaleDateString("ru-RU")}</span>
                      <small>{item.category_name || "Без категории"}</small>
                    </div>
                    <div className="family-recurring-amount">
                      <strong>{formatMoney(item.amount)} {item.currency}</strong>
                      {item.change_amount !== 0 && <span className={item.change_amount > 0 ? "family-expense-amount" : "family-income-amount"}>
                        {item.change_amount > 0 ? "+" : ""}{formatMoney(item.change_amount)} {item.currency} к прошлому платежу
                      </span>}
                    </div>
                    <div className="family-recurring-actions">
                      {item.can_create ? <button type="button" onClick={() => submit(async () => {
                        await api.post(`/api/family/recurring-suggestions/${item.fingerprint}/create-recurring`);
                        setMessage("Регулярный общий платёж добавлен в план");
                      })}>Добавить в план</button> : <span className="family-recurring-owner">Создать может тот, кто оплачивал</span>}
                      <button type="button" className="family-member-remove" onClick={() => submit(async () => {
                        await api.post(`/api/family/recurring-suggestions/${item.fingerprint}/dismiss`);
                        setMessage("Предложение скрыто");
                      })}>Не учитывать</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="family-analytics-empty">Пока нет уверенных совпадений. Предложения появятся после трёх похожих общих платежей.</p>}
          </section>
  );
}
