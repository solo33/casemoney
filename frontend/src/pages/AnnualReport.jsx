import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { useUser } from "../contexts/UserContext";
import { currencySymbol, formatMoney } from "../utils/money";
import AnalysisNav from "../components/AnalysisNav";

const MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

// Возвращает диапазон ISO-дат для месяца. month: 1..12, либо null = весь год
function periodForCell(year, monthIdx /* 0..11 или null = весь год */) {
  if (monthIdx === null || monthIdx === undefined) {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  const m = String(monthIdx + 1).padStart(2, "0");
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return { from: `${year}-${m}-01`, to: `${year}-${m}-${String(lastDay).padStart(2, "0")}` };
}

export default function AnnualReport() {
  const navigate = useNavigate();
  const { mainCurrency } = useUser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [hoverCol, setHoverCol] = useState(null);

  const onCellOver = (e) => {
    const cell = e.target.closest("td, th");
    if (cell) setHoverCol(cell.cellIndex + 1);
  };

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get(`/api/reports/annual?year=${year}`)
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

  // Фильтр пустых строк
  const hasRowData = (row) =>
    Math.abs(row.total) > 0.005 || row.monthly.some(v => Math.abs(v) > 0.005);
  const filterRows = (rows) => hideEmpty
    ? rows.filter(hasRowData)
    : rows;

  const incomeRows = useMemo(() => data ? filterRows(data.income) : [], [data, hideEmpty]);
  const expenseRows = useMemo(() => data ? filterRows(data.expense) : [], [data, hideEmpty]);

  // Колонки-месяцы масштабируются по данным: показываем только те месяцы,
  // где есть хоть какой-то доход или расход (итоги покрывают все строки).
  const visibleMonths = useMemo(() => {
    if (!data) return [...Array(12).keys()];
    const idx = [];
    for (let i = 0; i < 12; i++) {
      if (Math.abs(data.income_totals[i]) > 0.005 || Math.abs(data.expense_totals[i]) > 0.005) {
        idx.push(i);
      }
    }
    return idx.length ? idx : [...Array(12).keys()];
  }, [data]);

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
      <div style={{
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
        <div className="table-wrap" style={{
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
                  row={row} sym={sym} accent="#167a4a" months={visibleMonths}
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
                color="#167a4a"
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
                  row={row} sym={sym} accent="#c0432b" months={visibleMonths}
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
                color="#c0432b"
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
      )}
    </div>
  );
}

// ===== components =====

function Th({ children, align = "left", style = {} }) {
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

function SectionHeader({ title, onAll, cols = 12 }) {
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

function RowLine({ row, sym, accent, onCellClick, months }) {
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

function SubtotalRow({ label, monthly, total, sym, color, onCellClick, months }) {
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

function NetRow({ label, monthly, total, sym, onCellClick, months }) {
  const cols = months || monthly.map((_, i) => i);
  const overallColor = total >= 0 ? "#4ade80" : "#f87171";
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
        const color = Math.abs(v) < 0.005 ? "#7a8590" : (v >= 0 ? "#4ade80" : "#f87171");
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
