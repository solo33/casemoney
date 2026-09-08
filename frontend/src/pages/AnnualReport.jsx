
import AnalysisNav from "../components/AnalysisNav";
import { useAnnualReportController } from "../hooks/useAnnualReportController";
import { MobileAnnualFlow, Th, SectionHeader, RowLine, SubtotalRow, NetRow } from "../components/annualReport/AnnualReportParts";
import { MONTHS, periodForCell } from "../utils/annualReportView";

export default function AnnualReport() {
  const { navigate, mainCurrency, year, setYear, data, loading, error, hideEmpty, setHideEmpty, hoverCol, setHoverCol, mobileMonth, setMobileMonth, onCellOver, sym, incomeRows, expenseRows, visibleMonths } = useAnnualReportController();
  return (
    <div className="page" style={{ maxWidth: 1680 }}>
      <h1 style={{ margin: "0 0 12px" }}>Анализ</h1>
      <AnalysisNav />
      <h1 style={{ marginBottom: 6, fontSize: 26 }}>
        Денежный поток, <span style={{ color: "#173a54" }}>{data?.main_currency || mainCurrency}</span>
      </h1>
      <p style={{ color: "#7a8590", fontSize: 13.5, marginBottom: 16, maxWidth: 760 }}>
        Доходы и расходы по категориям, помесячно за год. Внизу — сальдо
        (доходы минус расходы): сколько денег реально прибавилось или убавилось
        за каждый месяц и за год в целом.
      </p>

      {/* Контролы */}
      <div className="annual-report-controls" style={{
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#515c68" }}>Выберите год:</span>
          <button
            type="button" className="btn-ghost"
            onClick={() => setYear(y => y - 1)}
            style={{ padding: "4px 10px", fontSize: 14 }}
            aria-label="Прошлый год"
          >◄</button>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            style={{ fontWeight: 600, padding: "4px 10px", fontSize: 14 }}
          >
            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button" className="btn-ghost"
            onClick={() => setYear(y => y + 1)}
            style={{ padding: "4px 10px", fontSize: 14 }}
            aria-label="Следующий год"
          >►</button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#515c68", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={e => setHideEmpty(e.target.checked)}
          />
          Скрыть категории без записей
        </label>
      </div>

      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: "#c0432b" }}>{error}</p>}

      {data && !loading && (
        <>
        <MobileAnnualFlow
          data={data}
          month={mobileMonth}
          onMonthChange={setMobileMonth}
          incomeRows={incomeRows}
          expenseRows={expenseRows}
          sym={sym}
          year={year}
          navigate={navigate}
        />
        <div className="table-wrap annual-desktop-table" style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 8,
          paddingTop: 4, paddingBottom: 4,
        }}>
          <table
            className={`report-table${hoverCol ? ` hc-${hoverCol}` : ""}`}
            style={{ minWidth: 980, fontSize: 12.5 }}
            onMouseOver={onCellOver}
            onMouseLeave={() => setHoverCol(null)}
          >
            <colgroup>
              <col style={{ minWidth: 170 }} />
              {visibleMonths.map(i => <col key={i} style={{ minWidth: 60 }} />)}
              <col style={{ minWidth: 78 }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#a6afb8" }}>
                <Th style={{ color: "#fff" }}>Категория</Th>
                {visibleMonths.map(i => <Th key={i} align="right" style={{ color: "#fff" }}>{MONTHS[i]}</Th>)}
                <Th align="right" style={{ color: "#fff" }}>Всего</Th>
              </tr>
            </thead>
            <tbody>
              {/* === Доходы === */}
              <SectionHeader title="Доходы" cols={visibleMonths.length} onAll={() => {
                const p = periodForCell(year, null);
                navigate(`/transactions?type=income&date_from=${p.from}&date_to=${p.to}`);
              }} />
              {incomeRows.map(row => (
                <RowLine
                  key={`i-${row.category_id}-${row.parent_id}`}
                  row={row} sym={sym} accent="#0f6a40" months={visibleMonths}
                  onCellClick={(monthIdx) => {
                    const p = periodForCell(year, monthIdx);
                    const params = new URLSearchParams({ date_from: p.from, date_to: p.to, type: "income" });
                    if (row.category_id != null) params.set("category_id", String(row.category_id));
                    navigate(`/transactions?${params}`);
                  }}
                />
              ))}
              <SubtotalRow
                label="Всего доходов"
                monthly={data.income_totals}
                total={data.income_total}
                sym={sym}
                color="#0f6a40"
                months={visibleMonths}
                onCellClick={(monthIdx) => {
                  const p = periodForCell(year, monthIdx);
                  navigate(`/transactions?type=income&date_from=${p.from}&date_to=${p.to}`);
                }}
              />

              {/* === Расходы === */}
              <SectionHeader title="Расходы" cols={visibleMonths.length} onAll={() => {
                const p = periodForCell(year, null);
                navigate(`/transactions?type=expense&date_from=${p.from}&date_to=${p.to}`);
              }} />
              {expenseRows.map(row => (
                <RowLine
                  key={`e-${row.category_id}-${row.parent_id}`}
                  row={row} sym={sym} accent="#a93421" months={visibleMonths}
                  onCellClick={(monthIdx) => {
                    const p = periodForCell(year, monthIdx);
                    const params = new URLSearchParams({ date_from: p.from, date_to: p.to, type: "expense" });
                    if (row.category_id != null) params.set("category_id", String(row.category_id));
                    navigate(`/transactions?${params}`);
                  }}
                />
              ))}
              <SubtotalRow
                label="Всего расходов"
                monthly={data.expense_totals}
                total={data.expense_total}
                sym={sym}
                color="#a93421"
                months={visibleMonths}
                onCellClick={(monthIdx) => {
                  const p = periodForCell(year, monthIdx);
                  navigate(`/transactions?type=expense&date_from=${p.from}&date_to=${p.to}`);
                }}
              />

              {/* === Net === */}
              <NetRow
                label="Сальдо"
                monthly={data.net_monthly}
                total={data.net_total}
                sym={sym}
                months={visibleMonths}
                onCellClick={(monthIdx) => {
                  const p = periodForCell(year, monthIdx);
                  navigate(`/transactions?date_from=${p.from}&date_to=${p.to}`);
                }}
              />
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
