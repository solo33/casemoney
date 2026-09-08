import BalanceWidget from "../components/home/BalanceWidget";
import AccountsWidget from "../components/home/AccountsWidget";
import RecordsWidget from "../components/home/RecordsWidget";
import BreakdownWidget from "../components/home/BreakdownWidget";
import "../styles/home.css";
import { requestSync } from "../services/syncStatus";

import QuickAddInline from "../components/QuickAddInline";
import { TxEditModal } from "../components/home/TransactionEditModal";
import { BalanceAdjustmentModal } from "../components/BalanceActions";
import { TX_ADDED_EVENT } from "../components/QuickAddFab";
import { useHomeController } from "../hooks/useHomeController";
import { Onboarding } from "../components/home/Onboarding";

import { ForecastWidget } from "../components/home/ForecastWidget";

import { BudgetWidget } from "../components/home/BudgetWidget";
import { GoalsWidget } from "../components/home/GoalsWidget";

export default function Home() {
  const { mainCurrency, user, navigate, dashboard, grouped, accountOptions, breakdownType, setBreakdownType, forecastDays, setForecastDays, balanceMode, setBalanceMode, recordsTab, setRecordsTab, categories, setCategories, editingTx, setEditingTx, adjustingBalance, setAdjustingBalance, selectedDate, setSelectedDate, widgetSettings, initialLoading, balanceLoading, trendLoading, accountsLoading, error, lastSyncedAt, isOnline, dismissOnboarding, updateWidgetCollapsed, isWidgetCollapsed, fetchAll, flatAccounts, fetchDay, handleDeleteTx, sym, byCurrency, dashboardBalancesHidden, toggleDashboardBalances, trendDesc, todayTx, dayLabel, recentlyChanged, totalBalance, breakdownItems, breakdownTotal, maxCatTotal, monthLabel, breakdownColor, breakdownWord, hasAccounts, hasTx, showOnboarding, goToCategory, goToAccount } = useHomeController();
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

      <div className="home-sync-status" role="status">
        <span className={`home-sync-status__dot ${isOnline ? "is-online" : "is-offline"}`} aria-hidden="true" />
        <span>
          {!isOnline
            ? "Нет сети · показываем данные на устройстве"
            : lastSyncedAt
              ? `Обновлено ${new Date(lastSyncedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
              : "Данные ещё не синхронизированы"}
        </span>
        {isOnline && <button type="button" className="home-sync-status__retry" onClick={() => { requestSync(); fetchAll(); }}>Обновить</button>}
      </div>

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
        {widgetSettings.balance.visible && <BalanceWidget widgetSettings={widgetSettings} updateWidgetCollapsed={updateWidgetCollapsed} isWidgetCollapsed={isWidgetCollapsed} dashboard={dashboard} balanceMode={balanceMode} setBalanceMode={setBalanceMode} toggleDashboardBalances={toggleDashboardBalances} dashboardBalancesHidden={dashboardBalancesHidden} balanceLoading={balanceLoading} totalBalance={totalBalance} mainCurrency={mainCurrency} forecastDays={forecastDays} byCurrency={byCurrency} trendLoading={trendLoading} trendDesc={trendDesc} sym={sym} />}

        {widgetSettings.forecast.visible && <ForecastWidget
          forecast={dashboard?.forecast}
          mainCurrency={mainCurrency}
          days={forecastDays}
          collapsed={isWidgetCollapsed("forecast")}
          loading={balanceLoading}
          onDaysChange={setForecastDays}
          onCollapseChange={collapsed => updateWidgetCollapsed("forecast", collapsed)}
          order={widgetSettings.forecast.order}
        />}

        {/* Accounts grouped — только учитываемые в балансе */}
        {widgetSettings.accounts.visible && <AccountsWidget widgetSettings={widgetSettings} updateWidgetCollapsed={updateWidgetCollapsed} isWidgetCollapsed={isWidgetCollapsed} accountsLoading={accountsLoading} grouped={grouped} user={user} sym={sym} goToAccount={goToAccount} setAdjustingBalance={setAdjustingBalance} />}
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
        {widgetSettings.records.visible && <RecordsWidget widgetSettings={widgetSettings} recordsTab={recordsTab} setRecordsTab={setRecordsTab} dayLabel={dayLabel} isWidgetCollapsed={isWidgetCollapsed} todayTx={todayTx} recentlyChanged={recentlyChanged} setEditingTx={setEditingTx} handleDeleteTx={handleDeleteTx} />}

        {/* Разбивка по категориям с переключателем Расходы/Доходы.
            На телефоне свёрнута по умолчанию — разворачивается по тапу. */}
        {widgetSettings.breakdown.visible && <BreakdownWidget widgetSettings={widgetSettings} isWidgetCollapsed={isWidgetCollapsed} updateWidgetCollapsed={updateWidgetCollapsed} breakdownWord={breakdownWord} monthLabel={monthLabel} breakdownType={breakdownType} setBreakdownType={setBreakdownType} initialLoading={initialLoading} breakdownItems={breakdownItems} maxCatTotal={maxCatTotal} sym={sym} goToCategory={goToCategory} breakdownColor={breakdownColor} breakdownTotal={breakdownTotal} />}

        {user?.family_access && widgetSettings.budget.visible && (
          <BudgetWidget
            collapsed={isWidgetCollapsed("budget")}
            order={widgetSettings.budget.order}
            onCollapseChange={collapsed => updateWidgetCollapsed("budget", collapsed)}
          />
        )}

        {user?.family_access && widgetSettings.goals.visible && (
          <GoalsWidget
            collapsed={isWidgetCollapsed("goals")}
            order={widgetSettings.goals.order}
            onCollapseChange={collapsed => updateWidgetCollapsed("goals", collapsed)}
          />
        )}
      </main>

      {editingTx && (
        <TxEditModal
          tx={editingTx}
          accounts={flatAccounts}
          accountGroups={accountOptions}
          categories={categories}
          canUseFamily={Boolean(user?.family_access)}
          onCategoryCreated={category => setCategories(current => [...current, category])}
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
