import { formatMoney } from "../../utils/money";
import { MONTHS } from "../../utils/annualBalancesView";

export function Cell({ value, bold }) {
  const zero = Math.abs(value) < 0.5;
  return (
    <td style={{
      padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
      fontWeight: bold ? 600 : 400,
      color: zero ? "#9aa5af" : (value < 0 ? "#a93421" : "#1b2531"),
      fontSize: 12.5,
    }}>
      {zero ? "—" : formatMoney(value, { maxFraction: 0 })}
    </td>
  );
}

export function MobileBalances({ data, month, onMonthChange, sym }) {
  return (
    <div className="annual-mobile-view">
      <label className="mobile-period-select">Месяц
        <select value={month} onChange={e => onMonthChange(Number(e.target.value))}>
          <option value={-1}>Все месяцы года</option>
          {MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}
        </select>
      </label>
      {month === -1 ? MONTHS.map((label, index) => <details className="mobile-report-section" key={label}>
        <summary className="mobile-report-row"><span>{label}</span><strong>{formatMoney(data.total_monthly[index] || 0, { maxFraction: 0 })} {sym}</strong></summary>
        {data.groups.map(group => <div key={group.group_id ?? 'ungrouped'}>
          <h3><span>{group.group_name}</span><strong>{formatMoney(group.monthly[index] || 0, { maxFraction: 0 })} {sym}</strong></h3>
          {group.accounts.map(account => <div className="mobile-report-row static" key={account.account_id}><span>{account.name}</span><strong>{formatMoney(account.monthly[index] || 0, { maxFraction: 0 })} {sym}</strong></div>)}
        </div>)}
      </details>) : <>
      <div className="mobile-balance-total">
        <small>Общий баланс на конец месяца</small>
        <strong>{formatMoney(data.total_monthly[month] || 0, { maxFraction: 0 })} {sym}</strong>
      </div>
      {data.groups.map(group => (
        <section key={group.group_id ?? "ungrouped"} className="mobile-report-section">
          <h3><span>{group.group_name}</span><strong>{formatMoney(group.monthly[month] || 0, { maxFraction: 0 })} {sym}</strong></h3>
          {group.accounts.map(account => (
            <div key={account.account_id} className="mobile-report-row static">
              <span>{account.icon ? `${account.icon} ` : ""}{account.name}</span>
              <strong>{formatMoney(account.monthly[month] || 0, { maxFraction: 0 })} {sym}</strong>
            </div>
          ))}
        </section>
      ))}
      </>}
    </div>
  );
}

export function GroupBlock({ group, months }) {
  const cols = months || group.monthly.map((_, i) => i);
  return (
    <>
      <tr style={{ background: "#f6f2e9", borderTop: "1px solid #e4ddcd" }}>
        <td style={{ padding: "7px 10px", fontWeight: 700, color: "#1b2531", whiteSpace: "nowrap", position: "sticky", left: 0, background: "#f6f2e9" }}>
          {group.group_name}
        </td>
        {cols.map(i => (
          <Cell key={i} value={group.monthly[i]} bold />
        ))}
      </tr>
      {group.accounts.map(a => (
        <tr key={a.account_id} style={{ borderTop: "1px solid #ece6d8" }}>
          <td style={{ padding: "6px 10px 6px 22px", color: "#515c68", whiteSpace: "nowrap", position: "sticky", left: 0, background: "#fffdf7" }}>
            {a.icon ? `${a.icon} ` : ""}{a.name}
          </td>
          {cols.map(i => (
            <Cell key={i} value={a.monthly[i]} />
          ))}
        </tr>
      ))}
    </>
  );
}
