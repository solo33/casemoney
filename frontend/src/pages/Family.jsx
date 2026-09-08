import FamilyRecurringSuggestions from "../components/family/FamilyRecurringSuggestions";
import FamilyAnalytics from "../components/family/FamilyAnalytics";
import FamilyMembers from "../components/family/FamilyMembers";
import FamilySharedAccounts from "../components/family/FamilySharedAccounts";
import FamilySettlementForm from "../components/family/FamilySettlementForm";
import "../styles/family.css";
import SettingsTabs from "../components/SettingsTabs";
import api from "../api/client";
import { formatMoney } from "../utils/money";
import ExpenseImport from "../components/family/ExpenseImport";
import { useFamilyController } from "../hooks/useFamilyController";

export default function Family() {
  const { state, report, analytics, recurringSuggestions, pendingExpenses, pendingCategoryDrafts, setPendingCategoryDrafts, pendingAccountDrafts, setPendingAccountDrafts, shareDraft, setShareDraft, analyticsPeriod, setAnalyticsPeriod, familyName, setFamilyName, inviteEmail, setInviteEmail, settlement, setSettlement, message, setMessage, error, setError, loading, exportingReport, submit, activeMembers, ownAccounts, pendingTotalsByAccount, selectedSharedAccount, roleLabel, selectAccountForSharing, downloadAnalyticsPdf, emailAnalytics, currencyOptions, selectSettlementRecipient, changeLabel } = useFamilyController();
  return (
    <main className="page family-page">
      <h1>Семейные финансы</h1>
      <SettingsTabs />

      <section className="family-intro">
        <strong>Общие покупки без раскрытия личных финансов</strong>
        <p>
          Каждый ведёт собственные счета. В семейный отчёт попадают только операции,
          которые участник сам отметил как общие.
        </p>
      </section>

      {loading && <p>Обновляем данные…</p>}
      {error && <div className="family-error">{error}</div>}
      {message && <div className="family-success">{message}</div>}

      {!loading && !state.family && (
        <>
          {(state.pending_invitations || []).map(invitation => (
            <section className="family-card" key={invitation.id}>
              <h2>Вас приглашают в «{invitation.family_name}»</h2>
              <button onClick={() => submit(async () => {
                await api.post(`/api/family/invitations/${invitation.id}/accept`);
                setMessage("Приглашение принято");
              })}>
                Принять приглашение
              </button>
            </section>
          ))}
          <section className="family-card">
            <h2>Создать семейное пространство</h2>
            <p>После создания вы сможете пригласить второго участника по email.</p>
            <form onSubmit={event => {
              event.preventDefault();
              submit(async () => {
                await api.post("/api/family/", { name: familyName });
                setMessage("Семейное пространство создано");
              });
            }}>
              <input
                value={familyName}
                onChange={event => setFamilyName(event.target.value)}
                placeholder="Название семьи"
                required
              />
              <button type="submit">Создать</button>
            </form>
          </section>
        </>
      )}

      {state.family && (
        <>
          <div className="family-heading">
            <div>
              <span>Семейное пространство</span>
              <h2>{state.family.name}</h2>
            </div>
            <span className="family-role">
              {roleLabel(state.family.current_user_role)}
            </span>
          </div>

          <div className="family-summary-grid">
            {(report?.totals || []).map(item => (
              <article className="family-stat" key={item.currency}>
                <span>Все общие расходы за {String(analyticsPeriod.month).padStart(2, "0")}.{analyticsPeriod.year}</span>
                <strong>{formatMoney(item.amount)} {item.currency}</strong>
              </article>
            ))}
            {(report?.outstanding || []).map(item => (
              <article className="family-stat family-stat-accent" key={`${item.user_id}-${item.currency}`}>
                <span>К возмещению за все периоды: {item.name}</span>
                <strong>{formatMoney(item.amount)} {item.currency}</strong>
              </article>
            ))}
            {!report?.totals?.length && (
              <article className="family-stat">
                <span>Общие расходы</span>
                <strong>Пока нет</strong>
              </article>
            )}
          </div>

          <FamilyRecurringSuggestions recurringSuggestions={recurringSuggestions} submit={submit} setMessage={setMessage} />

          <FamilyAnalytics analyticsPeriod={analyticsPeriod} setAnalyticsPeriod={setAnalyticsPeriod} downloadAnalyticsPdf={downloadAnalyticsPdf} exportingReport={exportingReport} emailAnalytics={emailAnalytics} analytics={analytics} changeLabel={changeLabel} />

          <div className="family-columns">
            {state.family.current_user_role === "owner" && <FamilyMembers state={state} roleLabel={roleLabel} submit={submit} setMessage={setMessage} inviteEmail={inviteEmail} setInviteEmail={setInviteEmail} />}

            <FamilySharedAccounts ownAccounts={ownAccounts} shareDraft={shareDraft} submit={submit} setMessage={setMessage} selectAccountForSharing={selectAccountForSharing} activeMembers={activeMembers} state={state} setShareDraft={setShareDraft} selectedSharedAccount={selectedSharedAccount} />

            {state.family.current_user_role === "owner" && <ExpenseImport pendingExpenses={pendingExpenses} pendingCategoryDrafts={pendingCategoryDrafts} setPendingCategoryDrafts={setPendingCategoryDrafts} pendingAccountDrafts={pendingAccountDrafts} setPendingAccountDrafts={setPendingAccountDrafts} pendingTotalsByAccount={pendingTotalsByAccount} submit={submit} setError={setError} setMessage={setMessage} />}

            {state.family.current_user_role === "owner" && <FamilySettlementForm submit={submit} settlement={settlement} setSettlement={setSettlement} setMessage={setMessage} selectSettlementRecipient={selectSettlementRecipient} activeMembers={activeMembers} state={state} currencyOptions={currencyOptions} />}
          </div>

          <section className="family-card">
            <h2>Общие покупки</h2>
            <div className="family-expenses">
              {(report?.expenses || []).map(item => (
                <article key={item.id}>
                  <div>
                    <strong>{item.description || item.category_name || "Общий расход"}</strong>
                    <span>
                      {item.paid_by_name} · {item.account_name || "личный счёт"} ·{" "}
                      {new Date(item.date).toLocaleDateString("ru-RU")}
                    </span>
                  </div>
                  <div>
                    <strong>{formatMoney(item.amount)} {item.currency}</strong>
                    {item.reimbursement_amount > 0 && (
                      <span>к возмещению {formatMoney(item.reimbursement_amount)} {item.currency}</span>
                    )}
                  </div>
                </article>
              ))}
              {!report?.expenses?.length && (
                <p>Отметьте расход как семейный при создании записи — он появится здесь.</p>
              )}
            </div>
          </section>
        </>
      )}

    </main>
  );
}
