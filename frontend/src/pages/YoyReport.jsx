import { useState, useEffect, useCallback, useMemo } from "react";
import api from "../api/client";
import { useUser } from "../contexts/UserContext";
import { currencySymbol, formatMoney } from "../utils/money";
import AnalysisNav from "../components/AnalysisNav";

// Сравнение год к году: строки — месяцы, колонки — годы.
// Фильтры: тип (расходы/доходы), счета, категории (мультивыбор).
export default function YoyReport() {
  const { mainCurrency } = useUser();
  const [type, setType] = useState("expense");
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selAccounts, setSelAccounts] = useState(new Set());   // пусто = все
  const [selCategories, setSelCategories] = useState(new Set());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoverCol, setHoverCol] = useState(null);

  const onCellOver = (e) => {
    const cell = e.target.closest("td, th");
    if (cell) setHoverCol(cell.cellIndex + 1);
  };

  useEffect(() => {
    Promise.all([api.get("/api/accounts/"), api.get("/api/categories/")])
      .then(([a, c]) => { setAccounts(a.data); setCategories(c.data); })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = { type };
    if (selAccounts.size) params.account_ids = [...selAccounts].join(",");
    if (selCategories.size) params.category_ids = [...selCategories].join(",");
    api.get("/api/reports/yoy", { params })
      .then(r => setData(r.data))
      .catch(() => setError("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [type, selAccounts, selCategories]);

  useEffect(() => { fetchData(); }, [fetchData, mainCurrency]);

  const sym = currencySymbol(data?.main_currency || mainCurrency);
  const rootCategories = useMemo(
    () => categories.filter(c => !c.parent_id && c.type === type),
    [categories, type],
  );

  const toggle = (set, setter, id) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const accentColor = type === "income" ? "#167a4a" : "#c0432b";

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <h1 style={{ margin: "0 0 12px" }}>Анализ</h1>
      <AnalysisNav />
      <h1 style={{ marginBottom: 6, fontSize: 26 }}>
        Год к году, <span style={{ color: "#173a54" }}>{data?.main_currency || mainCurrency}</span>
      </h1>
      <p style={{ color: "#7a8590", fontSize: 13.5, marginBottom: 16, maxWidth: 760 }}>
        Сравнение по месяцам между годами. Можно ограничить выборку счетами
        и категориями — например, сравнить только расходы на еду.
      </p>

      {/* Контролы */}
      <div style={{
        background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 10,
        padding: 14, marginBottom: 16,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          <TypeBtn active={type === "expense"} onClick={() => { setType("expense"); setSelCategories(new Set()); }}>Расходы</TypeBtn>
          <TypeBtn active={type === "income"} onClick={() => { setType("income"); setSelCategories(new Set()); }}>Доходы</TypeBtn>
        </div>

        <FilterChips
          label="Счета"
          items={accounts.map(a => ({ id: a.id, name: `${a.icon ? a.icon + " " : ""}${a.name}` }))}
          selected={selAccounts}
          onToggle={(id) => toggle(selAccounts, setSelAccounts, id)}
          onClear={() => setSelAccounts(new Set())}
        />
        <FilterChips
          label="Категории"
          items={rootCategories.map(c => ({ id: c.id, name: `${c.icon ? c.icon + " " : ""}${c.name}` }))}
          selected={selCategories}
          onToggle={(id) => toggle(selCategories, setSelCategories, id)}
          onClear={() => setSelCategories(new Set())}
        />
      </div>

      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: "#c0432b" }}>{error}</p>}

      {data && !loading && (
        data.years.length === 0 ? (
          <p style={{ color: "#a6afb8" }}>Нет данных под выбранные фильтры.</p>
        ) : (
          <div className="table-wrap" style={{
            background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 8,
            paddingTop: 4, paddingBottom: 4,
          }}>
            <table
              className={`report-table${hoverCol ? ` hc-${hoverCol}` : ""}`}
              style={{ minWidth: 160 + data.years.length * 110, fontSize: 12.5 }}
              onMouseOver={onCellOver}
              onMouseLeave={() => setHoverCol(null)}
            >
              <thead>
                <tr style={{ background: "#a6afb8" }}>
                  <th style={thStyle}>Месяц</th>
                  {data.years.map(y => (
                    <th key={y} style={{ ...thStyle, textAlign: "right" }}>{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map(row => (
                  <tr key={row.month} style={{
                    borderTop: "1px solid #efe9db",
                    background: "#fff",
                  }}>
                    <td style={{ padding: "8px 12px", color: "#1b2531", whiteSpace: "nowrap" }}>
                      {row.label}
                    </td>
                    {data.years.map(y => {
                      const v = row.values[y] ?? 0;
                      const active = Math.abs(v) > 0.005;
                      return (
                        <td key={y} style={{
                          padding: "8px 10px", textAlign: "right",
                          color: active ? accentColor : "#c7cdd3",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {active ? formatMoney(v, { maxFraction: 0 }) : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr style={{ background: "#efe9db", borderTop: "2px solid #c7cdd3" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 700 }}>Итого</td>
                  {data.years.map(y => (
                    <td key={y} style={{
                      padding: "8px 10px", textAlign: "right",
                      fontWeight: 700, color: accentColor,
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {formatMoney(data.totals[y] ?? 0, { maxFraction: 0 })} {sym}
                    </td>
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

const thStyle = {
  padding: "8px 10px", textAlign: "left",
  fontSize: 11, fontWeight: 600, color: "#fff",
  textTransform: "uppercase", letterSpacing: 0.4,
  whiteSpace: "nowrap",
};

function TypeBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "5px 14px", borderRadius: 999,
        border: `1px solid ${active ? "#173a54" : "#e4ddcd"}`,
        background: active ? "#173a54" : "transparent",
        color: active ? "#fff" : "#515c68",
        fontSize: 13, fontWeight: active ? 600 : 500, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function FilterChips({ label, items, selected, onToggle, onClear }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "#7a8590", fontWeight: 600, paddingTop: 4, minWidth: 78 }}>
        {label}:
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
        <Chip active={selected.size === 0} onClick={onClear}>Все</Chip>
        {items.map(it => (
          <Chip key={it.id} active={selected.has(it.id)} onClick={() => onToggle(it.id)}>
            {it.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "3px 10px", borderRadius: 999, fontSize: 12,
        border: `1px solid ${active ? "#9c7b3c" : "#e4ddcd"}`,
        background: active ? "#9c7b3c" : "transparent",
        color: active ? "#fff" : "#515c68",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
