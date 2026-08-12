import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import { QUICK_ADD_OPEN_EVENT, TX_ADDED_EVENT } from "../components/QuickAddFab";
import QuickAddInline from "../components/QuickAddInline";
import { BrandProgress } from "../components/BrandProgress";
import AccountOptions from "../components/AccountOptions";
import CategoryPicker from "../components/CategoryPicker";
import {
  LOCAL_TRANSACTION_EVENT,
  listPendingTransactions,
  removeOfflineMutation,
} from "../services/offlineMutations";
import { BalanceActionRow, BalanceAdjustmentModal } from "../components/BalanceActions";
import { cachedAccountsAndCategories, saveReferenceData } from "../services/offlineReferenceData";
import { useUser } from "../contexts/UserContext";
import CreditWidget from "../components/CreditWidget";
import AmountInput from "../components/AmountInput";
import CurrencyField from "../components/CurrencyField";
import useTransferQuote from "../hooks/useTransferQuote";
import {
  currencySymbol,
  formatMoney,
  formatMoneyWithCurrency,
  sortCurrenciesRubFirst,
} from "../utils/money";

const TYPE_LABEL = { income: "Доход", expense: "Расход", transfer: "Перевод" };
const TYPE_COLOR = { income: "#167a4a", expense: "#c0432b", transfer: "#2f6296" };
const TYPE_ICON = { income: "↗", expense: "↘", transfer: "⇄" };

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

const IS_MOBILE = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;

export default function Home() {
  const { mainCurrency } = useUser();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [grouped, setGrouped] = useState([]);
  const [accountOptions, setAccountOptions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [breakdownType, setBreakdownType] = useState("expense"); // expense | income
  const flowMonth = new Date().getMonth() + 1;
  const flowYear = new Date().getFullYear();
  const [recordsTab, setRecordsTab] = useState("today"); // today | changed
  const [categories, setCategories] = useState([]);
  const [editingTx, setEditingTx] = useState(null);
  const [adjustingBalance, setAdjustingBalance] = useState(null);
  const [selectedDate, setSelectedDate] = useState(isoToday()); // дата формы = дата ленты
  const [dayTx, setDayTx] = useState([]);                       // записи за выбранный день
  const [onbDismissed, setOnbDismissed] = useState(() => localStorage.getItem("cm_onb_done") === "1");
  const [breakdownCollapsed, setBreakdownCollapsed] = useState(IS_MOBILE);
  const [initialLoading, setInitialLoading] = useState(true);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadVersion = useRef(0);

  const dismissOnboarding = () => {
    localStorage.setItem("cm_onb_done", "1");
    setOnbDismissed(true);
  };

  const fetchAll = useCallback(async () => {
    const version = ++loadVersion.current;
    const isCurrent = () => loadVersion.current === version;
    setError(null);
    setInitialLoading(true);
    setBalanceLoading(true);
    setTrendLoading(true);
    setAccountsLoading(true);

    const cached = cachedAccountsAndCategories();
    if (cached) {
      setAccountOptions(cached.accountGroups);
      setCategories(cached.categories);
    }
    if (navigator.onLine === false) {
      setInitialLoading(false);
      setBalanceLoading(false);
      setTrendLoading(false);
      setAccountsLoading(false);
      setError(cached ? null : "Для работы без сети сначала откройте приложение онлайн");
      return;
    }

    const params = {
      period: "month",
      year: flowYear,
      month: flowMonth,
      breakdown_type: breakdownType,
    };

    // Этап 1: данные правой колонки и лёгкие опции счетов — без конвертации.
    const firstStage = await Promise.allSettled([
      api.get("/api/reports/summary", { params }),
      api.get("/api/categories/"),
      api.get("/api/accounts/grouped", { params: { convert_balances: false } }),
    ]);
    if (!isCurrent()) return;
    if (firstStage[0].status === "fulfilled") setSummary(firstStage[0].value.data);
    const nextCategories = firstStage[1].status === "fulfilled"
      ? firstStage[1].value.data
      : cached?.categories;
    const nextAccountOptions = firstStage[2].status === "fulfilled"
      ? firstStage[2].value.data
      : cached?.accountGroups;
    if (nextCategories) setCategories(nextCategories);
    if (nextAccountOptions) setAccountOptions(nextAccountOptions);
    if (firstStage[1].status === "fulfilled" || firstStage[2].status === "fulfilled") {
      saveReferenceData({
        categories: nextCategories || [],
        accountGroups: nextAccountOptions || [],
      });
    }
    if (firstStage.some(result => result.status === "rejected")) {
      setError("Часть данных главной страницы пока недоступна");
    }
    setInitialLoading(false);

    // Если весь первый пакет недоступен, последующие запросы также не запускаем.
    // Это завершает индикаторы и оставляет доступными сохранённые счета/категории.
    if (firstStage.every(result => result.status === "rejected")) {
      setBalanceLoading(false);
      setTrendLoading(false);
      setAccountsLoading(false);
      return;
    }

    // Этап 2: общий баланс и последние изменённые записи.
    try {
      const d = await api.get("/api/dashboard/");
      if (isCurrent()) setDashboard(d.data);
    } catch {
      if (isCurrent()) setError("Не удалось обновить общий баланс");
    } finally {
      if (isCurrent()) setBalanceLoading(false);
    }

    // Этап 3: компактная статистика за последние месяцы.
    try {
      const t = await api.get("/api/reports/monthly-trend", { params: { months: 3 } });
      if (isCurrent()) setMonthlyTrend(t.data.points || []);
    } catch {
      if (isCurrent()) setError("Не удалось обновить статистику по месяцам");
    } finally {
      if (isCurrent()) setTrendLoading(false);
    }

    // Этап 4: полный список счетов с пересчётом в основную валюту.
    try {
      const g = await api.get("/api/accounts/grouped");
      if (isCurrent()) setGrouped(g.data);
    } catch {
      if (isCurrent()) setError("Не удалось обновить счета");
    } finally {
      if (isCurrent()) setAccountsLoading(false);
    }
  }, [breakdownType, flowMonth, flowYear]);

  const effectiveAccountGroups = grouped.length > 0 ? grouped : accountOptions;
  const flatAccounts = useMemo(
    () => effectiveAccountGroups.flatMap(b => b.accounts || []),
    [effectiveAccountGroups]
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
    const localItems = await listPendingTransactions(dateStr).catch(() => []);
    try {
      const res = await api.get("/api/transactions/", {
        params: { date_from: dateStr, date_to: dateStr, limit: 100 },
      });
      setDayTx([...localItems, ...(res.data.items || [])]);
    } catch {
      setDayTx(localItems);
    }
  }, []);

  const handleDeleteTx = async (tx) => {
    if (!confirm("Удалить запись?")) return;
    try {
      if (tx.pending_sync && tx.offline_mutation_id) {
        await removeOfflineMutation(tx.offline_mutation_id);
        setDayTx(current => current.filter(item => item.id !== tx.id));
        return;
      }
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

  useEffect(() => {
    const onLocalTransaction = (event) => {
      const transaction = event.detail?.transaction;
      if (!transaction) return;
      const localDate = String(transaction.date || "").slice(0, 10);
      if (localDate !== selectedDate) return;
      setDayTx(current => [transaction, ...current.filter(item => item.id !== transaction.id)]);
    };
    window.addEventListener(LOCAL_TRANSACTION_EVENT, onLocalTransaction);
    return () => window.removeEventListener(LOCAL_TRANSACTION_EVENT, onLocalTransaction);
  }, [selectedDate]);

  useEffect(() => { fetchAll(); }, [mainCurrency, fetchAll]);

  // Перезагрузка ленты дня при смене даты / валюты
  useEffect(() => { fetchDay(selectedDate); }, [selectedDate, mainCurrency, fetchDay]);

  const sym = currencySymbol(mainCurrency);

  // breakdown сумм по валютам по всем счетам (только учитываемые в балансе)
  const byCurrency = useMemo(() => aggregateByCurrency(grouped), [grouped]);

  // Гистограмма движения денег: 3 месяца, свежие сверху (текущий — «Этот месяц»)
  const trendDesc = useMemo(() => [...monthlyTrend].reverse(), [monthlyTrend]);

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

  const totalBalance = dashboard?.total_balance ?? null;
  const monthIncome = summary?.total_income ?? dashboard?.month_income ?? 0;
  const monthExpense = summary?.total_expense ?? dashboard?.month_expense ?? 0;
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
  // The guided tour now handles first launch globally. Keep this compact card
  // only as a fallback for an unfinished local setup.
  const showOnboarding = !initialLoading && !accountsLoading && !onbDismissed
    && localStorage.getItem("cm_inline_onb") === "show" && (!hasAccounts || !hasTx);

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
      gridTemplateColumns: "320px minmax(0, 800px)",
      gap: 20,
      alignItems: "start",
    }}>
      <style>{`
        @media (max-width: 900px) {
          .home-layout { grid-template-columns: 1fr !important; }
          .home-aside { order: -1; }
        }
        @media (max-width: 767px) {
          .home-layout { padding: 12px 12px 154px !important; gap: 12px !important; }
          .home-inline-add { display: none !important; }
          .home-aside, .home-main { display: contents !important; }
          .home-balance-card { order: 1; }
          .credit-widget { order: 2; }
          .home-records-card { order: 3; }
          .home-breakdown-card { order: 4; }
          .home-accounts-card { order: 5; }
        }
      `}</style>

      {error && (
        <div style={{
          gridColumn: "1 / -1", color: "#9a5a16", background: "#fff6df",
          border: "1px solid #e8cf98", borderRadius: 8, padding: "8px 12px", fontSize: 13,
        }}>
          {error}. Остальные разделы продолжают загружаться.
        </div>
      )}

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
      <aside className="home-aside" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Баланс + движение денег + статистика за 3 месяца — как в HomeMoney */}
        <Card className="home-balance-card" data-tour="balance">
          <h3 style={sectionTitle}>Баланс</h3>
          <div className="money-hero tabular" style={{ fontSize: 34, color: "#1b2531", lineHeight: 1.05 }}>
            {balanceLoading || totalBalance == null ? (
              <BrandProgress label="Обновляем остатки…" size={38} style={{ minHeight: 40 }} />
            ) : (
              <>{formatMoney(totalBalance)} <span style={{ fontSize: 16, color: "#a6afb8", fontWeight: 400 }}>{mainCurrency}</span></>
            )}
          </div>
          {byCurrency.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {byCurrency.map(c => (
                <div key={c.currency} style={{
                  display: "flex", justifyContent: "flex-end", gap: 6,
                  fontSize: 13, color: "#515c68", padding: "1px 0",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  <span>{formatMoney(c.balance, { maxFraction: 2 })}</span>
                  <span style={{ color: "#a6afb8" }}>{c.currency}</span>
                </div>
              ))}
            </div>
          )}

          {trendLoading ? (
            <>
              <div style={{ borderTop: "1px solid #ece6d8", margin: "14px 0 10px" }} />
              <BrandProgress label="Обновляем статистику по месяцам…" size={30} />
            </>
          ) : trendDesc.length > 0 && (
            <>
              <div style={{ borderTop: "1px solid #ece6d8", margin: "14px 0 10px" }} />
              <MonthBars points={trendDesc} sym={sym} />
            </>
          )}
        </Card>

        <CreditWidget />

        {/* Accounts grouped — только учитываемые в балансе */}
        <Card noPadding className="home-accounts-card">
          <div style={{ padding: "12px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 style={{ ...sectionTitle, marginBottom: 0 }}>Счета</h3>
            <Link to="/accounts" style={{ fontSize: 12, color: "#9c7b3c", textDecoration: "none" }}>
              Настроить →
            </Link>
          </div>
          {accountsLoading ? (
            <AccountLoadingStructure />
          ) : grouped.length === 0 ? (
            <p style={{ padding: "10px 16px 16px", color: "#a6afb8", fontSize: 13 }}>
              Нет счетов. <Link to="/accounts">Добавить</Link>
            </p>
          ) : (
            grouped
              .map(bucket => {
                const accounts = (bucket.accounts || [])
                  .filter(a => a.include_in_balance !== false);
                return {
                  ...bucket,
                  accounts,
                  total_in_main: accounts.reduce(
                    (sum, account) => sum + (account.total_in_main || 0),
                    0,
                  ),
                };
              })
              .filter(bucket => bucket.accounts.length > 0)
              .map(bucket => (
                <GroupBlock
                  key={bucket.group.id ?? "ungrouped"}
                  bucket={bucket}
                  sym={sym}
                  onAccountClick={goToAccount}
                  onAdjustBalance={(account, balance) => setAdjustingBalance({ account, balance })}
                />
              ))
          )}
        </Card>
      </aside>

      {/* ============== RIGHT MAIN ============== */}
      <main className="home-main" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Inline quick-add form — дата синхронизирована с лентой за день */}
        <div className="home-inline-add">
          <div data-tour="quick-add"><QuickAddInline
            date={selectedDate}
            onDateChange={setSelectedDate}
            accountGroups={accountOptions}
            categories={categories}
          /></div>
        </div>

        {/* Записи: табы Сегодня / Последние изменённые */}
        <Card noPadding className="home-records-card">
          <div style={{
            display: "flex", alignItems: "stretch", flexWrap: "wrap",
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

        {/* Разбивка по категориям с переключателем Расходы/Доходы.
            На телефоне свёрнута по умолчанию — разворачивается по тапу. */}
        <Card className="home-breakdown-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: breakdownCollapsed ? 0 : 12, gap: 8, flexWrap: "wrap" }}>
            <h3
              onClick={() => setBreakdownCollapsed(c => !c)}
              style={{ ...sectionTitle, marginBottom: 0, cursor: "pointer", userSelect: "none" }}
            >
              <span style={{ display: "inline-block", width: 12, color: "#a6afb8", fontSize: 10 }}>
                {breakdownCollapsed ? "▸" : "▾"}
              </span>
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
          {breakdownCollapsed ? null : initialLoading ? (
            <BrandProgress label="Обновляем категории…" size={34} style={{ minHeight: 72 }} />
          ) : breakdownItems.length === 0 ? (
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
          accountGroups={accountOptions}
          categories={categories}
          onClose={() => setEditingTx(null)}
          onSaved={() => {
            setEditingTx(null);
            fetchAll();
            fetchDay(selectedDate);
          }}
        />
      )}
      {adjustingBalance && (
        <BalanceAdjustmentModal
          account={adjustingBalance.account}
          balance={adjustingBalance.balance}
          onClose={() => setAdjustingBalance(null)}
          onSaved={() => {
            setAdjustingBalance(null);
            fetchAll();
            window.dispatchEvent(new CustomEvent(TX_ADDED_EVENT));
          }}
        />
      )}
    </div>
  );
}

// =============== components ===============

function Onboarding({ hasAccounts, hasTx, onDismiss, navigate }) {
  const [step, setStep] = useState(0);
  const steps = [
    { title: "Выберите основную валюту", desc: "Она будет использоваться для общего баланса и отчётов." },
    { title: "Проверьте начальные счета", desc: hasAccounts ? "Начальные счета уже созданы. Переименуйте или удалите ненужные." : "Создайте карту, наличные или другой первый счёт." },
    { title: "Добавьте данные", desc: "Начните вручную с одной записи или импортируйте историю из файла." },
    { title: "Готово к работе", desc: hasTx ? "Данные уже появились — можно смотреть баланс и анализ." : "После первой записи на главной появятся баланс и статистика." },
  ];
  const current = steps[step];
  const finish = () => onDismiss();
  const openQuickAdd = () => {
    onDismiss();
    window.dispatchEvent(new CustomEvent(QUICK_ADD_OPEN_EVENT));
  };
  return (
    <div className="onboarding-wizard" style={{
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
      <div style={{ color: "rgba(244,241,232,.65)", fontSize: 12, marginBottom: 8 }}>Шаг {step + 1} из {steps.length}</div>
      <div style={{ display: "flex", gap: 5, margin: "0 42px 16px 0" }}>
        {steps.map((_, index) => <span key={index} style={{ height: 4, flex: 1, borderRadius: 4, background: index <= step ? "#c2a05a" : "rgba(255,255,255,.18)" }} />)}
      </div>
      <h2 style={{ fontFamily: "var(--font-display)", color: "#fff", margin: "0 0 4px", fontSize: 22 }}>
        Добро пожаловать в CaseMoney
      </h2>
      <h3 style={{ color: "#fff", margin: "14px 0 6px" }}>{current.title}</h3>
      <p style={{ color: "rgba(244,241,232,0.8)", margin: "0 0 18px", fontSize: 14 }}>
        {current.desc}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {step === 0 && <button type="button" onClick={() => navigate("/settings/currencies")} className="btn-ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,.3)" }}>Настроить валюту</button>}
        {step === 1 && <button type="button" onClick={() => navigate("/accounts")} className="btn-ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,.3)" }}>Открыть счета</button>}
        {step === 2 && <>
          <button type="button" onClick={openQuickAdd} style={{ background: "#c2a05a", color: "#0a1d2c", borderColor: "#c2a05a" }}>Добавить вручную</button>
          <button type="button" onClick={() => navigate("/import")} className="btn-ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,.3)" }}>Импортировать</button>
        </>}
        {step > 0 && <button type="button" onClick={() => setStep(s => s - 1)} className="btn-link" style={{ color: "rgba(255,255,255,.75)" }}>Назад</button>}
        {step < steps.length - 1
          ? <button type="button" onClick={() => setStep(s => s + 1)} style={{ marginLeft: "auto", background: "#fff", color: "#173a54", borderColor: "#fff" }}>Продолжить</button>
          : <button type="button" onClick={finish} style={{ marginLeft: "auto", background: "#c2a05a", color: "#0a1d2c", borderColor: "#c2a05a" }}>Начать</button>}
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
        overflow: "hidden",
        textOverflow: "ellipsis",
        minWidth: 0,
        flex: "0 1 auto",
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

function Card({ children, style, noPadding, className = "", ...props }) {
  return (
    <div className={className} style={{
      background: "#fffdf7",
      border: "1px solid #e4ddcd",
      borderRadius: 10,
      padding: noPadding ? 0 : 16,
      ...style,
    }} {...props}>
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
  const dateStr = new Date(tx.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
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
        {tx.category_icon || TYPE_ICON[tx.type] || "•"}
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
        {tx.type === "expense" ? "−" : tx.type === "income" ? "+" : ""}{formatMoneyWithCurrency(tx.amount, tx.currency)}
      </div>
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        {tx.pending_sync && (
          <span style={{ color: tx.sync_error ? "#c0432b" : "#9a6d17", fontSize: 11, marginRight: 6 }}>
            {tx.sync_error ? "Ошибка синхронизации" : "На устройстве"}
          </span>
        )}
        <button
          type="button"
          onClick={onEdit}
          disabled={tx.pending_sync}
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
  { value: "expense", label: "↘ Расход", color: "#c0432b" },
  { value: "transfer", label: "⇄ Перевод", color: "#2f6296" },
  { value: "income", label: "↗ Доход", color: "#167a4a" },
];

function TxEditModal({ tx, accounts, accountGroups, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    amount: String(tx.amount),
    type: tx.type,
    currency: tx.currency,
    account_id: String(tx.account_id),
    category_id: tx.category_id ? String(tx.category_id) : "",
    to_account_id: tx.to_account_id ? String(tx.to_account_id) : "",
    to_amount: tx.to_amount != null ? String(tx.to_amount) : "",
    to_currency: tx.to_currency || "",
    description: tx.description || "",
    date: new Date(tx.date).toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const acc = accounts.find(a => String(a.id) === form.account_id);
  const accCurrencies = sortCurrenciesRubFirst(
    (acc?.balances || []).map(b => b.currency)
  );
  const targetAccount = accounts.find(a => String(a.id) === form.to_account_id);
  const targetCurrencies = sortCurrenciesRubFirst(
    (targetAccount?.balances || []).map(b => b.currency)
  );
  const sameTransferCurrency = form.type === "transfer"
    && Boolean(form.currency)
    && form.currency === form.to_currency;
  useEffect(() => {
    if (form.type !== "transfer" || !targetAccount) return;
    if (!targetCurrencies.includes(form.to_currency)) {
      setForm(current => ({ ...current, to_currency: targetCurrencies[0] || "", to_amount: "" }));
    }
  }, [form.type, targetAccount, targetCurrencies.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const applyTransferQuote = useCallback(toAmount => {
    setForm(current => current.to_amount === toAmount ? current : { ...current, to_amount: toAmount });
  }, []);
  const { loading: quoteLoading } = useTransferQuote({
    enabled: form.type === "transfer" && !sameTransferCurrency,
    amount: form.amount,
    fromCurrency: form.currency,
    toCurrency: form.to_currency,
    onQuote: applyTransferQuote,
  });
  const displayedRate = Number(form.amount) > 0 && Number(form.to_amount) > 0
    ? Number(form.to_amount) / Number(form.amount)
    : null;
  const cats = form.type === "transfer"
    ? [] : categories.filter(c => c.type === form.type);

  const save = async (e) => {
    e.preventDefault();
    if (form.type === "transfer") {
      if (!form.to_account_id) { setErr("Выберите счёт-получатель"); return; }
      if (String(form.to_account_id) === String(form.account_id)) {
        setErr("Счёт-источник и получатель совпадают"); return;
      }
      if (!form.to_currency) { setErr("Выберите валюту счёта-получателя"); return; }
      if (!sameTransferCurrency && !(parseFloat(form.to_amount) > 0)) { setErr("Введите сумму зачисления"); return; }
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
        to_amount: form.type === "transfer" ? parseFloat(sameTransferCurrency ? form.amount : form.to_amount) : null,
        to_currency: form.type === "transfer" ? form.to_currency : null,
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
          <AmountInput
            type="number" step="0.01" min="0.01" value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            required inputStyle={{ width: "100%", textAlign: "right", fontWeight: 600, fontSize: 16 }}
          />
          <CurrencyField currencies={accCurrencies.length ? accCurrencies : [form.currency]} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
        </div>

        <select value={form.account_id} onChange={e => {
          const account = accounts.find(item => String(item.id) === e.target.value);
          const currencies = sortCurrenciesRubFirst((account?.balances || []).map(balance => balance.currency));
          setForm({ ...form, account_id: e.target.value, currency: currencies[0] || form.currency });
        }} required>
          <option value="">{form.type === "transfer" ? "— Со счёта —" : "— Счёт —"}</option>
          <AccountOptions groups={accountGroups} includeIds={[form.account_id]} />
        </select>

        {form.type === "transfer" ? (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8 }}>
            <button type="button" className="transfer-swap-button" disabled={!form.to_account_id} onClick={() => {
              const creditedAmount = sameTransferCurrency ? form.amount : form.to_amount;
              setForm(current => ({ ...current, account_id: current.to_account_id, currency: current.to_currency, amount: creditedAmount || "", to_account_id: current.account_id, to_currency: current.currency, to_amount: current.amount || "" }));
            }} aria-label="Поменять счета отправки и получения местами" title="Поменять счета местами">⇄</button>
            <select value={form.to_account_id} onChange={e => setForm({ ...form, to_account_id: e.target.value, to_currency: "", to_amount: "" })} required>
              <option value="">— На счёт (получатель) —</option>
              <AccountOptions groups={accountGroups} excludeId={form.account_id} includeIds={[form.to_account_id]} />
            </select>
            {!sameTransferCurrency && <AmountInput type="number" step="0.01" min="0.01" value={form.to_amount} onChange={e => setForm({ ...form, to_amount: e.target.value })} placeholder={quoteLoading ? "Считаем…" : "Сумма зачисления"} required inputStyle={{ width: "100%" }} />}
            <CurrencyField currencies={targetCurrencies.length ? targetCurrencies : [form.to_currency].filter(Boolean)} value={form.to_currency} onChange={e => setForm({ ...form, to_currency: e.target.value, to_amount: "" })} />
            {form.currency && form.to_currency && form.currency !== form.to_currency && displayedRate && <small style={{ gridColumn: "1 / -1", color: "#7a8590" }}>1 {form.currency} = {displayedRate.toLocaleString("ru-RU", { maximumFractionDigits: 8 })} {form.to_currency}</small>}
          </div>
        ) : (
          <CategoryPicker
            categories={cats}
            value={form.category_id}
            onChange={category_id => setForm({ ...form, category_id })}
            placeholder="— Без категории —"
          />
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
    <div aria-label="Движение денег по месяцам">
      {points.map((p, idx) => {
        const now = new Date();
        const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const m = parseInt(p.month.split("-")[1], 10);
        const label = p.month === curKey
          ? "Этот месяц"
          : RU_MONTHS_FULL[m - 1].charAt(0).toUpperCase() + RU_MONTHS_FULL[m - 1].slice(1);
        return (
          <div key={p.month} style={{
            display: "grid",
            gridTemplateColumns: "68px minmax(56px, 1fr) auto",
            alignItems: "center",
            gap: 8,
            minHeight: 34,
            padding: "4px 0",
            borderBottom: idx === points.length - 1 ? "none" : "1px solid #f1ece2",
          }}>
            <span style={{ fontSize: 11, lineHeight: 1.2, color: "#7a8590" }}>
              {label}
            </span>
            <div style={{ display: "grid", gap: 5 }} aria-hidden="true">
              <MonthBar value={p.income} max={maxVal} color="#3d9a68" />
              <MonthBar value={p.expense} max={maxVal} color="#d66a54" />
            </div>
            <div className="tabular" style={{
              display: "grid", gap: 1, minWidth: 78,
              fontSize: 11, lineHeight: 1.15, textAlign: "right", fontWeight: 600,
            }}>
              <span style={{ color: "#167a4a" }}>+{formatMoney(p.income)} {sym}</span>
              <span style={{ color: "#c0432b" }}>−{formatMoney(p.expense)} {sym}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <div style={{
      height: 5, background: "#ece6d8", borderRadius: 999, overflow: "hidden",
    }}>
      <div style={{
        width: `${pct}%`, minWidth: pct > 0 ? 3 : 0,
        height: "100%", background: color, borderRadius: 999,
      }} />
    </div>
  );
}

function AccountLoadingStructure() {
  return (
    <div style={{ padding: "6px 12px 14px" }}>
      <BrandProgress
        label="Обновляем счета…"
        size={34}
        style={{ padding: "4px 4px 10px" }}
      />
      {["60%", "78%", "48%"].map((width, index) => (
        <div
          key={width}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 6px",
            borderTop: index === 0 ? "1px solid #ece6d8" : "none",
          }}
        >
          <span style={{
            width, height: 9, borderRadius: 999,
            background: "linear-gradient(90deg, #ece6d8, #f6f2e9)",
          }} />
          <span style={{
            width: 54, height: 9, borderRadius: 999, marginLeft: "auto",
            background: "#ece6d8",
          }} />
        </div>
      ))}
    </div>
  );
}

function GroupBlock({ bucket, sym, onAccountClick, onAdjustBalance }) {
  // На телефоне группы свёрнуты по умолчанию — важен итог, детали по тапу
  const [collapsed, setCollapsed] = useState(IS_MOBILE);
  return (
    <div style={{
      margin: "10px 12px 12px",
      border: "1px solid #ded3bc",
      borderRadius: 9,
      background: "#fff",
      overflow: "hidden",
      boxShadow: "0 4px 12px -12px rgba(23,58,84,0.45)",
    }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          padding: "9px 11px",
          cursor: "pointer", userSelect: "none",
          background: "#f1eadb",
          borderBottom: collapsed ? "none" : "1px solid #ded3bc",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color: "#173a54" }}>
          <span style={{ display: "inline-block", width: 15, color: "#9c7b3c", fontSize: 10 }}>
            {collapsed ? "▸" : "▾"}
          </span>
          {bucket.group.name}
        </span>
        <span style={{ fontWeight: 600, fontSize: 13, color: "#515c68" }}>
          {formatMoney(bucket.total_in_main)} {sym}
        </span>
      </div>
      {!collapsed && (
        <div style={{ margin: "8px 8px 9px 14px", paddingLeft: 10, borderLeft: "2px solid #d9c79f" }}>
          {bucket.accounts.map(acc => (
            <AccountBlock
              key={acc.id}
              acc={acc}
              onClick={() => onAccountClick(acc.id)}
              onAdjustBalance={balance => onAdjustBalance(acc, balance)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountBlock({ acc, onClick, onAdjustBalance }) {
  const balances = acc.balances || [];
  return (
    <div
      style={{
        padding: "7px 8px",
        cursor: onClick ? "pointer" : "default",
        borderRadius: 6,
        transition: "background 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "#f6f2e9"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      <div onClick={onClick} style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        fontSize: 13,
      }}>
        <span style={{ color: "#515c68", display: "flex", alignItems: "center", gap: 6 }}>
          {acc.icon && <span>{acc.icon}</span>}
          {acc.name}
        </span>
        <span style={{ color: "#a6afb8", fontSize: 11 }}>история</span>
      </div>
      <div style={{ marginTop: 2, marginLeft: 16 }}>
        {balances.map(balance => (
          <BalanceActionRow
            key={balance.currency}
            balance={balance}
            onAdjust={() => onAdjustBalance(balance)}
            onHistory={onClick}
          />
        ))}
      </div>
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
