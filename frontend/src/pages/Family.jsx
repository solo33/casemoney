import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import SettingsTabs from "../components/SettingsTabs";
import { formatMoney } from "../utils/money";


export default function Family() {
  const now = new Date();
  const [state, setState] = useState({ family: null, pending_invitations: [] });
  const [report, setReport] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [familyName, setFamilyName] = useState("Наша семья");
  const [inviteEmail, setInviteEmail] = useState("");
  const [settlement, setSettlement] = useState({
    to_user_id: "",
    amount: "",
    currency: "RUB",
    description: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const familyResponse = await api.get("/api/family/");
      setState(familyResponse.data);
      if (familyResponse.data.family) {
        const [reportResponse, analyticsResponse] = await Promise.all([
          api.get("/api/family/report"),
          api.get("/api/family/analytics", { params: analyticsPeriod }),
        ]);
        setReport(reportResponse.data);
        setAnalytics(analyticsResponse.data);
      } else {
        setReport(null);
        setAnalytics(null);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось загрузить семейные финансы");
    } finally {
      setLoading(false);
    }
  }, [analyticsPeriod, setAnalytics, setError, setLoading, setReport, setState]);

  useEffect(() => { load(); }, [load]);

  const submit = async (action) => {
    setError("");
    setMessage("");
    try {
      await action();
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось сохранить изменения");
    }
  };

  const activeMembers = state.family?.members?.filter(member => member.status === "active") || [];
  const currencyOptions = useMemo(() => {
    const values = new Set(["RUB"]);
    report?.outstanding?.forEach(item => values.add(item.currency));
    return [...values];
  }, [report]);

  const changeLabel = (change) => {
    if (!change) return "—";
    const sign = change.amount > 0 ? "+" : "";
    const percent = change.percent === null ? "нет базы для сравнения" : `${sign}${change.percent}%`;
    return `${sign}${formatMoney(change.amount)} · ${percent}`;
  };

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
              {state.family.current_user_role === "owner" ? "Владелец" : "Участник"}
            </span>
          </div>

          <div className="family-summary-grid">
            {(report?.totals || []).map(item => (
              <article className="family-stat" key={item.currency}>
                <span>Общие расходы</span>
                <strong>{formatMoney(item.amount)} {item.currency}</strong>
              </article>
            ))}
            {(report?.outstanding || []).map(item => (
              <article className="family-stat family-stat-accent" key={`${item.user_id}-${item.currency}`}>
                <span>К возмещению: {item.name}</span>
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

          <section className="family-card family-analytics">
            <div className="family-analytics-heading">
              <div>
                <p className="family-eyebrow">Family</p>
                <h2>Семейный отчёт</h2>
              </div>
              <input
                type="month"
                value={`${analyticsPeriod.year}-${String(analyticsPeriod.month).padStart(2, "0")}`}
                onChange={event => {
                  const [year, month] = event.target.value.split("-").map(Number);
                  if (year && month) setAnalyticsPeriod({ year, month });
                }}
                aria-label="Месяц семейного отчёта"
              />
            </div>
            <div className="family-analytics-stats family-analytics-stats-four">
              <article><span>Доходы</span><strong>{formatMoney(analytics?.income_total || 0)} {analytics?.currency || "RUB"}</strong></article>
              <article><span>Расходы</span><strong>{formatMoney(analytics?.expense_total || 0)} {analytics?.currency || "RUB"}</strong></article>
              <article className={analytics?.net_total < 0 ? "family-stat-negative" : "family-stat-accent"}><span>Результат</span><strong>{formatMoney(analytics?.net_total || 0)} {analytics?.currency || "RUB"}</strong></article>
              <article><span>Запланировано</span><strong>{formatMoney(analytics?.planned_total || 0)} {analytics?.currency || "RUB"}</strong></article>
            </div>
            <div className="family-analytics-columns">
              <div>
                <h3>Вклад участников</h3>
                {(analytics?.members || []).map(item => <div className="family-analytics-row" key={item.user_id}><span>{item.name}</span><strong>{formatMoney(item.actual)} {analytics.currency}</strong></div>)}
              </div>
              <div>
                <h3>Категории общих расходов</h3>
                {(analytics?.categories || []).slice(0, 5).map(item => <div className="family-analytics-row" key={item.name}><span>{item.name}</span><strong>{formatMoney(item.actual)} {analytics.currency}</strong></div>)}
                {!analytics?.categories?.length && <p className="family-analytics-empty">В этом периоде пока нет общих расходов.</p>}
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
            {analytics?.skipped_currencies?.length > 0 && <p className="family-analytics-note">Не удалось пересчитать: {analytics.skipped_currencies.join(", ")}. Используйте доступный курс в настройках валют.</p>}
          </section>

          <div className="family-columns">
            <section className="family-card">
              <h2>Участники</h2>
              <div className="family-members">
                {state.family.members.map(member => {
                  const isSelf = member.user_id === state.family.current_user_id;
                  const isOwner = state.family.current_user_role === "owner";
                  const canRemove = member.role !== "owner" && (isOwner || isSelf);
                  return (
                    <div key={member.id}>
                      <span>
                        <strong>{member.name}</strong>
                        <small>{member.email}</small>
                      </span>
                      <span className="family-member-actions">
                        {member.status === "active" ? "Подключён" : "Приглашён"}
                        {canRemove && (
                          <button
                            type="button"
                            className="family-member-remove"
                            onClick={() => {
                              const confirmMsg = isSelf
                                ? "Выйти из семейного пространства?"
                                : member.status === "active"
                                  ? `Убрать «${member.name}» из семьи?`
                                  : `Отменить приглашение для ${member.email}?`;
                              if (!window.confirm(confirmMsg)) return;
                              submit(async () => {
                                await api.delete(`/api/family/members/${member.id}`);
                                setMessage(isSelf ? "Вы вышли из семьи" : "Участник удалён");
                              });
                            }}
                          >
                            {isSelf ? "Выйти" : "Удалить"}
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              {state.family.current_user_role === "owner" && (
                <form onSubmit={event => {
                  event.preventDefault();
                  submit(async () => {
                    await api.post("/api/family/invite", { email: inviteEmail });
                    setInviteEmail("");
                    setMessage("Приглашение создано");
                  });
                }}>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={event => setInviteEmail(event.target.value)}
                    placeholder="Email участника"
                    required
                  />
                  <button type="submit">Пригласить</button>
                </form>
              )}
            </section>

            <section className="family-card">
              <h2>Зафиксировать возмещение</h2>
              <p>Запись уменьшит долг, но не повлияет повторно на семейные расходы.</p>
              <form onSubmit={event => {
                event.preventDefault();
                submit(async () => {
                  await api.post("/api/family/settlements", {
                    ...settlement,
                    to_user_id: Number(settlement.to_user_id),
                    amount: Number(settlement.amount),
                  });
                  setSettlement(current => ({ ...current, amount: "", description: "" }));
                  setMessage("Возмещение учтено");
                });
              }}>
                <select
                  value={settlement.to_user_id}
                  onChange={event => setSettlement({ ...settlement, to_user_id: event.target.value })}
                  required
                >
                  <option value="">Кому возместили</option>
                  {activeMembers
                    .filter(member => member.user_id !== state.family.current_user_id)
                    .map(member => (
                    <option key={member.id} value={member.user_id}>{member.name}</option>
                  ))}
                </select>
                <div className="family-amount">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={settlement.amount}
                    onChange={event => setSettlement({ ...settlement, amount: event.target.value })}
                    placeholder="Сумма"
                    required
                  />
                  <select
                    value={settlement.currency}
                    onChange={event => setSettlement({ ...settlement, currency: event.target.value })}
                  >
                    {currencyOptions.map(currency => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </div>
                <input
                  value={settlement.description}
                  onChange={event => setSettlement({ ...settlement, description: event.target.value })}
                  placeholder="Комментарий"
                />
                <button type="submit">Учесть возмещение</button>
              </form>
            </section>
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

      <style>{`
        .family-page { max-width: 1120px; }
        .family-intro, .family-card, .family-heading, .family-stat {
          background: #fffdf7; border: 1px solid #e4ddcd; border-radius: 12px;
        }
        .family-intro { padding: 16px 18px; margin-bottom: 18px; }
        .family-intro p, .family-card p { color: #6f7b86; margin: 6px 0 0; }
        .family-error, .family-success { padding: 12px 14px; border-radius: 8px; margin: 12px 0; }
        .family-error { color: #a83220; background: #fff0ec; }
        .family-success { color: #12683e; background: #edf8f1; }
        .family-heading { padding: 16px 18px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .family-heading span { color: #7a8590; font-size: 12px; }
        .family-heading h2 { margin: 3px 0 0; }
        .family-role { background: #f1eadb; color: #173a54 !important; padding: 6px 10px; border-radius: 999px; font-weight: 700; }
        .family-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 14px; }
        .family-stat { padding: 15px 17px; display: grid; gap: 5px; }
        .family-stat span { color: #7a8590; font-size: 12px; }
        .family-stat strong { color: #173a54; font-size: 21px; }
        .family-stat-accent { border-color: #d8b96f; background: #fff9e9; }
        .family-stat-negative { border-color: #e8b4a7; background: #fff3ef; }
        .family-analytics-heading { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
        .family-eyebrow { color: #9c6f1d !important; text-transform: uppercase; letter-spacing: .08em; font-size: 11px; font-weight: 800; margin: 0 0 4px !important; }
        .family-analytics-heading input { width: auto; }
        .family-analytics-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .family-analytics-stats-four { grid-template-columns: repeat(4, 1fr); }
        .family-analytics-stats article { border: 1px solid #e4ddcd; border-radius: 9px; padding: 12px; display: grid; gap: 4px; }
        .family-analytics-stats span { color: #7a8590; font-size: 12px; }
        .family-analytics-stats strong { color: #173a54; font-size: 18px; }
        .family-analytics-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 18px; }
        .family-analytics-details { padding-top: 4px; border-top: 1px solid #eee8dc; }
        .family-analytics-columns h3 { font-size: 14px; margin: 0 0 7px; color: #173a54; }
        .family-analytics-row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid #eee8dc; color: #596572; font-size: 13px; }
        .family-analytics-row strong { color: #173a54; white-space: nowrap; text-align: right; }
        .family-analytics-row small { display: block; color: #7a8590; margin-top: 2px; }
        .family-analytics-empty, .family-analytics-note { color: #7a8590 !important; font-size: 13px; }
        .family-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .family-card { padding: 18px; margin-bottom: 14px; }
        .family-card h2 { margin: 0 0 10px; font-size: 19px; }
        .family-card form { display: grid; gap: 9px; margin-top: 15px; }
        .family-card form button { justify-self: start; }
        .family-members > div, .family-expenses article {
          display: flex; justify-content: space-between; align-items: center; gap: 15px; padding: 11px 0; border-bottom: 1px solid #eee8dc;
        }
        .family-members span:first-child, .family-expenses article > div { display: grid; gap: 3px; min-width: 0; }
        .family-members span:first-child strong, .family-members span:first-child small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .family-members small, .family-expenses span { color: #7a8590; font-size: 12px; }
        .family-member-actions { display: flex !important; align-items: center; gap: 10px; color: #7a8590; font-size: 13px; flex-shrink: 0; }
        .family-member-remove {
          background: transparent; border: 1px solid #e4ddcd; color: #a83220;
          padding: 4px 10px; font-size: 12px; border-radius: 7px; cursor: pointer; flex-shrink: 0; white-space: nowrap;
        }
        .family-member-remove:hover { background: #fff0ec; border-color: #e2a99a; }
        .family-amount { display: grid; grid-template-columns: 1fr 100px; gap: 8px; }
        .family-expenses article > div:last-child { text-align: right; }
        @media (max-width: 720px) {
          .family-columns { grid-template-columns: 1fr; }
          .family-analytics-stats, .family-analytics-stats-four, .family-analytics-columns { grid-template-columns: 1fr; }
          .family-analytics-heading { align-items: stretch; flex-direction: column; }
          .family-analytics-heading input { width: 100%; }
          .family-expenses article { align-items: flex-start; }
          .family-heading { align-items: flex-start; }
        }
      `}</style>
    </main>
  );
}
