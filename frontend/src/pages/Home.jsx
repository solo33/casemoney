import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import QuickAddInline from "../components/QuickAddInline";
import { useUser } from "../contexts/UserContext";
import { currencySymbol, formatMoney, formatMoneyWithCurrency } from "../utils/money";

const TYPE_LABEL = { income: "Доход", expense: "Расход", transfer: "Перевод" };
const TYPE_COLOR = { income: "#15803d", expense: "#b91c1c", transfer: "#1d4ed8" };

const RU_MONTHS_FULL = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];

function todayKey() {
  const d = new Date(); return d.toISOString().slice(0, 10);
}

function isToday(iso) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function aggregateByCurrency(groups) {
  const map = {};
  groups.forEach(g => g.accounts.forEach(a => (a.balances || []).forEach(b => {
    map[b.currency] = (map[b.currency] || 0) + b.balance;
  })));
  return Object.entries(map)
    .map(([currency, balance]) => ({ currency, balance }))
    .filter(x => Math.abs(x.balance) > 0.005)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

export default function Home() {
  const { mainCurrency } = useUser();
  const [dashboard, setDashboard] = useState(null);
  const [grouped, setGrouped] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const now = new Date();
      const params = { period: "month", year: now.getFullYear(), month: now.getMonth() + 1 };
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
  }, []);

  useEffect(() => {
    fetchAll();
    window.addEventListener(TX_ADDED_EVENT, fetchAll);
    return () => window.removeEventListener(TX_ADDED_EVENT, fetchAll);
  }, [fetchAll]);

  useEffect(() => { fetchAll(); }, [mainCurrency, fetchAll]);

  const sym = currencySymbol(mainCurrency);

  // breakdown сумм по валютам по всем счетам
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

  if (loading) return <div className="page">Загрузка...</div>;
  if (error) return <div className="page" style={{ color: "#b91c1c" }}>{error}</div>;

  const totalBalance = dashboard.total_balance;
  const monthExpenses = summary?.category_breakdown || [];
  const expenseTotal = summary?.total_expense || 0;
  const maxCatTotal = monthExpenses.length ? monthExpenses[0].total : 0;
  const monthLabel = summary?.period_label ||
    `${RU_MONTHS_FULL[new Date().getMonth()]} ${new Date().getFullYear()}`;

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
            fontSize: 42, color: "#1c1917", lineHeight: 1.1, marginTop: 4,
          }}>
            {formatMoney(totalBalance)} <span style={{ fontSize: 18, color: "#a8a29e", fontWeight: 400 }}>{mainCurrency}</span>
          </div>
          {byCurrency.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
              {byCurrency.map(c => (
                <div key={c.currency} style={{
                  display: "flex", justifyContent: "flex-end", gap: 6,
                  fontSize: 13, color: "#78716c",
                }}>
                  <span style={{ fontWeight: 500, color: "#57534e" }}>
                    {formatMoney(c.balance, { maxFraction: 2 })}
                  </span>
                  <span>{c.currency}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 3 months mini stat */}
        <Card>
          <MonthBars points={last3} sym={sym} />
        </Card>

        {/* Accounts grouped */}
        <Card noPadding>
          <div style={{ padding: "12px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 style={{ ...sectionTitle, marginBottom: 0 }}>Счета</h3>
            <Link to="/accounts" style={{ fontSize: 12, color: "#9f1239", textDecoration: "none" }}>
              Настроить →
            </Link>
          </div>
          {grouped.length === 0 ? (
            <p style={{ padding: "10px 16px 16px", color: "#a8a29e", fontSize: 13 }}>
              Нет счетов. <Link to="/accounts">Добавить</Link>
            </p>
          ) : (
            grouped.map(bucket => (
              <GroupBlock key={bucket.group.id ?? "ungrouped"} bucket={bucket} sym={sym} />
            ))
          )}
        </Card>
      </aside>

      {/* ============== RIGHT MAIN ============== */}
      <main style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Inline quick-add form */}
        <QuickAddInline />

        {/* Records today + чарт */}
        <Card noPadding>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #ede9df", display: "flex", gap: 12, alignItems: "baseline" }}>
            <h3 style={{ ...sectionTitle, marginBottom: 0 }}>
              Записи за {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
            </h3>
            <span style={{ color: "#a8a29e", fontSize: 13, marginLeft: "auto" }}>
              {todayTx.length} {todayTx.length === 1 ? "запись" : "записей"}
            </span>
          </div>
          {todayTx.length === 0 ? (
            <p style={{ padding: 24, textAlign: "center", color: "#a8a29e", fontSize: 14 }}>
              Нет записей за сегодня. Добавьте первую операцию кнопкой <strong>+</strong>.
            </p>
          ) : (
            <div>
              {todayTx.map((tx, idx) => (
                <div key={tx.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 16px",
                  borderTop: idx === 0 ? "none" : "1px solid #ede9df",
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: "#ede9df", display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
                  }}>
                    {tx.category_icon || "💸"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tx.description || tx.category_name || TYPE_LABEL[tx.type]}
                    </div>
                    <div style={{ fontSize: 12, color: "#a8a29e" }}>
                      {tx.account_name}
                    </div>
                  </div>
                  <div style={{
                    fontWeight: 600, fontSize: 14,
                    color: TYPE_COLOR[tx.type], whiteSpace: "nowrap",
                  }}>
                    {tx.type === "expense" ? "−" : "+"}{formatMoneyWithCurrency(tx.amount, tx.currency)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Expenses by category (horizontal bars) */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <h3 style={sectionTitle}>Расходы за {monthLabel.toLowerCase()}</h3>
            <Link to="/reports" style={{ fontSize: 12, color: "#9f1239", textDecoration: "none" }}>
              Подробнее →
            </Link>
          </div>
          {monthExpenses.length === 0 ? (
            <p style={{ color: "#a8a29e", fontSize: 14 }}>Нет расходов за этот месяц</p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {monthExpenses.slice(0, 12).map(c => (
                  <CategoryBar
                    key={String(c.category_id)}
                    name={c.category_name}
                    icon={c.category_icon}
                    color={c.category_color}
                    total={c.total}
                    max={maxCatTotal}
                    sym={sym}
                  />
                ))}
              </div>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginTop: 14, paddingTop: 12, borderTop: "1px solid #ede9df",
                fontSize: 14, fontWeight: 600,
              }}>
                <span style={{ color: "#57534e" }}>Итого</span>
                <span style={{ color: "#b91c1c" }}>{formatMoney(expenseTotal)} {sym}</span>
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
  color: "#78716c",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

function Card({ children, style, noPadding }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e7e5e0",
      borderRadius: 10,
      padding: noPadding ? 0 : 16,
      ...style,
    }}>
      {children}
    </div>
  );
}

function MonthBars({ points, sym }) {
  if (!points.length) {
    return <p style={{ color: "#a8a29e", fontSize: 14 }}>Нет данных</p>;
  }
  // макс среди всех значений для нормализации длины бара
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
              fontSize: 12, color: "#78716c", marginBottom: 4,
              display: "flex", justifyContent: "space-between",
            }}>
              <span>{label}</span>
            </div>
            <Bar value={p.income} max={maxVal} color="#15803d" sym={sym} sign="+" />
            <Bar value={p.expense} max={maxVal} color="#b91c1c" sym={sym} sign="−" />
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
        flex: 1, height: 8, background: "#ede9df", borderRadius: 4, overflow: "hidden",
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

function GroupBlock({ bucket, sym }) {
  return (
    <div style={{
      padding: "10px 16px",
      borderTop: "1px solid #ede9df",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 4,
      }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: "#44403c" }}>
          {bucket.group.name}
        </span>
        <span style={{ fontWeight: 600, fontSize: 13, color: "#57534e" }}>
          {formatMoney(bucket.total_in_main)} {sym}
        </span>
      </div>
      {bucket.accounts.map(acc => (
        <AccountBlock key={acc.id} acc={acc} sym={sym} />
      ))}
    </div>
  );
}

function AccountBlock({ acc, sym }) {
  const balances = acc.balances || [];
  return (
    <div style={{
      marginTop: 6,
      paddingLeft: 4,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        fontSize: 13,
      }}>
        <span style={{ color: "#57534e", display: "flex", alignItems: "center", gap: 6 }}>
          {acc.icon && <span>{acc.icon}</span>}
          {acc.name}
        </span>
        {balances.length === 1 && (
          <span style={{ color: "#1c1917", fontWeight: 500 }}>
            {formatMoneyWithCurrency(balances[0].balance, balances[0].currency)}
          </span>
        )}
      </div>
      {balances.length > 1 && (
        <div style={{ marginTop: 2, marginLeft: 16 }}>
          {balances.map(b => (
            <div key={b.currency} style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 12, color: "#78716c", padding: "1px 0",
            }}>
              <span style={{ color: "#a8a29e" }}>{b.currency}</span>
              <span>{formatMoney(b.balance)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryBar({ name, icon, color, total, max, sym }) {
  const pct = max > 0 ? Math.min(100, (total / max) * 100) : 0;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(120px, 1fr) 2fr auto",
      gap: 10, alignItems: "center",
      fontSize: 13,
    }}>
      <span style={{
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        display: "flex", alignItems: "center", gap: 6, color: "#57534e",
      }}>
        {icon && <span>{icon}</span>}
        {name}
      </span>
      <div style={{
        height: 14, background: "#faf8f3", borderRadius: 3, overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: color || "#f59e0b",
          borderRadius: 3,
        }} />
      </div>
      <span style={{ color: "#57534e", minWidth: 80, textAlign: "right", fontWeight: 500 }}>
        {formatMoney(total)} {sym}
      </span>
    </div>
  );
}
