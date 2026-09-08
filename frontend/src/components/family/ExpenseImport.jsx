import api from "../../api/client";
import CategoryOptions from "../CategoryOptions";
import { formatMoney } from "../../utils/money";
export default function ExpenseImport({ pendingExpenses, pendingCategoryDrafts, setPendingCategoryDrafts, pendingAccountDrafts, setPendingAccountDrafts, pendingTotalsByAccount, submit, setError, setMessage }) { return (<section className="family-card">
              <h2>Перенести общие покупки в мой учёт</h2>
              <p>Назначьте свою категорию и счёт для каждой покупки. При подтверждении создадутся обычные расходы и остатки выбранных счетов уменьшатся.</p>
              <div className="family-pending-expenses">
                {pendingExpenses.items.map(item => (
                  <article key={item.id}>
                    <div>
                      <strong>{item.description || "Общая покупка"}</strong>
                      <span>{item.source_name} · {item.source_category_name} · {new Date(item.date).toLocaleDateString("ru-RU")}</span>
                    </div>
                    <strong>{formatMoney(item.amount)} {item.currency}</strong>
                    <select
                      value={pendingCategoryDrafts[item.id] || ""}
                      onChange={event => setPendingCategoryDrafts(current => ({ ...current, [item.id]: event.target.value }))}
                      aria-label="Ваша категория"
                    >
                      <option value="">Выберите категорию</option>
                      <CategoryOptions categories={pendingExpenses.categories} />
                    </select>
                    <select
                      value={pendingAccountDrafts[item.id] || ""}
                      onChange={event => setPendingAccountDrafts(current => ({ ...current, [item.id]: event.target.value }))}
                      aria-label="Ваш счёт"
                    >
                      <option value="">Выберите свой счёт</option>
                      {pendingExpenses.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                  </article>
                ))}
                {pendingExpenses.items.length > 0 && <>
                  <div className="family-pending-totals">
                    <strong>Будет списано со счетов</strong>
                    {pendingTotalsByAccount.length
                      ? pendingTotalsByAccount.map(item => <span key={`${item.account?.id}-${item.currency}`}>{item.account?.name}: {formatMoney(item.amount)} {item.currency}</span>)
                      : <span>Выберите счёт для каждой покупки.</span>}
                  </div>
                  <button type="button" onClick={() => {
                    const incomplete = pendingExpenses.items.some(item => !pendingCategoryDrafts[item.id] || !pendingAccountDrafts[item.id]);
                    if (incomplete) { setError("Для каждой покупки выберите свою категорию и счёт"); return; }
                    submit(async () => {
                      await api.post("/api/family/expense-accounting/accept-batch", {
                        items: pendingExpenses.items.map(item => ({
                          id: item.id,
                          owner_category_id: Number(pendingCategoryDrafts[item.id]),
                          owner_account_id: Number(pendingAccountDrafts[item.id]),
                        })),
                      });
                      setMessage("Покупки перенесены в ваши расходы и списаны с выбранных счетов");
                    });
                  }}>Подтвердить перенос</button>
                </>}
                {!pendingExpenses.items.length && <p className="family-analytics-empty">Все общие покупки уже учтены.</p>}
              </div>
            </section>); }
