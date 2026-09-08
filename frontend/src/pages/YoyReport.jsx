
import AnalysisNav from "../components/AnalysisNav";
import { formatMoney } from "../utils/money";
import { useYoyReportController } from "../hooks/useYoyReportController";
import { TypeBtn, FilterChips } from "../components/yoyReport/YoyReportParts";
import { thStyle } from "../utils/yoyReportView";

export default function YoyReport() {
  const { mainCurrency, type, setType, accounts, selAccounts, setSelAccounts, selCategories, setSelCategories, data, loading, error, hoverCol, setHoverCol, filtersOpen, setFiltersOpen, onCellOver, sym, rootCategories, toggle, accentColor } = useYoyReportController();
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

      <button type="button" className="yoy-filter-trigger btn-ghost" onClick={() => setFiltersOpen(true)}>
        Фильтры · {selAccounts.size ? `${selAccounts.size} сч.` : "все счета"} · {selCategories.size ? `${selCategories.size} кат.` : "все категории"}
      </button>
      {filtersOpen && <button type="button" className="mobile-sheet-backdrop" aria-label="Закрыть фильтры" onClick={() => setFiltersOpen(false)} />}
      {/* Контролы */}
      <div className={`yoy-filters${filtersOpen ? " is-open" : ""}`} style={{
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
        <button type="button" className="yoy-filter-done" onClick={() => setFiltersOpen(false)}>Показать сравнение</button>
      </div>

      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: "#c0432b" }}>{error}</p>}

      {data && !loading && (
        data.years.length === 0 ? (
          <p style={{ color: "#a6afb8" }}>Нет данных под выбранные фильтры.</p>
        ) : (
          <>
          <div className="yoy-mobile-results">
            <section className="yoy-mobile-month">
              <h3>Итого за год</h3>
              {data.years.map(year => <div key={year}><span>{year}</span><strong>{formatMoney(data.totals[year] ?? 0, { maxFraction: 0 })} {sym}</strong></div>)}
            </section>
            {data.rows.map(row => (
              <section key={row.month} className="yoy-mobile-month">
                <h3>{row.label}</h3>
                {data.years.map(year => (
                  <div key={year}><span>{year}</span><strong style={{ color: accentColor }}>{formatMoney(row.values[year] ?? 0, { maxFraction: 0 })} {sym}</strong></div>
                ))}
              </section>
            ))}
          </div>
          <div className="table-wrap annual-desktop-table" style={{
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
          </>
        )
      )}
    </div>
  );
}
