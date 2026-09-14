import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatMoney } from "../../utils/money";
import { MONTH_NAMES } from "../../utils/planningView";
import { PlanningCalendar } from "./PlanningParts";

const sourceLabel = { planned: "Плановая операция", recurring: "Повторяющаяся операция", obligation: "Кредит или вклад" };
export default function PlanningOverview({ calendarEntries, calendarMonth, setCalendarMonth, selectedDate, setSelectedDate, accounts, categories, navigateSection }) {
  const [detail, setDetail] = useState(null);
  const dialog = useRef(null);
  useEffect(() => { if (detail) dialog.current?.showModal(); }, [detail]);
  const monthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}`;
  const monthEntries = calendarEntries.filter(item => item.date.startsWith(monthKey));
  const entries = selectedDate ? monthEntries.filter(item => item.date === selectedDate) : monthEntries;
  const totals = monthEntries.reduce((result, item) => {
    const total = result[item.currency] ||= { income: 0, expense: 0 };
    if (item.type === "income" || item.type === "expense") total[item.type] += Number(item.amount || 0);
    return result;
  }, {});
  const shift = offset => { setSelectedDate(null); setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1)); };
  return <>
    <section className="planning-summary" aria-label="План на выбранный месяц">{Object.entries(totals).map(([currency, values]) => <div className="planning-summary-card" key={currency}><strong>{currency} · план на месяц</strong><span>Доходы +{formatMoney(values.income)}</span><span>Расходы −{formatMoney(values.expense)}</span><b>Разница {formatMoney(values.income - values.expense)}</b></div>)}</section>
    <section className="planning-calendar-card"><div className="planning-calendar-head"><div><h2>Календарь операций</h2><p>Выберите день, чтобы увидеть названия и суммы. Нажмите на операцию для подробностей.</p></div><div className="planning-calendar-nav"><button type="button" className="btn-secondary" aria-label="Предыдущий месяц" onClick={() => shift(-1)}>‹</button><strong>{MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</strong><button type="button" className="btn-secondary" aria-label="Следующий месяц" onClick={() => shift(1)}>›</button></div></div>
      <PlanningCalendar month={calendarMonth} entries={monthEntries} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      <div className="planning-agenda-head"><h3>{selectedDate ? `Операции на ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString("ru-RU")}` : "Операции месяца"}</h3>{selectedDate && <button type="button" className="btn-ghost" onClick={() => setSelectedDate(null)}>Весь месяц</button>}</div>
      {entries.length === 0 ? <p>На {selectedDate ? "этот день" : "этот месяц"} операций нет.</p> : <div className="planning-agenda">{entries.map(item => <button type="button" className="planning-event" key={item.id} onClick={() => setDetail(item)}><time>{new Date(`${item.date}T12:00:00`).toLocaleDateString("ru-RU")}</time><span><strong>{item.title}</strong><small>{sourceLabel[item.source] || "Операция"}</small></span><b>{item.type === "income" ? "+" : "−"}{formatMoney(item.amount)} {item.currency}</b></button>)}</div>}
    </section>
    <dialog ref={dialog} className="planning-event-dialog" aria-labelledby="planning-event-title" onClose={() => setDetail(null)} onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      {detail && <><div className="planning-modal-head"><h2 id="planning-event-title">{detail.title}</h2><button type="button" className="btn-ghost" autoFocus onClick={() => dialog.current.close()}>Закрыть</button></div><dl><dt>Дата</dt><dd>{new Date(`${detail.date}T12:00:00`).toLocaleDateString("ru-RU")}</dd><dt>Сумма</dt><dd>{formatMoney(detail.amount)} {detail.currency}</dd><dt>Источник</dt><dd>{sourceLabel[detail.source]}</dd><dt>Счёт</dt><dd>{accounts.find(item => item.id === detail.account_id)?.name || "Не указан"}</dd><dt>Категория</dt><dd>{categories.find(item => item.id === detail.category_id)?.name || "Не указана"}</dd></dl>{detail.description && <p>{detail.description}</p>}
        {detail.source === "obligation" ? <Link to={detail.kind === "deposit" ? "/deposits" : "/credits"}>Открыть {detail.kind === "deposit" ? "вклады" : "кредиты"}</Link> : detail.source === "recurring" ? <button type="button" onClick={() => { dialog.current.close(); navigateSection("schedules"); }}>Управление расписаниями</button> : <p>Подтвердить выполнение можно в списке будущих операций под календарём.</p>}</>}
    </dialog>
  </>;
}
