

export default function FinanceAssistant({ insights, aiLoading, requestAiInsight, aiError, aiInsight }) {
  return (
    <section className="finance-insights-card">
              <div>
                <p className="finance-insights-eyebrow">ФИНАНСОВЫЙ ПОМОЩНИК</p>
                <h2>Наблюдения за 30 дней</h2>
                <p>Подсказки строятся только по вашим суммам и категориям. Свободные вопросы и доступ к личным данным других людей отключены.</p>
              </div>
              <div className="finance-insights-list">
                {(insights.insights || []).map((item, index) => (
                  <article key={`${item.title}-${index}`} className={`finance-insight finance-insight-${item.kind}`}>
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                  </article>
                ))}
              </div>
              <div className="finance-ai-actions">
                <b>AI-помощник</b>
                <span>Работает только с итогами и категориями за 30 дней — без свободных вопросов и без доступа к отдельным операциям.</span>
                <div>
                  <button type="button" className="btn-ghost" disabled={aiLoading} onClick={() => requestAiInsight("monthly_overview")}>Итог месяца</button>
                  <button type="button" className="btn-ghost" disabled={aiLoading} onClick={() => requestAiInsight("spending_anomalies")}>Проверить расходы</button>
                  <button type="button" className="btn-ghost" disabled={aiLoading} onClick={() => requestAiInsight("budget_tips")}>Идеи для бюджета</button>
                </div>
                {aiLoading && <small>Готовим подсказку…</small>}
                {aiError && <small className="finance-ai-error">{aiError}</small>}
                {aiInsight && <div className="finance-ai-result">
                  {aiInsight.recommendations.map((item, index) => <p key={`${index}-${item}`}>{item}</p>)}
                  <small>{aiInsight.source_note} Осталось подсказок в этом месяце: {aiInsight.remaining_requests}.</small>
                </div>}
              </div>
            </section>
  );
}
