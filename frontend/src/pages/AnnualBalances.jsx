import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { useUser } from "../contexts/UserContext";
import { currencySymbol, formatMoney } from "../utils/money";

const MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function Cell({ value, sym, bold }) {
  const zero = Math.abs(value) < 0.005;
  return (
    <td style={{
      padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
      fontWeight: bold ? 600 : 400,
      color: zero ? "#c7cdd3" : (value < 0 ? "#c0432b" : "#1b2531"),
      fontSize: 13,
    }}>
      {zero ? "—" : `${formatMoney(value)}`}
    </td>
  );
}

export default function AnnualBalances() {
  const { mainCurrency } = useUser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div style={{ marginBottom: 8 }}>
        <Link to="/reports" style={{ fontSize: 13, color: "#173a54", textDecoration: "none" }}>
          ← К сводке
        </Link>
      </div>
      <h1 style={{ marginBottom: 6 }}>
        Годовые балансы, <span style={{ color: "#173a54" }}>{data?.main_currency || mainCurrency}</span>
      </h1>
      <p style={{ color: "#7a8590", fontSize: 13.5, marginBottom: 16, maxWidth: 760 }}>
        Остаток каждого счёта на конец каждого месяца. Показывает, как менялись
        накопления в течение года. Перевод между своими счетами на сумму не влияет —
        учитываются только доходы и расходы.
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
          <div className="table-wrap" style={{
            background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
          }}>
            <table style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{ padding: "9px 12px", textAlign: "left", position: "sticky", left: 0, background: "#efe9db", zIndex: 1 }}>
                    Счёт
                  </th>
                  {MONTHS.map(m => (
                    <th key={m} style={{ padding: "9px 10px", textAlign: "right" }}>
                      {m} {sym}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.groups.map(g => (
                  <GroupBlock key={g.group_id ?? "ungrouped"} group={g} sym={sym} />
                ))}
                {/* Грандтотал */}
                <tr style={{ borderTop: "2px solid #d4cbb6", background: "#efe9db" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 700, position: "sticky", left: 0, background: "#efe9db" }}>
                    Всего
                  </td>
                  {data.total_monthly.map((v, i) => (
                    <Cell key={i} value={v} sym={sym} bold />
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function GroupBlock({ group, sym }) {
  return (
    <>
      <tr style={{ background: "#f6f2e9", borderTop: "1px solid #e4ddcd" }}>
        <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1b2531", position: "sticky", left: 0, background: "#f6f2e9" }}>
          {group.group_name}
        </td>
        {group.monthly.map((v, i) => (
          <Cell key={i} value={v} sym={sym} bold />
        ))}
      </tr>
      {group.accounts.map(a => (
        <tr key={a.account_id} style={{ borderTop: "1px solid #ece6d8" }}>
          <td style={{ padding: "7px 12px 7px 28px", color: "#515c68", whiteSpace: "nowrap", position: "sticky", left: 0, background: "#fffdf7" }}>
            {a.icon ? `${a.icon} ` : ""}{a.name}
          </td>
          {a.monthly.map((v, i) => (
            <Cell key={i} value={v} sym={sym} />
          ))}
        </tr>
      ))}
    </>
  );
}
