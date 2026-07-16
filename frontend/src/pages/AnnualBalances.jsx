import { useState, useEffect, useCallback, useMemo } from "react";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { useUser } from "../contexts/UserContext";
import { currencySymbol, formatMoney } from "../utils/money";
import AnalysisNav from "../components/AnalysisNav";

const MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function Cell({ value, bold }) {
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

export default function AnnualBalances() {
  const { mainCurrency } = useUser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoverCol, setHoverCol] = useState(null);
  const [mobileMonth, setMobileMonth] = useState(new Date().getMonth());

  // Делегирование: подсветка колонки по nth-child наведённой ячейки
  const onCellOver = (e) => {
    const cell = e.target.closest("td, th");
    if (cell) setHoverCol(cell.cellIndex + 1);
  };

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get(`/api/reports/annual-balances?year=${year}`)
      .then(r => setData(r.data))
      .catch(() => setError("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => {
    fetchData();
    window.addEventListener(TX_ADDED_EVENT, fetchData);
    return () => window.removeEventListener(TX_ADDED_EVENT, fetchData);
  }, [fetchData]);
  useEffect(() => { fetchData(); }, [mainCurrency, fetchData]);

  const sym = currencySymbol(data?.main_currency || mainCurrency);

  // Показываем только месяцы, где есть ненулевой остаток хотя бы по одному счёту
  const visibleMonths = useMemo(() => {
    if (!data) return [...Array(12).keys()];
    const idx = [];
    for (let i = 0; i < 12; i++) {
      if (Math.abs(data.total_monthly[i]) > 0.5) idx.push(i);
    }
    return idx.length ? idx : [...Array(12).keys()];
  }, [data]);

  return (
    <div className="page" style={{ maxWidth: 1680 }}>
      <h1 style={{ margin: "0 0 12px" }}>Анализ</h1>
      <AnalysisNav />
      <h1 style={{ marginBottom: 6, fontSize: 26 }}>
        Годовые балансы, <span style={{ color: "#173a54" }}>{data?.main_currency || mainCurrency}</span>
      </h1>
      <p style={{ color: "#7a8590", fontSize: 13.5, marginBottom: 16, maxWidth: 760 }}>
        Остаток каждого счёта на конец каждого месяца, округлённо до рубля.
        Перевод между своими счетами на сумму не влияет — учитываются только
        доходы и расходы. Колонка со счётом закреплена, таблицу можно прокручивать
        вбок.
      </p>

      {/* Год */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button className="btn-ghost" onClick={() => setYear(y => y - 1)} style={{ padding: "4px 12px" }}>‹</button>
        <span style={{ fontSize: 18, fontWeight: 600, minWidth: 60, textAlign: "center" }}>{year}</span>
        <button className="btn-ghost" onClick={() => setYear(y => y + 1)} style={{ padding: "4px 12px" }}>›</button>
      </div>

      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: "#c0432b" }}>{error}</p>}

      {data && !loading && (
        data.groups.length === 0 ? (
          <p style={{ color: "#a6afb8" }}>Нет счетов.</p>
        ) : (
          <>
          <MobileBalances data={data} month={mobileMonth} onMonthChange={setMobileMonth} sym={sym} />
          <div className="table-wrap annual-desktop-table" style={{
            background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
          }}>
            <table
              className={`report-table${hoverCol ? ` hc-${hoverCol}` : ""}`}
              style={{ minWidth: 980, fontSize: 12.5 }}
              onMouseOver={onCellOver}
              onMouseLeave={() => setHoverCol(null)}
            >
              <thead>
                <tr style={{ background: "#efe9db" }}>
                  <th style={{ padding: "8px 10px", textAlign: "left", position: "sticky", left: 0, background: "#efe9db", zIndex: 4 }}>
                    Счёт
                  </th>
                  {visibleMonths.map(i => (
                    <th key={i} style={{ padding: "8px 8px", textAlign: "right", fontSize: 11 }}>
                      {MONTHS[i]} {sym}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.groups.map(g => (
                  <GroupBlock key={g.group_id ?? "ungrouped"} group={g} months={visibleMonths} />
                ))}
                {/* Грандтотал */}
                <tr style={{ borderTop: "2px solid #d4cbb6", background: "#efe9db" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 700, position: "sticky", left: 0, background: "#efe9db" }}>
                    Всего
                  </td>
                  {visibleMonths.map(i => (
                    <Cell key={i} value={data.total_monthly[i]} bold />
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          </>
        )
      )}
    </div>
  );
}

function MobileBalances({ data, month, onMonthChange, sym }) {
  return (
    <div className="annual-mobile-view">
      <label className="mobile-period-select">Месяц
        <select value={month} onChange={e => onMonthChange(Number(e.target.value))}>
          {MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}
        </select>
      </label>
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
    </div>
  );
}

function GroupBlock({ group, months }) {
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
