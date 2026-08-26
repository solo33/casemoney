import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { formatMoney } from "../utils/money";

const today = () => new Date().toISOString().slice(0, 10);
const blankForm = () => ({ type: "expense", amount: "", currency: "RUB", account_id: "", category_id: "", description: "", date: today() });
const FREQUENCY_LABELS = { daily: "Ежедневно", weekly: "Еженедельно", biweekly: "Раз в 2 недели", monthly: "Ежемесячно", yearly: "Ежегодно", custom: "Свой интервал" };
const MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const isoDate = value => String(value || "").slice(0, 10);

export default function Planning() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarUrl, setCalendarUrl] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [form, setForm] = useState(blankForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recurringRuns, setRecurringRuns] = useState(null);

  const loadCalendarEvents = useCallback(async () => {
    const response = await api.get("/api/calendar/events", { params: { days: 730 } });
    setCalendarEvents(response.data || []);
  }, []);

  const load = useCallback(async () => {
    try {
      const [transactionsResponse, accountsResponse, categoriesResponse, templatesResponse, recurringResponse, calendarResponse, eventsResponse] = await Promise.all([
        api.get("/api/transactions/", { params: { is_planned: true, limit: 500 } }),
        api.get("/api/accounts/"), api.get("/api/categories/"), api.get("/api/transaction-templates/"),
        api.get("/api/recurring-transactions/"),
        api.get("/api/calendar/subscription"),
        api.get("/api/calendar/events", { params: { days: 730 } }),
      ]);
      setTransactions(transactionsResponse.data.items || []);
      setAccounts(accountsResponse.data || []);
      setCategories(categoriesResponse.data || []);
      setTemplates(templatesResponse.data || []);
      setRecurring(recurringResponse.data || []);
      setCalendarUrl(calendarResponse.data?.url || "");
      setCalendarEvents(eventsResponse.data || []);
      setForm(current => current.account_id ? current : { ...current, account_id: String(accountsResponse.data?.[0]?.id || "") });
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось загрузить планирование."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => transactions.reduce((result, transaction) => {
    const item = result[transaction.currency] || { income: 0, expense: 0 };
    item[transaction.type] = (item[transaction.type] || 0) + Number(transaction.amount);
    result[transaction.currency] = item;
    return result;
  }, {}), [transactions]);
  const currencies = useMemo(() => [...new Set(accounts.flatMap(account => (account.balances || []).map(balance => balance.currency)))].sort(), [accounts]);
  const calendarEntries = useMemo(() => calendarEvents.map(item => ({ ...item, date: isoDate(item.date) })), [calendarEvents]);
  const change = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const save = async event => {
    event.preventDefault();
    if (!form.amount || !form.account_id) return;
    setSaving(true);
    try {
      const response = await api.post("/api/transactions/", {
        type: form.type, amount: Number(form.amount), currency: form.currency,
        account_id: Number(form.account_id), category_id: form.category_id ? Number(form.category_id) : null,
        description: form.description || null, date: `${form.date}T12:00:00`, is_planned: true,
      });
      setTransactions(current => [response.data, ...current]);
      loadCalendarEvents().catch(() => {});
      setForm(current => ({ ...blankForm(), account_id: current.account_id, currency: current.currency }));
      setError("");
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось сохранить плановую запись."); }
    finally { setSaving(false); }
  };
  const makeActual = async transaction => {
    try {
      await api.patch(`/api/transactions/${transaction.id}`, { is_planned: false });
      setTransactions(current => current.filter(item => item.id !== transaction.id));
      loadCalendarEvents().catch(() => {});
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось учесть операцию."); }
  };
  const remove = async transaction => {
    if (!window.confirm(`Удалить плановую запись «${transaction.description || "без названия"}»?`)) return;
    try { await api.delete(`/api/transactions/${transaction.id}`); setTransactions(current => current.filter(item => item.id !== transaction.id)); loadCalendarEvents().catch(() => {}); }
    catch { setError("Не удалось удалить плановую запись."); }
  };
  const [modal, setModal] = useState(null); // { mode: "template" | "recurring" }
  const defaultName = () => form.description || (form.type === "income" ? "Регулярный доход" : "Регулярный расход");

  const openTemplateModal = () => {
    if (!form.amount || !form.account_id) { setError("Сначала заполните операцию, которую нужно сохранить как шаблон."); return; }
    setError("");
    setModal({ mode: "template", name: defaultName() });
  };
  const submitTemplate = async name => {
    try {
      const response = await api.post("/api/transaction-templates/", { ...form, name, amount: Number(form.amount), account_id: Number(form.account_id), category_id: form.category_id ? Number(form.category_id) : null });
      setTemplates(current => [...current, response.data].sort((a, b) => a.name.localeCompare(b.name, "ru")));
      setModal(null);
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось сохранить шаблон."); }
  };
  const applyTemplate = template => setForm({ type: template.type, amount: String(template.amount), currency: template.currency, account_id: String(template.account_id || ""), category_id: String(template.category_id || ""), description: template.description || "", date: today() });
  const removeTemplate = async template => {
    if (!window.confirm(`Удалить шаблон «${template.name}»?`)) return;
    try { await api.delete(`/api/transaction-templates/${template.id}`); setTemplates(current => current.filter(item => item.id !== template.id)); }
    catch { setError("Не удалось удалить шаблон."); }
  };
  const openRecurringModal = () => {
    if (!form.amount || !form.account_id) { setError("Сначала заполните операцию, которую нужно повторять."); return; }
    setError("");
    setModal({ mode: "recurring", name: defaultName(), frequency: "monthly", next_date: form.date, custom_interval_days: 30, execution_mode: "planned", reminder_days: 0, end_date: "" });
  };
  const submitRecurring = async ({ name, frequency, next_date, custom_interval_days, execution_mode, reminder_days, end_date }) => {
    try {
      const response = await api.post("/api/recurring-transactions/", {
        name, type: form.type, amount: Number(form.amount), currency: form.currency,
        account_id: Number(form.account_id), category_id: form.category_id ? Number(form.category_id) : null,
        description: form.description || null, frequency, next_date,
        custom_interval_days: frequency === "custom" ? Number(custom_interval_days) : null,
        execution_mode, reminder_days: Number(reminder_days || 0), end_date: end_date || null,
      });
      setRecurring(current => [...current, response.data].sort((a, b) => String(a.next_date).localeCompare(String(b.next_date))));
      loadCalendarEvents().catch(() => {});
      setModal(null);
      setError("");
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось создать регулярную операцию."); }
  };
  const toggleRecurring = async item => {
    try {
      const response = await api.patch(`/api/recurring-transactions/${item.id}`, { is_active: !item.is_active });
      setRecurring(current => current.map(entry => entry.id === item.id ? response.data : entry));
      loadCalendarEvents().catch(() => {});
    } catch { setError("Не удалось изменить регулярную операцию."); }
  };
  const removeRecurring = async item => {
    if (!window.confirm(`Удалить регулярную операцию «${item.name}»? Уже созданные плановые записи останутся.`)) return;
    try { await api.delete(`/api/recurring-transactions/${item.id}`); setRecurring(current => current.filter(entry => entry.id !== item.id)); loadCalendarEvents().catch(() => {}); }
    catch { setError("Не удалось удалить регулярную операцию."); }
  };
  const skipRecurring = async item => {
    if (!window.confirm(`Пропустить ближайшее повторение «${item.name}»?`)) return;
    try {
      const response = await api.post(`/api/recurring-transactions/${item.id}/skip`);
      setRecurring(current => current.map(entry => entry.id === item.id ? response.data : entry));
      loadCalendarEvents().catch(() => {});
    } catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось пропустить повторение."); }
  };
  const finishRecurring = async item => {
    if (!window.confirm(`Завершить «${item.name}»? Новых повторений больше не будет.`)) return;
    try {
      const response = await api.post(`/api/recurring-transactions/${item.id}/finish`);
      setRecurring(current => current.map(entry => entry.id === item.id ? response.data : entry));
      loadCalendarEvents().catch(() => {});
    } catch { setError("Не удалось завершить регулярную операцию."); }
  };
  const showRecurringRuns = async item => {
    try { const response = await api.get(`/api/recurring-transactions/${item.id}/runs`); setRecurringRuns({ name: item.name, items: response.data || [] }); }
    catch { setError("Не удалось загрузить историю повторений."); }
  };
  const rotateCalendarLink = async () => {
    if (!window.confirm("Старая ссылка перестанет работать. Выпустить новую ссылку календаря?")) return;
    try { const response = await api.post("/api/calendar/subscription/rotate"); setCalendarUrl(response.data?.url || ""); setError(""); }
    catch (requestError) { setError(requestError.response?.data?.detail || "Не удалось обновить ссылку календаря."); }
  };
  const copyCalendarLink = async () => {
    try { await navigator.clipboard.writeText(calendarUrl); setError("Ссылка календаря скопирована."); }
    catch { setError("Не удалось скопировать ссылку. Скопируйте её вручную."); }
  };

  if (loading) return <div className="page">Загружаем планирование…</div>;
  return <main className="page planning-page">
    <header className="page-heading"><div><h1>Расписание</h1><p>Будущие доходы и расходы не меняют остатки счетов, пока вы не отметите их как выполненные.</p></div></header>
    {error && <div className="form-error">{error}</div>}
    <section className="planning-summary">
      {Object.keys(summary).length === 0 ? <p>На будущее пока ничего не запланировано.</p> : Object.entries(summary).map(([currency, values]) => <div className="planning-summary-card" key={currency}><strong>{currency}</strong><span className="income">+{formatMoney(values.income)}</span><span className="expense">−{formatMoney(values.expense)}</span><b>{formatMoney(values.income - values.expense)}</b></div>)}
    </section>
    <section className="planning-calendar-card">
      <div className="planning-calendar-head"><div><h2>Календарь операций</h2><p>Плановые и повторяющиеся операции, ближайшие платежи и поступления. Подпишите Google или Яндекс Календарь на личную ссылку ниже.</p></div><div className="planning-calendar-nav"><button type="button" className="btn-secondary" aria-label="Предыдущий месяц" onClick={() => setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</button><strong>{MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</strong><button type="button" className="btn-secondary" aria-label="Следующий месяц" onClick={() => setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</button></div></div>
      <PlanningCalendar month={calendarMonth} entries={calendarEntries} />
      <div className="planning-calendar-feed"><div><strong>Личная ссылка iCalendar</strong><span>Не передавайте её другим: по ней видны названия и суммы плановых операций.</span></div><input readOnly value={calendarUrl} aria-label="Ссылка календаря" /><button type="button" className="btn-secondary" onClick={copyCalendarLink}>Копировать</button><button type="button" className="btn-ghost" onClick={rotateCalendarLink}>Обновить ссылку</button></div>
    </section>
    <section className="planning-create-card"><h2>Запланировать операцию</h2><form className="planning-form" onSubmit={save}>
      <select value={form.type} onChange={event => change("type", event.target.value)}><option value="expense">Расход</option><option value="income">Доход</option></select>
      <input required inputMode="decimal" value={form.amount} placeholder="Сумма" onChange={event => change("amount", event.target.value)} />
      <select value={form.currency} onChange={event => change("currency", event.target.value)}>{currencies.map(currency => <option key={currency}>{currency}</option>)}</select>
      <select required value={form.account_id} onChange={event => change("account_id", event.target.value)}><option value="">Счёт</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
      <select value={form.category_id} onChange={event => change("category_id", event.target.value)}><option value="">Без категории</option>{categories.map(category => <option key={category.id} value={category.id}>{category.parent_id ? "↳ " : ""}{category.name}</option>)}</select>
      <input type="date" required value={form.date} onChange={event => change("date", event.target.value)} />
      <input className="planning-description" value={form.description} placeholder="Комментарий" onChange={event => change("description", event.target.value)} />
      <button type="button" className="btn-secondary" onClick={openTemplateModal}>В шаблоны</button><button type="button" className="btn-secondary" onClick={openRecurringModal}>Повторять</button><button type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Запланировать"}</button>
    </form></section>
    <section className="planning-templates-card"><h2>Шаблоны операций</h2><p>Сохраните регулярный платёж один раз, затем подставляйте его в план за один клик.</p>{templates.length === 0 ? <span className="empty-state">Шаблонов пока нет.</span> : <div className="planning-templates">{templates.map(template => <div key={template.id}><button type="button" onClick={() => applyTemplate(template)}><strong>{template.name}</strong><span>{template.type === "income" ? "Доход" : "Расход"} · {formatMoney(template.amount)} {template.currency}</span></button><button className="btn-ghost danger" type="button" onClick={() => removeTemplate(template)}>×</button></div>)}</div>}</section>
    <section className="planning-templates-card"><h2>Повторяющиеся операции</h2><p>Для каждого расписания можно создать черновик в плане или проводить его автоматически. Напоминание приходит заранее в центр уведомлений, а при включённом канале — и на email.</p>{recurring.length === 0 ? <span className="empty-state">Повторяющихся операций пока нет.</span> : <div className="recurring-list">{recurring.map(item => <div className={!item.is_active ? "is-inactive" : ""} key={item.id}><div><strong>{item.name}</strong><span>{FREQUENCY_LABELS[item.frequency] || item.frequency}{item.frequency === "custom" ? ` · каждые ${item.custom_interval_days} дн.` : ""} · {new Date(`${item.next_date}T12:00:00`).toLocaleDateString("ru-RU")} · {formatMoney(item.amount)} {item.currency}</span><span>{item.execution_mode === "automatic" ? "Проводится автоматически" : "Попадает в план"}{item.reminder_days ? ` · напомнить за ${item.reminder_days} дн.` : ""}</span></div><div className="planning-actions"><button className="btn-secondary" type="button" onClick={() => showRecurringRuns(item)}>История</button>{item.is_active && <button className="btn-secondary" type="button" onClick={() => skipRecurring(item)}>Пропустить</button>}<button className="btn-secondary" type="button" onClick={() => toggleRecurring(item)}>{item.is_active ? "Пауза" : "Включить"}</button>{item.is_active && <button className="btn-ghost" type="button" onClick={() => finishRecurring(item)}>Завершить</button>}<button className="btn-ghost danger" type="button" onClick={() => removeRecurring(item)}>Удалить</button></div></div>)}</div>}</section>
    <section className="planning-list-card"><h2>Будущие операции ({transactions.length})</h2>
      {transactions.length === 0 ? <p className="empty-state">Добавьте предстоящий платёж, доход или напоминание о расходе.</p> : transactions.map(transaction => <article className="planning-row" key={transaction.id}>
        <time>{new Date(transaction.date).toLocaleDateString("ru-RU")}</time><div><strong>{transaction.description || (transaction.type === "income" ? "Плановый доход" : "Плановый расход")}</strong><span>{transaction.type === "income" ? "Доход" : "Расход"}</span></div><b className={transaction.type === "income" ? "income" : "expense"}>{transaction.type === "income" ? "+" : "−"}{formatMoney(transaction.amount)} {transaction.currency}</b><div className="planning-actions"><button className="btn-secondary" type="button" onClick={() => makeActual(transaction)}>Учесть</button><button className="btn-ghost danger" type="button" onClick={() => remove(transaction)}>Удалить</button></div>
      </article>)}
    </section>
    {modal && <PlanningActionModal modal={modal} setModal={setModal} onSaveTemplate={submitTemplate} onSaveRecurring={submitRecurring} />}
    {recurringRuns && <RecurringRunsModal data={recurringRuns} onClose={() => setRecurringRuns(null)} />}
  </main>;
}

function PlanningCalendar({ month, entries }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, index) => index - offset + 1);
  const byDate = entries.reduce((result, item) => { (result[item.date] ||= []).push(item); return result; }, {});
  return <div className="planning-calendar" role="grid" aria-label={`Календарь ${MONTH_NAMES[monthIndex]} ${year}`}>
    {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(day => <div className="planning-calendar-weekday" key={day}>{day}</div>)}
    {cells.map((day, index) => {
      if (day < 1 || day > daysInMonth) return <div className="planning-calendar-day is-empty" key={`empty-${index}`} />;
      const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const items = byDate[key] || [];
      return <div className="planning-calendar-day" key={key}><strong>{day}</strong>{items.slice(0, 3).map((item, itemIndex) => <span className={item.type === "income" ? "income" : "expense"} title={`${item.title}: ${formatMoney(item.amount)} ${item.currency}`} key={`${item.title}-${itemIndex}`}>{item.recurring ? "↻ " : ""}{item.title}</span>)}{items.length > 3 && <small>ещё {items.length - 3}</small>}</div>;
    })}
  </div>;
}

function PlanningActionModal({ modal, setModal, onSaveTemplate, onSaveRecurring }) {
  const isRecurring = modal.mode === "recurring";
  const submit = event => {
    event.preventDefault();
    const name = modal.name.trim();
    if (!name) return;
    if (isRecurring) onSaveRecurring({ name, frequency: modal.frequency, next_date: modal.next_date });
    else onSaveTemplate(name);
  };
  return <div className="planning-modal-backdrop" onClick={() => setModal(null)}>
    <section className="planning-modal" onClick={event => event.stopPropagation()}>
      <div className="planning-modal-head"><h2>{isRecurring ? "Повторяющаяся операция" : "Сохранить как шаблон"}</h2><button type="button" className="btn-ghost" onClick={() => setModal(null)}>×</button></div>
      <form onSubmit={submit} className="planning-modal-form">
        <label><span>Название</span><input autoFocus required value={modal.name} onChange={event => setModal({ ...modal, name: event.target.value })} /></label>
        {isRecurring && <>
          <label><span>Периодичность</span>
            <select value={modal.frequency} onChange={event => setModal({ ...modal, frequency: event.target.value })}>
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {modal.frequency === "custom" && <label><span>Интервал, дней</span><input required type="number" min="1" max="365" value={modal.custom_interval_days || 30} onChange={event => setModal({ ...modal, custom_interval_days: event.target.value })} /></label>}
          <label><span>Первое повторение</span><input type="date" required value={modal.next_date} onChange={event => setModal({ ...modal, next_date: event.target.value })} /></label>
          <label><span>Как выполнять</span><select value={modal.execution_mode || "planned"} onChange={event => setModal({ ...modal, execution_mode: event.target.value })}><option value="planned">Добавлять в план для подтверждения</option><option value="automatic">Проводить автоматически</option></select></label>
          <label><span>Напомнить заранее, дней</span><input type="number" min="0" max="90" value={modal.reminder_days || 0} onChange={event => setModal({ ...modal, reminder_days: event.target.value })} /></label>
          <label><span>Закончить после даты (необязательно)</span><input type="date" min={modal.next_date} value={modal.end_date || ""} onChange={event => setModal({ ...modal, end_date: event.target.value })} /></label>
        </>}
        <div className="planning-modal-actions">
          <button type="submit">Сохранить</button>
          <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Отмена</button>
        </div>
      </form>
    </section>
  </div>;
}

function RecurringRunsModal({ data, onClose }) {
  const labels = { planned: "Добавлено в план", posted: "Проведено", skipped: "Пропущено" };
  return <div className="planning-modal-backdrop" onClick={onClose}><section className="planning-modal" onClick={event => event.stopPropagation()}><div className="planning-modal-head"><h2>История: {data.name}</h2><button type="button" className="btn-ghost" onClick={onClose}>×</button></div>{data.items.length === 0 ? <p className="empty-state">Запусков пока не было.</p> : <div className="recurring-runs">{data.items.map(item => <div key={item.id}><span>{new Date(`${item.scheduled_for}T12:00:00`).toLocaleDateString("ru-RU")}</span><strong>{labels[item.status] || item.status}</strong></div>)}</div>}</section></div>;
}
