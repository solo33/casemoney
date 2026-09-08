
import AnalysisNav from "../components/AnalysisNav";
import { useAnnualBalancesController } from "../hooks/useAnnualBalancesController";
import { MobileBalances, GroupBlock, Cell } from "../components/annualBalances/AnnualBalancesParts";
import { MONTHS } from "../utils/annualBalancesView";

export default function AnnualBalances() {
  const { mainCurrency, year, setYear, data, loading, error, hoverCol, setHoverCol, mobileMonth, setMobileMonth, onCellOver, sym, visibleMonths } = useAnnualBalancesController();
  return (
    <div className="page" style={{ maxWidth: 1680 }}>
      <h1 style={{ margin: "0 0 12px" }}>Анализ</h1>
      <AnalysisNav />
      <h1 style={{ marginBottom: 6, fontSize: 26 }}>
        Годовые балансы, <span style={{ color: "#173a54" }}>{data?.main_currency || mainCurrency}</span>
      </h1>
      <p style={{ color: "#7a8590", fontSize: 13.5, marginBottom: 16, maxWidth: 760 }}>
        Остаток каждого счёта на конец каждого месяца, округлённо до рубля.
        Переводы учитываются для каждого счёта отдельно: списание — на счёте-источнике,
        зачисление — на счёте-получателе. На общий капитал перевод между своими счетами
        не влияет. Колонка со счётом закреплена, таблицу можно прокручивать вбок.
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
