import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import QuickAddInline from "../components/QuickAddInline";
import { useUser } from "../contexts/UserContext";
import { currencySymbol, formatMoney, formatMoneyWithCurrency } from "../utils/money";

const TYPE_LABEL = { income: "Доход", expense: "Расход", transfer: "Перевод" };
const TYPE_COLOR = { income: "#167a4a", expense: "#c0432b", transfer: "#2f6296" };

const RU_MONTHS_FULL = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];

function isToday(iso) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

// Границы текущего месяца в формате YYYY-MM-DD
function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n) => String(n).padStart(2, "0");
  const from = `${y}-${pad(m + 1)}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${pad(m + 1)}-${pad(last)}`;
  return { from, to };
}

function aggregateByCurrency(groups) {
  const map = {};
  groups.forEach(g => g.accounts.forEach(a => {
    if (a.include_in_balance === false) return;
    (a.balances || []).forEach(b => {
      map[b.currency] = (map[b.currency] || 0) + b.balance;
    });
  }));
  return Object.entries(map)
    .map(([currency, balance]) => ({ currency, balance }))
    .filter(x => Math.abs(x.balance) > 0.005)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

export default function Home() {
  const { mainCurrency } = useUser();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [grouped, setGrouped] = useState([]);
  const [summary, setSummary] = useState(null);
  const [breakdownType, setBreakdownType] = useState("expense"); // expense | income
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const now = new Date();
      const params = {
        period: "month",
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        breakdown_type: breakdownType,
      };
      const [d, g, s] = await Promise.all([
        api.get("/api/dashboard/"),
        api.get("/api/accounts/grouped"),
        api.get("/api/reports/summary", { params }),
      ]);
      setDashboard(d.data);
      setGrouped(g.data);
      setSummary(s.data);
    } catch {
      setError("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [breakdownType]);

  useEffect(() => {
    fetchAll();
    window.addEventListener(TX_ADDED_EVENT, fetchAll);
    return () => window.removeEventListener(TX_ADDED_EVENT, fetchAll);
  }, [fetchAll]);

  useEffect(() => { fetchAll(); }, [mainCurrency, fetchAll]);

  const sym = currencySymbol(mainCurrency);

  // breakdown сумм по валютам по всем счетам (только учитываемые в балансе)
  const byCurrency = useMemo(() => aggregateByCurrency(grouped), [grouped]);

  // последние 3 месяца из dashboard.monthly_stats
  const last3 = useMemo(() => {
    if (!dashboard?.monthly_stats) return [];
    return dashboard.monthly_stats.slice(-3).reverse();
  }, [dashboard]);

  // транзакции за сегодня (для правой колонки)
  const todayTx = useMemo(() => {
    if (!dashboard?.recent_transactions) return [];
    return dashboard.recent_transactions.filter(t => isToday(t.date));
  }, [dashboard]);

  const recentlyChanged = dashboard?.recently_changed || [];

  if (loading) return <div className="page">Загрузка...</div>;
  if (error) return <div className="page" style={{ color: "#c0432b" }}>{error}</div>;

  const totalBalance = dashboard.total_balance;
  const monthIncome = dashboard.month_income || 0;
  const monthExpense = dashboard.month_expense || 0;
  const maxMonthFlow = Math.max(Math.abs(monthIncome), Math.abs(monthExpense)) || 1;
  const thisMonthLabel = RU_MONTHS_FULL[new Date().getMonth()];

  const breakdownItems = summary?.category_breakdown || [];
  const breakdownTotal = breakdownType === "income"
    ? (summary?.total_income || 0)
    : (summary?.total_expense || 0);
  const maxCatTotal = breakdownItems.length ? breakdownItems[0].total : 0;
  const monthLabel = summary?.period_label ||
    `${RU_MONTHS_FULL[new Date().getMonth()]} ${new Date().getFullYear()}`;
  const breakdownColor = breakdownType === "income" ? "#167a4a" : "#c0432b";
  const breakdownWord = breakdownType === "income" ? "Доходы" : "Расходы";

  // Клик по категории → переход в Записи с фильтром (категория + тип + текущий месяц)
  const goToCategory = (catId) => {
    const { from, to } = currentMonthRange();
    const params = new URLSearchParams({ type: breakdownType, date_from: from, date_to: to });
    if (catId != null) params.set("category_id", String(catId));
    navigate(`/transactions?${params.toString()}`);
  };

  // Клик по счёту → Записи по этому счёту
  const goToAccount = (accId) => {
    navigate(`/transactions?account_id=${accId}`);
  };

  return (
    <div className="home-layout" style={{
      maxWidth: 1240,
      margin: "0 auto",
      padding: "16px",
      display: "grid",
      gridTemplateColumns: "380px 1fr",
      gap: 20,
      alignItems: "start",
    }}>
      <style>{`
        @media (max-width: 900px) {
          .home-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ============== LEFT SIDEBAR ============== */}
      <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Balance card */}
        <Card>
          <h3 style={sectionTitle}>Баланс</h3>
          <div className="money-hero tabular" style={{
            fontSize: 42, color: "#1b2531", lineHeight: 1.1, marginTop: 4,
          }}>
            {formatMoney(totalBalance)} <span style={{ fontSize: 18, color: "#a6afb8", fontWeight: 400 }}>{mainCurrency}</span>
          </div>

          {/* Доходы и расходы за текущий месяц — гистограмма */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #ece6d8" }}>
            <div style={{ fontSize: 11, color: "#7a8590", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Доходы и расходы за {thisMonthLabel}
            </div>
            <Bar value={monthIncome} max={maxMonthFlow} color="#167a4a" sym={sym} sign="+" />
            <Bar value={monthExpense} max={maxMonthFlow} color="#c0432b" sym={sym} sign="−" />
          </div>

          {byCurrency.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 2 }}>
              {byCurrency.map(c => (
                <div key={c.currency} style={{
                  display: "flex", justifyContent: "flex-end", gap: 6,
                  fontSize: 13, color: "#7a8590",
                }}>
                  <span style={{ fontWeight: 500, color: "#515c68" }}>
                    {formatMoney(c.balance, { maxFraction: 2 })}
                  </span>
                  <span>{c.currency}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Accounts grouped — только учитываемые в балансе */}
        <Card noPadding>
          <div style={{ padding: "12px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 style={{ ...sectionTitle, marginBottom: 0 }}>Счета</h3>
            <Link to="/accounts" style={{ fontSize: 12, color: "#9c7b3c", textDecoration: "none" }}>
              Настроить →
            </Link>
          </div>
          {grouped.length === 0 ? (
            <p style={{ padding: "10px 16px 16px", color: "#a6afb8", fontSize: 13 }}>
              Нет счетов. <Link to="/accounts">Добавить</Link>
            </p>
          ) : (
            grouped
              .map(bucket => ({
                ...bucket,
                accounts: (bucket.accounts || []).filter(a => a.include_in_balance !== false),
              }))
              .filter(bucket => bucket.accounts.length > 0)
              .map(bucket => (
                <GroupBlock key={bucket.group.id ?? "ungrouped"} bucket={bucket} sym={sym} onAccountClick={goToAccount} />
              ))
          )}
        </Card>
      </aside>

      {/* ============== RIGHT MAIN ============== */}
      <main style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Inline quick-add form */}
        <QuickAddInline />

        {/* Records today */}
        <Card noPadding>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #ece6d8", display: "flex", gap: 12, alignItems: "baseline" }}>
            <h3 style={{ ...sectionTitle, marginBottom: 0 }}>
              Записи за {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
            </h3>
            <span style={{ color: "#a6afb8", fontSize: 13, marginLeft: "auto" }}>
              {todayTx.length} {todayTx.length === 1 ? "запись" : "записей"}
            </span>
          </div>
          {todayTx.length === 0 ? (
            <p style={{ padding: 24, textAlign: "center", color: "#a6afb8", fontSize: 14 }}>
              Нет записей за сегодня. Добавьте первую операцию кнопкой <strong>+</strong>.
            </p>
          ) : (
            <div>
              {todayTx.map((tx, idx) => (
                <TxRow key={tx.id} tx={tx} first={idx === 0} onClick={() => goToAccount(tx.account_id)} />
              ))}
            </div>
          )}
        </Card>

        {/* Последние изменённые */}
        <Card noPadding>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #ece6d8", display: "flex", gap: 12, alignItems: "baseline" }}>
            <h3 style={{ ...sectionTitle, marginBottom: 0 }}>Последние изменения</h3>
            <Link to="/transactions" style={{ fontSize: 12, color: "#9c7b3c", textDecoration: "none", marginLeft: "auto" }}>
              Все записи →
            </Link>
          </div>
          {recentlyChanged.length === 0 ? (
            <p style={{ padding: 24, textAlign: "center", color: "#a6afb8", fontSize: 14 }}>
              Пока нет записей.
            </p>
          ) : (
            <div>
              {recentlyChanged.map((tx, idx) => (
                <TxRow key={tx.id} tx={tx} first={idx === 0} showDate onClick={() => goToAccount(tx.account_id)} />
              ))}
            </div>
          )}
        </Card>

        {/* Разбивка по категориям с переключателем Расходы/Доходы */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ ...sectionTitle, marginBottom: 0 }}>
              {breakdownWord} за {monthLabel.toLowerCase()}
            </h3>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <ToggleBtn active={breakdownType === "expense"} onClick={() => setBreakdownType("expense")}>Расходы</ToggleBtn>
              <ToggleBtn active={breakdownType === "income"} onClick={() => setBreakdownType("income")}>Доходы</ToggleBtn>
              <Link to="/reports" style={{ fontSize: 12, color: "#9c7b3c", textDecoration: "none", marginLeft: 4 }}>
                Анализ →
              </Link>
            </div>
          </div>
          {breakdownItems.length === 0 ? (
            <p style={{ color: "#a6afb8", fontSize: 14 }}>
              Нет {breakdownType === "income" ? "доходов" : "расходов"} за этот месяц
            </p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {breakdownItems.slice(0, 12).map(c => (
                  <CategoryBar
                    key={String(c.category_id)}
                    name={c.category_name}
                    icon={c.category_icon}
                    color={c.category_color}
                    total={c.total}
                    max={maxCatTotal}
                    sym={sym}
                    onClick={() => goToCategory(c.category_id)}
                  />
                ))}
              </div>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginTop: 14, paddingTop: 12, borderTop: "1px solid #ece6d8",
                fontSize: 14, fontWeight: 600,
              }}>
                <span style={{ color: "#515c68" }}>Итого</span>
                <span style={{ color: breakdownColor }}>{formatMoney(breakdownTotal)} {sym}</span>
              </div>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}

// =============== components ===============

const sectionTitle = {
  margin: "0 0 10px",
  fontSize: 13,
  color: "#7a8590",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

function Card({ children, style, noPadding }) {
  return (
    <div style={{
      background: "#fffdf7",
      border: "1px solid #e4ddcd",
      borderRadius: 10,
      padding: noPadding ? 0 : 16,
      ...style,
    }}>
      {children}
    </div>
  );
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 12px",
        borderRadius: 999,
        border: `1px solid ${active ? "#173a54" : "#e4ddcd"}`,
        background: active ? "#173a54" : "transparent",
        color: active ? "#fff" : "#515c68",
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function TxRow({ tx, first, showDate, onClick }) {
  const dateStr = new Date(tx.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 16px",
        borderTop: first ? "none" : "1px solid #ece6d8",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "#ece6d8", display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
      }}>
        {tx.category_icon || "💸"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tx.description || tx.category_name || TYPE_LABEL[tx.type]}
        </div>
        <div style={{ fontSize: 12, color: "#a6afb8" }}>
          {showDate ? `${dateStr} · ` : ""}{tx.account_name}
        </div>
      </div>
      <div style={{
        fontWeight: 600, fontSize: 14,
        color: TYPE_COLOR[tx.type], whiteSpace: "nowrap",
      }}>
        {tx.type === "expense" ? "−" : "+"}{formatMoneyWithCurrency(tx.amount, tx.currency)}
      </div>
    </div>
  );
}

function MonthBars({ points, sym }) {
  if (!points.length) {
    return <p style={{ color: "#a6afb8", fontSize: 14 }}>Нет данных</p>;
  }
  const maxVal = Math.max(...points.flatMap(p => [Math.abs(p.income), Math.abs(p.expense)])) || 1;

  return (
    <div>
      {points.map((p, idx) => {
        const m = parseInt(p.month.split("-")[1], 10);
        const label = idx === 0
          ? "Этот месяц"
          : RU_MONTHS_FULL[m - 1].charAt(0).toUpperCase() + RU_MONTHS_FULL[m - 1].slice(1);
        return (
          <div key={p.month} style={{
            marginBottom: idx === points.length - 1 ? 0 : 12,
          }}>
            <div style={{
              fontSize: 12, color: "#7a8590", marginBottom: 4,
              display: "flex", justifyContent: "space-between",
            }}>
              <span>{label}</span>
            </div>
            <Bar value={p.income} max={maxVal} color="#167a4a" sym={sym} sign="+" />
            <Bar value={p.expense} max={maxVal} color="#c0432b" sym={sym} sign="−" />
          </div>
        );
      })}
    </div>
  );
}

function Bar({ value, max, color, sym, sign }) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      fontSize: 12, marginTop: 3,
    }}>
      <div style={{
        flex: 1, height: 8, background: "#ece6d8", borderRadius: 4, overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", background: color, borderRadius: 4,
        }} />
      </div>
      <span style={{ color, fontWeight: 600, minWidth: 80, textAlign: "right" }}>
        {sign}{formatMoney(value)} {sym}
      </span>
    </div>
  );
}

function GroupBlock({ bucket, sym, onAccountClick }) {
  return (
    <div style={{
      padding: "10px 16px",
      borderTop: "1px solid #ece6d8",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 4,
      }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: "#44403c" }}>
          {bucket.group.name}
        </span>
        <span style={{ fontWeight: 600, fontSize: 13, color: "#515c68" }}>
          {formatMoney(bucket.total_in_main)} {sym}
        </span>
      </div>
      {bucket.accounts.map(acc => (
        <AccountBlock key={acc.id} acc={acc} sym={sym} onClick={() => onAccountClick(acc.id)} />
      ))}
    </div>
  );
}

function AccountBlock({ acc, sym, onClick }) {
  const balances = acc.balances || [];
  return (
    <div
      onClick={onClick}
      style={{
        marginTop: 6,
        paddingLeft: 4,
        cursor: onClick ? "pointer" : "default",
        borderRadius: 6,
      }}
    >
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        fontSize: 13,
      }}>
        <span style={{ color: "#515c68", display: "flex", alignItems: "center", gap: 6 }}>
          {acc.icon && <span>{acc.icon}</span>}
          {acc.name}
        </span>
        {balances.length === 1 && (
          <span style={{ color: "#1b2531", fontWeight: 500 }}>
            {formatMoneyWithCurrency(balances[0].balance, balances[0].currency)}
          </span>
        )}
      </div>
      {balances.length > 1 && (
        <div style={{ marginTop: 2, marginLeft: 16 }}>
          {balances.map(b => (
            <div key={b.currency} style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 12, color: "#7a8590", padding: "1px 0",
            }}>
              <span style={{ color: "#a6afb8" }}>{b.currency}</span>
              <span>{formatMoney(b.balance)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryBar({ name, icon, color, total, max, sym, onClick }) {
  const pct = max > 0 ? Math.min(100, (total / max) * 100) : 0;
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(120px, 1fr) 2fr auto",
        gap: 10, alignItems: "center",
        fontSize: 13,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span style={{
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        display: "flex", alignItems: "center", gap: 6, color: "#515c68",
      }}>
        {icon && <span>{icon}</span>}
        {name}
      </span>
      <div style={{
        height: 14, background: "#f6f2e9", borderRadius: 3, overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: color || "#9c7b3c",
          borderRadius: 3,
        }} />
      </div>
      <span style={{ color: "#515c68", minWidth: 80, textAlign: "right", fontWeight: 500 }}>
        {formatMoney(total)} {sym}
      </span>
    </div>
  );
}
