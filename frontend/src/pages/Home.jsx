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

function isoToday() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
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
  const [recordsTab, setRecordsTab] = useState("today"); // today | changed
  const [categories, setCategories] = useState([]);
  const [editingTx, setEditingTx] = useState(null);
  const [selectedDate, setSelectedDate] = useState(isoToday()); // дата формы = дата ленты
  const [dayTx, setDayTx] = useState([]);                       // записи за выбранный день
  const [onbDismissed, setOnbDismissed] = useState(() => localStorage.getItem("cm_onb_done") === "1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dismissOnboarding = () => {
    localStorage.setItem("cm_onb_done", "1");
    setOnbDismissed(true);
  };

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
      const [d, g, s, c] = await Promise.all([
        api.get("/api/dashboard/"),
        api.get("/api/accounts/grouped"),
        api.get("/api/reports/summary", { params }),
        api.get("/api/categories/"),
      ]);
      setDashboard(d.data);
      setGrouped(g.data);
      setSummary(s.data);
      setCategories(c.data);
    } catch {
      setError("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [breakdownType]);

  const flatAccounts = useMemo(
    () => grouped.flatMap(b => b.accounts || []),
    [grouped]
  );

  // Обогащаем сырую транзакцию (из /api/transactions) именами счёта/категории
  const enrichTx = useCallback((t) => {
    const acc = flatAccounts.find(a => a.id === t.account_id);
    const cat = t.category_id ? categories.find(c => c.id === t.category_id) : null;
    return {
      ...t,
      account_name: acc?.name || "—",
      category_name: cat?.name || null,
      category_icon: cat?.icon || null,
    };
  }, [flatAccounts, categories]);

  // Записи за выбранный день
  const fetchDay = useCallback(async (dateStr) => {
    try {
      const res = await api.get("/api/transactions/", {
        params: { date_from: dateStr, date_to: dateStr, limit: 100 },
      });
      setDayTx(res.data.items || []);
    } catch {
      setDayTx([]);
    }
  }, []);

  const handleDeleteTx = async (tx) => {
    if (!confirm("Удалить запись?")) return;
    try {
      await api.delete(`/api/transactions/${tx.id}`);
      fetchAll();
      fetchDay(selectedDate);
    } catch (e) {
      setError(e.response?.data?.detail || "Не удалось удалить");
    }
  };

  useEffect(() => {
    const reload = () => { fetchAll(); fetchDay(selectedDate); };
    window.addEventListener(TX_ADDED_EVENT, reload);
    return () => window.removeEventListener(TX_ADDED_EVENT, reload);
  }, [fetchAll, fetchDay, selectedDate]);

  useEffect(() => { fetchAll(); }, [mainCurrency, fetchAll]);

  // Перезагрузка ленты дня при смене даты / валюты
  useEffect(() => { fetchDay(selectedDate); }, [selectedDate, mainCurrency, fetchDay]);

  const sym = currencySymbol(mainCurrency);

  // breakdown сумм по валютам по всем счетам (только учитываемые в балансе)
  const byCurrency = useMemo(() => aggregateByCurrency(grouped), [grouped]);

  // последние 3 месяца из dashboard.monthly_stats
  const last3 = useMemo(() => {
    if (!dashboard?.monthly_stats) return [];
    return dashboard.monthly_stats.slice(-3).reverse();
  }, [dashboard]);

  // записи за выбранный день (для правой колонки), обогащённые именами
  const todayTx = useMemo(() => dayTx.map(enrichTx), [dayTx, enrichTx]);

  // Заголовок таба = выбранная дата
  const dayLabel = useMemo(() => {
    const d = new Date(selectedDate + "T00:00:00");
    const today = isToday(d.toISOString());
    const human = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    return today ? `Записи за ${human}` : `Записи · ${human}`;
  }, [selectedDate]);

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

  // Онбординг: показываем, пока нет счетов или нет операций (и не скрыт вручную)
  const hasAccounts = flatAccounts.length > 0;
  const hasTx = (dashboard?.recent_transactions?.length || 0) > 0
    || monthIncome > 0 || monthExpense > 0
    || (dashboard?.recently_changed?.length || 0) > 0;
  const showOnboarding = !onbDismissed && (!hasAccounts || !hasTx);

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

      {showOnboarding && (
        <div style={{ gridColumn: "1 / -1" }}>
          <Onboarding
            hasAccounts={hasAccounts}
            hasTx={hasTx}
            onDismiss={dismissOnboarding}
            navigate={navigate}
          />
        </div>
      )}

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
        {/* Inline quick-add form — дата синхронизирована с лентой за день */}
        <QuickAddInline
          date={selectedDate}
          onDateChange={setSelectedDate}
          accountGroups={grouped}
          categories={categories}
        />

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ ...sectionTitle, marginBottom: 6 }}>Роадмап</h3>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1b2531", marginBottom: 4 }}>
                Следующие улучшения учета
              </div>
              <p style={{ margin: 0, color: "#7a8590", fontSize: 13, lineHeight: 1.45 }}>
                Импорт с подтверждением категорий, напоминания о платежах, автотранзакции и платежный календарь.
              </p>
            </div>
            <Link to="/roadmap" style={{ color: "#9c7b3c", fontSize: 13, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
              Смотреть →
            </Link>
          </div>
        </Card>

        {/* Записи: табы Сегодня / Последние изменённые */}
        <Card noPadding>
          <div style={{
            display: "flex", alignItems: "stretch",
            borderBottom: "1px solid #ece6d8",
          }}>
            <TabHead
              active={recordsTab === "today"}
              onClick={() => setRecordsTab("today")}
            >
              {dayLabel}
            </TabHead>
            <TabHead
              active={recordsTab === "changed"}
              onClick={() => setRecordsTab("changed")}
            >
              Последние изменённые
            </TabHead>
            <Link to="/transactions" style={{
              fontSize: 12, color: "#9c7b3c", textDecoration: "none",
              marginLeft: "auto", alignSelf: "center", padding: "0 16px",
            }}>
              Все записи →
            </Link>
          </div>

          {(() => {
            const list = recordsTab === "today" ? todayTx : recentlyChanged;
            if (list.length === 0) {
              return (
                <p style={{ padding: 24, textAlign: "center", color: "#a6afb8", fontSize: 14 }}>
                  {recordsTab === "today"
                    ? <>Нет записей за этот день. Выберите дату или добавьте операцию.</>
                    : "Пока нет записей."}
                </p>
              );
            }
            return (
              <div>
                {list.map((tx, idx) => (
                  <TxRow
                    key={tx.id}
                    tx={tx}
                    first={idx === 0}
                    showDate={recordsTab === "changed"}
                    onEdit={() => setEditingTx(tx)}
                    onDelete={() => handleDeleteTx(tx)}
                  />
                ))}
              </div>
            );
          })()}
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

      {editingTx && (
        <TxEditModal
          tx={editingTx}
          accounts={flatAccounts}
          categories={categories}
          onClose={() => setEditingTx(null)}
          onSaved={() => { setEditingTx(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

// =============== components ===============

function Onboarding({ hasAccounts, hasTx, onDismiss, navigate }) {
  const steps = [
    { done: hasAccounts, title: "Создайте первый счёт", desc: "Кошелёк, карта, вклад — что угодно", cta: "К счетам", to: "/accounts" },
    { done: hasTx, title: "Запишите операцию", desc: "Доход, расход или перевод — формой справа или кнопкой +", cta: null, to: null },
    { done: false, title: "Посмотрите анализ", desc: "Расходы по категориям, денежный поток, балансы", cta: "Открыть анализ", to: "/reports" },
  ];
  return (
    <div style={{
      background: "linear-gradient(100deg, #173a54, #0f293d)",
      color: "var(--text-on-dark)", borderRadius: 12, padding: 20,
      position: "relative",
    }}>
      <button
        type="button" onClick={onDismiss}
        style={{
          position: "absolute", top: 12, right: 12, background: "transparent",
          border: "none", color: "rgba(244,241,232,0.6)", fontSize: 18, cursor: "pointer",
        }}
        title="Скрыть"
      >×</button>
      <h2 style={{ fontFamily: "var(--font-display)", color: "#fff", margin: "0 0 4px", fontSize: 22 }}>
        Добро пожаловать в CaseMoney
      </h2>
      <p style={{ color: "rgba(244,241,232,0.8)", margin: "0 0 16px", fontSize: 14 }}>
        Три шага, чтобы начать вести учёт.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {steps.map((s, i) => (
          <div key={i} style={{
            background: "rgba(255,255,255,0.07)", borderRadius: 10, padding: 14,
            border: "1px solid rgba(255,255,255,0.12)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
                background: s.done ? "#167a4a" : "rgba(255,255,255,0.15)",
                color: "#fff", fontWeight: 700,
              }}>{s.done ? "✓" : i + 1}</span>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#fff" }}>{s.title}</span>
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(244,241,232,0.7)", marginBottom: s.cta ? 10 : 0 }}>
              {s.desc}
            </div>
            {s.cta && (
              <button
                type="button"
                onClick={() => navigate(s.to)}
                style={{
                  background: "#c2a05a", border: "none", color: "#0a1d2c",
                  fontWeight: 600, fontSize: 13, padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                }}
              >
                {s.cta}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TabHead({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "#fffdf7" : "transparent",
        border: "none",
        borderBottom: active ? "2px solid #173a54" : "2px solid transparent",
        color: active ? "#1b2531" : "#7a8590",
        fontWeight: active ? 700 : 500,
        fontSize: 13,
        padding: "12px 16px",
        cursor: "pointer",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

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

function TxRow({ tx, first, showDate, onEdit, onDelete }) {
  const dateStr = new Date(tx.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 16px",
        borderTop: first ? "none" : "1px solid #ece6d8",
      }}
      className="tx-row"
    >
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "#ece6d8", display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
      }}>
        {tx.category_icon || "💸"}
      </div>
      <div
        onClick={onEdit}
        style={{ flex: 1, minWidth: 0, cursor: onEdit ? "pointer" : "default" }}
        title={onEdit ? "Открыть для редактирования" : undefined}
      >
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
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onEdit}
          className="btn-ghost"
          style={{ padding: "3px 7px", fontSize: 12, border: "none", background: "transparent", color: "#7a8590" }}
          title="Изменить"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="btn-ghost"
          style={{ padding: "3px 7px", fontSize: 14, border: "none", background: "transparent", color: "#c0432b" }}
          title="Удалить"
        >
          ×
        </button>
      </div>
    </div>
  );
}

const TYPE_TABS = [
  { value: "expense", label: "Расход", color: "#c0432b" },
  { value: "transfer", label: "Перевод", color: "#2f6296" },
  { value: "income", label: "Доход", color: "#167a4a" },
];

function TxEditModal({ tx, accounts, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    amount: String(tx.amount),
    type: tx.type,
    currency: tx.currency,
    account_id: String(tx.account_id),
    category_id: tx.category_id ? String(tx.category_id) : "",
    to_account_id: tx.to_account_id ? String(tx.to_account_id) : "",
    description: tx.description || "",
    date: new Date(tx.date).toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const acc = accounts.find(a => String(a.id) === form.account_id);
  const accCurrencies = (acc?.balances || []).map(b => b.currency);
  const cats = form.type === "transfer"
    ? [] : categories.filter(c => c.type === form.type);

  const catLabel = (c) => {
    const p = c.parent_id ? categories.find(x => x.id === c.parent_id) : null;
    return p ? `${p.name} → ${c.name}` : c.name;
  };

  const save = async (e) => {
    e.preventDefault();
    if (form.type === "transfer") {
      if (!form.to_account_id) { setErr("Выберите счёт-получатель"); return; }
      if (String(form.to_account_id) === String(form.account_id)) {
        setErr("Счёт-источник и получатель совпадают"); return;
      }
    }
    setSaving(true);
    setErr(null);
    try {
      await api.patch(`/api/transactions/${tx.id}`, {
        amount: parseFloat(form.amount),
        type: form.type,
        currency: form.currency,
        account_id: parseInt(form.account_id),
        category_id: form.type === "transfer" || !form.category_id ? null : parseInt(form.category_id),
        to_account_id: form.type === "transfer" ? parseInt(form.to_account_id) : null,
        description: form.description || null,
        date: new Date(form.date).toISOString(),
      });
      onSaved();
    } catch (e2) {
      setErr(e2.response?.data?.detail || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,30,45,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 16,
      }}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={save}
        style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 12,
          padding: 20, width: "100%", maxWidth: 460, boxShadow: "0 20px 44px -16px rgba(15,30,45,0.4)",
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)" }}>Изменить запись</h3>

        <div style={{ display: "flex", gap: 6 }}>
          {TYPE_TABS.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, type: t.value, category_id: "" }))}
              style={{
                flex: 1, padding: "8px", border: "none", borderRadius: 6,
                background: form.type === t.value ? t.color : "#f6f2e9",
                color: form.type === t.value ? "#fff" : "#7a8590",
                fontWeight: form.type === t.value ? 700 : 500, cursor: "pointer", fontSize: 13,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number" step="0.01" min="0.01" value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            required style={{ flex: 1, textAlign: "right", fontWeight: 600, fontSize: 16 }}
          />
          <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={{ width: 90 }}>
            {(accCurrencies.length ? accCurrencies : [form.currency]).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} required>
          <option value="">{form.type === "transfer" ? "— Со счёта —" : "— Счёт —"}</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.icon ? `${a.icon} ` : ""}{a.name}</option>)}
        </select>

        {form.type === "transfer" ? (
          <select value={form.to_account_id} onChange={e => setForm({ ...form, to_account_id: e.target.value })} required>
            <option value="">— На счёт (получатель) —</option>
            {accounts.filter(a => String(a.id) !== String(form.account_id)).map(a => (
              <option key={a.id} value={a.id}>{a.icon ? `${a.icon} ` : ""}{a.name}</option>
            ))}
          </select>
        ) : (
          <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
            <option value="">— Без категории —</option>
            {cats.map(c => <option key={c.id} value={c.id}>{catLabel(c)}</option>)}
          </select>
        )}

        <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />

        <input
          placeholder="Примечание" value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
        />

        {err && <div style={{ color: "#c0432b", fontSize: 13 }}>{err}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn-ghost">Отмена</button>
          <button type="submit" disabled={saving}>{saving ? "Сохраняем..." : "Сохранить"}</button>
        </div>
      </form>
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
