import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { useUser } from "../contexts/UserContext";
import { currencySymbol, formatMoney } from "../utils/money";

const MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

export default function AnnualReport() {
  const { mainCurrency } = useUser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hideEmpty, setHideEmpty] = useState(true);

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
  const filterRows = (rows) => hideEmpty
    ? rows.filter(r => Math.abs(r.total) > 0.005)
    : rows;

  const incomeRows = useMemo(() => data ? filterRows(data.income) : [], [data, hideEmpty]);
  const expenseRows = useMemo(() => data ? filterRows(data.expense) : [], [data, hideEmpty]);

  return (
    <div className="page" style={{ maxWidth: 1280 }}>
      <div style={{ marginBottom: 8 }}>
        <Link to="/reports" style={{ fontSize: 13, color: "#9f1239", textDecoration: "none" }}>
          ← К сводке
        </Link>
      </div>
      <h1 style={{ marginBottom: 16 }}>
        Годовой анализ доходов и расходов, <span style={{ color: "#9f1239" }}>{data?.main_currency || mainCurrency}</span>
      </h1>

      {/* Контролы */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#57534e" }}>Выберите год:</span>
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
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#57534e", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={e => setHideEmpty(e.target.checked)}
          />
          Скрыть категории без записей
        </label>
      </div>

      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      {data && !loading && (
        <div className="table-wrap" style={{
          background: "#fff", border: "1px solid #e7e5e0", borderRadius: 8,
        }}>
          <table style={{ minWidth: 1100, fontSize: 13 }}>
            <colgroup>
              <col style={{ minWidth: 220 }} />
              {MONTHS.map((_, i) => <col key={i} style={{ minWidth: 70 }} />)}
              <col style={{ minWidth: 90 }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#a8a29e" }}>
                <Th style={{ color: "#fff" }}>Категория</Th>
                {MONTHS.map(m => <Th key={m} align="right" style={{ color: "#fff" }}>{m}</Th>)}
                <Th align="right" style={{ color: "#fff" }}>Всего</Th>
              </tr>
            </thead>
            <tbody>
              {/* === Доходы === */}
              <SectionHeader title="Доходы" />
              {incomeRows.map(row => (
                <RowLine key={`i-${row.category_id}-${row.parent_id}`} row={row} sym={sym} accent="#15803d" />
              ))}
              <SubtotalRow
                label="Всего доходов"
                monthly={data.income_totals}
                total={data.income_total}
                sym={sym}
                color="#15803d"
              />

              {/* === Расходы === */}
              <SectionHeader title="Расходы" />
              {expenseRows.map(row => (
                <RowLine key={`e-${row.category_id}-${row.parent_id}`} row={row} sym={sym} accent="#b91c1c" />
              ))}
              <SubtotalRow
                label="Всего расходов"
                monthly={data.expense_totals}
                total={data.expense_total}
                sym={sym}
                color="#b91c1c"
              />

              {/* === Net === */}
              <NetRow
                label="Расходы/доходы"
                monthly={data.net_monthly}
                total={data.net_total}
                sym={sym}
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

function SectionHeader({ title }) {
  return (
    <tr style={{ background: "#e7e5e0" }}>
      <td colSpan={14} style={{
        padding: "10px 12px",
        fontFamily: "var(--serif)",
        fontSize: 18, fontWeight: 500, color: "#1c1917",
        letterSpacing: -0.01,
      }}>
        {title}
      </td>
    </tr>
  );
}

function RowLine({ row, sym, accent }) {
  const isChild = !!row.parent_id;
  return (
    <tr style={{
      borderTop: "1px solid #f5f3ee",
      background: isChild ? "#fafaf9" : "#fff",
    }}>
      <td style={{
        padding: "6px 12px",
        paddingLeft: isChild ? 36 : 12,
        fontWeight: row.is_parent ? 600 : 400,
        color: isChild ? "#57534e" : "#1c1917",
        fontSize: isChild ? 12.5 : 13,
      }}>
        {row.category_name}
      </td>
      {row.monthly.map((v, i) => (
        <td key={i} style={{
          padding: "6px 10px",
          textAlign: "right",
          color: v > 0.005 ? accent : "#d6d3d1",
          fontWeight: 400,
          fontVariantNumeric: "tabular-nums",
        }}>
          {v > 0.005 ? formatMoney(v) : ""}
        </td>
      ))}
      <td style={{
        padding: "6px 10px",
        textAlign: "right",
        color: accent,
        fontWeight: row.is_parent ? 600 : 500,
        fontVariantNumeric: "tabular-nums",
      }}>
        {row.total > 0.005 ? `${formatMoney(row.total)} ${sym}` : ""}
      </td>
    </tr>
  );
}

function SubtotalRow({ label, monthly, total, sym, color }) {
  return (
    <tr style={{ background: "#f5f3ee", borderTop: "2px solid #d6d3d1" }}>
      <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1c1917" }}>{label}</td>
      {monthly.map((v, i) => (
        <td key={i} style={{
          padding: "8px 10px", textAlign: "right",
          fontWeight: 600, color,
          fontVariantNumeric: "tabular-nums",
        }}>
          {v > 0.005 ? formatMoney(v) : ""}
        </td>
      ))}
      <td style={{
        padding: "8px 10px", textAlign: "right",
        fontWeight: 700, color,
        fontVariantNumeric: "tabular-nums",
      }}>
        {total > 0.005 ? `${formatMoney(total)} ${sym}` : ""}
      </td>
    </tr>
  );
}

function NetRow({ label, monthly, total, sym }) {
  const overallColor = total >= 0 ? "#15803d" : "#b91c1c";
  return (
    <tr style={{ background: "#a8a29e" }}>
      <td style={{ padding: "10px 12px", fontWeight: 700, color: "#fff" }}>{label}</td>
      {monthly.map((v, i) => {
        const color = Math.abs(v) < 0.005 ? "#e7e5e0" : (v >= 0 ? "#bbf7d0" : "#fecaca");
        return (
          <td key={i} style={{
            padding: "10px 10px", textAlign: "right",
            fontWeight: 600, color,
            fontVariantNumeric: "tabular-nums",
          }}>
            {Math.abs(v) > 0.005 ? `${v >= 0 ? "" : "−"}${formatMoney(Math.abs(v))}` : ""}
          </td>
        );
      })}
      <td style={{
        padding: "10px 10px", textAlign: "right",
        fontWeight: 700, color: overallColor === "#15803d" ? "#bbf7d0" : "#fecaca",
        fontVariantNumeric: "tabular-nums",
      }}>
        {total >= 0 ? "" : "−"}{formatMoney(Math.abs(total))} {sym}
      </td>
    </tr>
  );
}
