import { isoDate, stepAnchor } from "../utils/reportPeriod";
import '../styles/report-controls.css';

export default function ReportPeriodControls({ gran, anchor, onGranChange, onAnchorChange }) {
  const value = gran === 'day' ? isoDate(anchor) : gran === 'month'
    ? `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`
    : String(anchor.getFullYear());
  const change = event => {
    const v = event.target.value;
    if (!v) return;
    if (gran === 'day') onAnchorChange(new Date(`${v}T00:00:00`));
    else if (gran === 'month') { const [y, m] = v.split('-'); onAnchorChange(new Date(+y, +m - 1, 1)); }
    else if (+v >= 2000 && +v <= 2200) onAnchorChange(new Date(+v, 0, 1));
  };
  return <div className="period-controls">
    <div className="period-controls__modes" aria-label="Период отчёта">
      {[['day', 'День'], ['month', 'Месяц'], ['year', 'Год']].map(([key, label]) =>
        <button key={key} type="button" aria-pressed={gran === key} onClick={() => onGranChange(key)}>{label}</button>)}
    </div>
    <div className="period-controls__date">
      <button type="button" className="btn-ghost" aria-label="Предыдущий период" onClick={() => onAnchorChange(stepAnchor(gran, anchor, -1))}>‹</button>
      <input aria-label="Дата отчёта" type={gran === 'day' ? 'date' : gran === 'month' ? 'month' : 'number'} min={gran === 'year' ? 2000 : undefined} max={gran === 'year' ? 2200 : undefined} value={value} onChange={change} />
      <button type="button" className="btn-ghost" aria-label="Следующий период" onClick={() => onAnchorChange(stepAnchor(gran, anchor, 1))}>›</button>
    </div>
    <button type="button" className="btn-ghost period-controls__today" onClick={() => onAnchorChange(new Date())}>Сегодня</button>
  </div>;
}
