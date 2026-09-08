import { formatMoney } from "../../utils/money";
import { periodForCell, MONTHS } from "../../utils/annualReportView";

export function MobileAnnualFlow({ data, month, onMonthChange, incomeRows, expenseRows, sym, year, navigate }) {
  const valueFor = row => month === null ? row.total : (row.monthly[month] || 0);
  const totalFor = values => month === null ? values.reduce((sum, value) => sum + value, 0) : (values[month] || 0);
  const go = (type, categoryId) => {
    const p = periodForCell(year, month);
    const params = new URLSearchParams({ type, date_from: p.from, date_to: p.to });
    if (categoryId != null) params.set("category_id", String(categoryId));
    navigate(`/transactions?${params}`);
  };
  const renderRows = (rows, type, color) => rows
    .filter(row => Math.abs(valueFor(row)) > .005)
    .map(row => (
      <button key={`${type}-${row.category_id}-${row.parent_id}`} type="button" className="mobile-report-row" onClick={() => go(type, row.category_id)}>
        <span style={{ paddingLeft: row.parent_id ? 14 : 0 }}>{row.parent_id ? "↳ " : ""}{row.category_name}</span>
        <strong style={{ color }}>{formatMoney(valueFor(row), { maxFraction: 0 })} {sym}</strong>
      </button>
    ));
  return (
    <div className="annual-mobile-view">
      <label className="mobile-period-select">Период
        <select value={month ?? 'year'} onChange={e => onMonthChange(e.target.value === 'year' ? null : Number(e.target.value))}>
          <option value="year">Весь {year} год</option>
          {MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}
        </select>
      </label>
      <div className="mobile-report-totals">
        <div><small>Доходы</small><strong style={{ color: "#0f6a40" }}>{formatMoney(totalFor(data.income_totals), { maxFraction: 0 })} {sym}</strong></div>
        <div><small>Расходы</small><strong style={{ color: "#a93421" }}>{formatMoney(totalFor(data.expense_totals), { maxFraction: 0 })} {sym}</strong></div>
        <div><small>Сальдо</small><strong>{formatMoney(totalFor(data.net_monthly), { maxFraction: 0 })} {sym}</strong></div>
      </div>
      <section className="mobile-report-section"><h3>Доходы</h3>{renderRows(incomeRows, "income", "#0f6a40")}</section>
      <section className="mobile-report-section"><h3>Расходы</h3>{renderRows(expenseRows, "expense", "#a93421")}</section>
    </div>
  );
}

export function Th({ children, align = "left", style = {} }) {
  return (
    <th style={{
      padding: "8px 10px", textAlign: align,
      fontSize: 11, fontWeight: 600,
      textTransform: "uppercase", letterSpacing: 0.4,
      whiteSpace: "nowrap",
      ...style,
    }}>
      {children}
    </th>
  );
}

export function SectionHeader({ title, onAll, cols = 12 }) {
  return (
    <tr style={{ background: "#e4ddcd" }}>
      <td colSpan={cols + 1} style={{
        padding: "10px 12px",
        fontFamily: "var(--serif)",
        fontSize: 18, fontWeight: 500, color: "#1b2531",
        letterSpacing: -0.01,
      }}>
        {title}
      </td>
      <td style={{ padding: "10px 12px", textAlign: "right" }}>
        {onAll && (
          <button
            type="button" onClick={onAll}
            className="btn-ghost"
            style={{ fontSize: 11, padding: "2px 8px" }}
            title="Все транзакции этого типа за год"
          >
            все →
          </button>
        )}
      </td>
    </tr>
  );
}

export function RowLine({ row, sym, accent, onCellClick, months }) {
  const cols = months || row.monthly.map((_, i) => i);
  const isChild = !!row.parent_id;
  const cellStyle = (active) => ({
      padding: "8px 10px",
    textAlign: "right",
    color: active ? accent : "#c7cdd3",
    fontWeight: 400,
    fontVariantNumeric: "tabular-nums",
    cursor: active && onCellClick ? "pointer" : "default",
  });
  const handleMonthClick = (i, v) => {
    if (Math.abs(v) > 0.005 && onCellClick) onCellClick(i);
  };
  const handleTotalClick = () => {
    if (Math.abs(row.total) > 0.005 && onCellClick) onCellClick(null);
  };
  return (
    <tr style={{
      borderTop: "1px solid #efe9db",
      borderBottom: "1px solid #f6f2e9",
      background: isChild ? "#fafaf9" : "#fff",
    }}>
      <td
        style={{
          padding: "8px 12px",
          paddingLeft: isChild ? 36 : 12,
          fontWeight: row.is_parent ? 600 : 400,
          color: isChild ? "#515c68" : "#1b2531",
          fontSize: isChild ? 12.5 : 13,
          cursor: Math.abs(row.total) > 0.005 && onCellClick ? "pointer" : "default",
        }}
        onClick={handleTotalClick}
        title={Math.abs(row.total) > 0.005 ? "Показать транзакции этой категории за год" : ""}
      >
        {row.category_name}
      </td>
      {cols.map((i) => {
        const v = row.monthly[i];
        const active = Math.abs(v) > 0.005;
        return (
          <td
            key={i}
            style={cellStyle(active)}
            onClick={() => handleMonthClick(i, v)}
            title={active ? `Транзакции за ${MONTHS[i]}` : ""}
          >
            {active ? formatMoney(v, { maxFraction: 0 }) : ""}
          </td>
        );
      })}
      <td
        onClick={handleTotalClick}
        style={{
          padding: "6px 10px",
          textAlign: "right",
          color: accent,
          fontWeight: row.is_parent ? 600 : 500,
          fontVariantNumeric: "tabular-nums",
          cursor: Math.abs(row.total) > 0.005 && onCellClick ? "pointer" : "default",
        }}
      >
        {Math.abs(row.total) > 0.005 ? `${formatMoney(row.total, { maxFraction: 0 })} ${sym}` : ""}
      </td>
    </tr>
  );
}

export function SubtotalRow({ label, monthly, total, sym, color, onCellClick, months }) {
  const cols = months || monthly.map((_, i) => i);
  return (
    <tr style={{ background: "#efe9db", borderTop: "2px solid #c7cdd3" }}>
      <td
        style={{
          padding: "8px 12px", fontWeight: 700, color: "#1b2531",
          cursor: onCellClick ? "pointer" : "default",
        }}
        onClick={() => onCellClick?.(null)}
      >
        {label}
      </td>
      {cols.map((i) => {
        const v = monthly[i];
        const active = Math.abs(v) > 0.005;
        return (
          <td
            key={i}
            style={{
              padding: "8px 10px", textAlign: "right",
              fontWeight: 600, color: active ? color : "#a6afb8",
              fontVariantNumeric: "tabular-nums",
              cursor: active && onCellClick ? "pointer" : "default",
            }}
            onClick={() => { if (active && onCellClick) onCellClick(i); }}
          >
            {active ? formatMoney(v, { maxFraction: 0 }) : ""}
          </td>
        );
      })}
      <td
        style={{
          padding: "8px 10px", textAlign: "right",
          fontWeight: 700, color,
          fontVariantNumeric: "tabular-nums",
          cursor: onCellClick ? "pointer" : "default",
        }}
        onClick={() => onCellClick?.(null)}
      >
        {Math.abs(total) > 0.005 ? `${formatMoney(total, { maxFraction: 0 })} ${sym}` : ""}
      </td>
    </tr>
  );
}

export function NetRow({ label, monthly, total, sym, onCellClick, months }) {
  const cols = months || monthly.map((_, i) => i);
  const overallColor = total >= 0 ? "#78e0a5" : "#ff9b8a";
  return (
    <tr style={{ background: "#173a54" }}>
      <td
        style={{
          padding: "10px 12px", fontWeight: 700, color: "#fff",
          cursor: onCellClick ? "pointer" : "default",
        }}
        onClick={() => onCellClick?.(null)}
      >
        {label}
      </td>
      {cols.map((i) => {
        const v = monthly[i];
        const color = Math.abs(v) < 0.005 ? "#b7c5cf" : (v >= 0 ? "#78e0a5" : "#ff9b8a");
        const active = Math.abs(v) > 0.005;
        return (
          <td
            key={i}
            style={{
              padding: "10px 10px", textAlign: "right",
              fontWeight: 600, color,
              fontVariantNumeric: "tabular-nums",
              cursor: active && onCellClick ? "pointer" : "default",
            }}
            onClick={() => { if (active && onCellClick) onCellClick(i); }}
          >
            {active ? `${v >= 0 ? "" : "−"}${formatMoney(Math.abs(v), { maxFraction: 0 })}` : ""}
          </td>
        );
      })}
      <td
        style={{
          padding: "10px 10px", textAlign: "right",
          fontWeight: 700, color: overallColor,
          fontVariantNumeric: "tabular-nums",
          cursor: onCellClick ? "pointer" : "default",
        }}
        onClick={() => onCellClick?.(null)}
      >
        {total >= 0 ? "" : "−"}{formatMoney(Math.abs(total), { maxFraction: 0 })} {sym}
      </td>
    </tr>
  );
}
