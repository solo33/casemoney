import { formatMoney } from "../../utils/money";
import { MONTH_NAMES, FREQUENCY_LABELS } from "../../utils/planningView";

export function PlanningCalendar({ month, entries }) {
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

export function PlanningActionModal({ modal, setModal, onSaveTemplate, onSaveRecurring }) {
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

export function RecurringRunsModal({ data, onClose }) {
  const labels = { planned: "Добавлено в план", posted: "Проведено", skipped: "Пропущено" };
  return <div className="planning-modal-backdrop" onClick={onClose}><section className="planning-modal" onClick={event => event.stopPropagation()}><div className="planning-modal-head"><h2>История: {data.name}</h2><button type="button" className="btn-ghost" onClick={onClose}>×</button></div>{data.items.length === 0 ? <p className="empty-state">Запусков пока не было.</p> : <div className="recurring-runs">{data.items.map(item => <div key={item.id}><span>{new Date(`${item.scheduled_for}T12:00:00`).toLocaleDateString("ru-RU")}</span><strong>{labels[item.status] || item.status}</strong></div>)}</div>}</section></div>;
}
