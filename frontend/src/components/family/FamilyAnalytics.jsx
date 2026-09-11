import { formatMoney } from "../../utils/money";

export default function FamilyAnalytics({ downloadAnalyticsPdf, exportingReport, emailAnalytics, analytics, changeLabel }) {
  return (
    <section className="family-card family-analytics">
            <div className="family-analytics-heading">
              <div>
                <p className="family-eyebrow">Family</p>
                <h2>Семейный отчёт</h2>
              </div>
              <div className="family-report-controls">
                <div className="family-report-actions">
                  <button type="button" className="family-report-secondary" onClick={downloadAnalyticsPdf} disabled={exportingReport}>PDF</button>
                  <button type="button" onClick={emailAnalytics} disabled={exportingReport}>{exportingReport ? "Готовим…" : "На email"}</button>
                </div>
              </div>
            </div>
            <div className="family-analytics-stats family-analytics-stats-four">
              <article><span>Доходы</span><strong>{formatMoney(analytics?.income_total || 0)} {analytics?.currency || "RUB"}</strong></article>
              <article><span>Расходы</span><strong>{formatMoney(analytics?.expense_total || 0)} {analytics?.currency || "RUB"}</strong></article>
              <article className={analytics?.net_total < 0 ? "family-stat-negative" : "family-stat-accent"}><span>Результат</span><strong>{formatMoney(analytics?.net_total || 0)} {analytics?.currency || "RUB"}</strong></article>
              <article><span>Запланировано</span><strong>{formatMoney(analytics?.planned_total || 0)} {analytics?.currency || "RUB"}</strong></article>
            </div>
            {analytics?.unaccounted_expense_total > 0 && (
              <p className="family-analytics-note">
                В общей сумме учтено {formatMoney(analytics.unaccounted_expense_total)} {analytics.currency} по {analytics.unaccounted_expense_count} покупкам, которые ещё ждут распределения по вашим категориям.
              </p>
            )}
            {(analytics?.month_summary || []).length > 0 && (
              <section className="family-month-summary" aria-label="Итоги семейного месяца">
                {(analytics.month_summary || []).map(item => (
                  <article className={`family-month-summary-item family-month-summary-item--${item.kind}`} key={`${item.kind}-${item.title}`}>
                    <span>{item.title}</span>
                    <strong>{item.kind === "deficit" ? "−" : ""}{formatMoney(item.amount)} {analytics.currency}</strong>
                    <small>{item.description}</small>
                  </article>
                ))}
              </section>
            )}
            <section className="family-forecast-block">
              <div className="family-forecast-heading">
                <div>
                  <h3>Прогноз до конца месяца</h3>
                  <p>Рассчитывается только по общим операциям и не показывает личные остатки участников.</p>
                </div>
                {analytics?.forecast?.is_current_period && <span className="family-forecast-days">Осталось {analytics.forecast.days_remaining} дн.</span>}
              </div>
              {analytics?.forecast?.is_current_period ? <>
                <div className="family-forecast-stats">
                  <article><span>Средний расход в день</span><strong>{formatMoney(analytics.forecast.average_daily_expenses)} {analytics.currency}</strong></article>
                  <article><span>Прогноз расходов</span><strong>{formatMoney(analytics.forecast.predicted_expenses)} {analytics.currency}</strong></article>
                  <article className={analytics.forecast.predicted_net < 0 ? "family-stat-negative" : "family-stat-accent"}><span>Прогноз результата</span><strong>{formatMoney(analytics.forecast.predicted_net)} {analytics.currency}</strong></article>
                </div>
                <div className="family-analytics-columns family-forecast-details">
                  <div>
                    <h3>Риск перерасхода</h3>
                    {(analytics.forecast.budget_risks || []).map(item => <div className="family-analytics-row" key={item.category_name}><span>{item.category_name}<small>Прогноз {formatMoney(item.forecast)} {analytics.currency}</small></span><strong>+{formatMoney(item.overrun)} {analytics.currency}</strong></div>)}
                    {!analytics.forecast.budget_risks?.length && <p className="family-analytics-empty">По заданным семейным лимитам риска перерасхода нет.</p>}
                  </div>
                  <div>
                    <h3>Ближайшие общие платежи</h3>
                    {(analytics.forecast.upcoming || []).map(item => <div className="family-analytics-row" key={item.id}><span>{item.description}<small>{new Date(item.date).toLocaleDateString("ru-RU")}</small></span><strong className={item.type === "expense" ? "family-expense-amount" : "family-income-amount"}>{item.type === "expense" ? "−" : "+"}{formatMoney(item.amount)} {analytics.currency}</strong></div>)}
                    {!analytics.forecast.upcoming?.length && <p className="family-analytics-empty">Запланированных общих операций до конца месяца нет.</p>}
                  </div>
                </div>
              </> : <p className="family-analytics-empty">Прогноз доступен для текущего месяца. Для выбранного периода показана фактическая сводка выше.</p>}
            </section>
            <div className="family-analytics-columns">
              <div>
                <h3>Вклад участников</h3>
                {(analytics?.members || []).map(item => <div className="family-analytics-row" key={item.user_id}><span>{item.name}</span><strong>{formatMoney(item.actual)} {analytics.currency}</strong></div>)}
              </div>
              <div>
                <h3>Категории общих расходов</h3>
                {(analytics?.categories || []).slice(0, 5).map(item => <div className="family-analytics-row" key={item.name}><span>{item.name}</span><strong>{formatMoney(item.actual)} {analytics.currency}</strong></div>)}
                {!analytics?.categories?.length && <p className="family-analytics-empty">Покупки ещё ждут распределения по вашим категориям.</p>}
              </div>
            </div>
            <div className="family-analytics-columns family-analytics-details">
              <div>
                <h3>Сравнение с прошлым месяцем</h3>
                <div className="family-analytics-row"><span>Доходы</span><strong>{changeLabel(analytics?.comparison?.income_change)}</strong></div>
                <div className="family-analytics-row"><span>Расходы</span><strong>{changeLabel(analytics?.comparison?.expense_change)}</strong></div>
                <p className="family-analytics-note">Расходы прошлого месяца: {formatMoney(analytics?.comparison?.previous_expenses || 0)} {analytics?.currency || "RUB"}</p>
              </div>
              <div>
                <h3>План и факт бюджета</h3>
                {analytics?.budget?.count ? <>
                  <div className="family-analytics-row"><span>Лимит</span><strong>{formatMoney(analytics.budget.plan)} {analytics.currency}</strong></div>
                  <div className="family-analytics-row"><span>Факт</span><strong>{formatMoney(analytics.budget.fact)} {analytics.currency}</strong></div>
                  <div className="family-analytics-row"><span>Остаток</span><strong>{formatMoney(analytics.budget.remaining)} {analytics.currency}</strong></div>
                </> : <p className="family-analytics-empty">Для этого месяца нет семейных лимитов в разделе «Бюджет».</p>}
              </div>
            </div>
            <div className="family-analytics-columns family-analytics-details">
              <div>
                <h3>Взаиморасчёты за месяц</h3>
                {(analytics?.settlements || []).slice(0, 4).map(item => <div className="family-analytics-row" key={item.id}><span>{item.from_name} → {item.to_name}</span><strong>{formatMoney(item.amount)} {analytics.currency}</strong></div>)}
                {!analytics?.settlements?.length && <p className="family-analytics-empty">Возмещений за этот месяц пока нет.</p>}
              </div>
              <div>
                <h3>Крупные покупки</h3>
                {(analytics?.notable_expenses || []).map(item => <div className="family-analytics-row" key={item.id}><span>{item.description}<small>{item.paid_by_name}</small></span><strong>{formatMoney(item.amount)} {analytics.currency}</strong></div>)}
                {!analytics?.notable_expenses?.length && <p className="family-analytics-empty">Пока нет операций для анализа.</p>}
              </div>
            </div>
            <div className="family-analytics-details family-goals-section">
              <h3>Общие цели</h3>
              {(analytics?.goals || []).map(item => <div className="family-analytics-row" key={item.id}><span>{item.name}<small>Внесено за месяц: {formatMoney(item.monthly_contribution)} {analytics.currency}</small></span><strong>{item.progress_percent}%<small>{formatMoney(item.current_amount)} из {formatMoney(item.target_amount)} {analytics.currency}</small></strong></div>)}
              {!analytics?.goals?.length && <p className="family-analytics-empty">Общих целей пока нет. Создайте цель и отметьте её как общую.</p>}
            </div>
            {analytics?.skipped_currencies?.length > 0 && <p className="family-analytics-note">Не удалось пересчитать: {analytics.skipped_currencies.join(", ")}. Используйте доступный курс в настройках валют.</p>}
          </section>
  );
}
