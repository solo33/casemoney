import { Card, ToggleBtn } from "./DashboardControls";
import { sectionTitle } from "../../utils/homeView";

import { BrandProgress } from "../BrandProgress";
import { formatMoney } from "../../utils/money";
import { MonthBars } from "./MonthBars";

export default function BalanceWidget({ widgetSettings, updateWidgetCollapsed, isWidgetCollapsed, dashboard, balanceMode, setBalanceMode, toggleDashboardBalances, dashboardBalancesHidden, balanceLoading, totalBalance, mainCurrency, forecastDays, byCurrency, trendLoading, trendDesc, sym }) {
  return (
    <Card className="home-balance-card" data-tour="balance" style={{ order: widgetSettings.balance.order }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <h3 onClick={() => updateWidgetCollapsed("balance", !isWidgetCollapsed("balance"))} style={{ ...sectionTitle, marginBottom: 0, cursor: "pointer", userSelect: "none" }}>
              <span style={{ display: "inline-block", width: 12, color: "#a6afb8", fontSize: 10 }}>{isWidgetCollapsed("balance") ? "▸" : "▾"}</span>Баланс
            </h3>
            {!isWidgetCollapsed("balance") && (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {dashboard?.forecast && <div style={{ display: "flex", gap: 4 }} aria-label="Баланс: фактический или с учётом плана">
                  <ToggleBtn active={balanceMode === "actual"} onClick={() => setBalanceMode("actual")}>Факт</ToggleBtn>
                  <ToggleBtn active={balanceMode === "planned"} onClick={() => setBalanceMode("planned")}>С планом</ToggleBtn>
                </div>}
                <button type="button" className="btn-ghost balance-privacy-toggle" onClick={toggleDashboardBalances} title={dashboardBalancesHidden ? "Показать суммы" : "Скрыть суммы"} aria-label={dashboardBalancesHidden ? "Показать суммы" : "Скрыть суммы"}>{dashboardBalancesHidden ? "◉" : "◌"}</button>
              </div>
            )}
          </div>
          {!isWidgetCollapsed("balance") && <>
          <div className="money-hero tabular" style={{ fontSize: 34, color: "#1b2531", lineHeight: 1.05, marginTop: 10 }}>
            {balanceLoading || totalBalance == null ? (
              <BrandProgress label="Обновляем остатки…" size={38} style={{ minHeight: 40 }} />
            ) : dashboardBalancesHidden ? (
              <span aria-label="Сумма скрыта">••••••</span>
            ) : (
              <>{formatMoney(balanceMode === "planned" && dashboard?.forecast ? totalBalance + Number(dashboard.forecast.net || 0) : totalBalance)} <span style={{ fontSize: 16, color: "#a6afb8", fontWeight: 400 }}>{mainCurrency}</span></>
            )}
          </div>
          {balanceMode === "planned" && dashboard?.forecast && !balanceLoading && (
            <p style={{ margin: "2px 0 0", color: "#7a8590", fontSize: 12 }}>
              С учётом плановых операций на {forecastDays} дн. Остатки счетов не меняются, пока операция не проведена.
            </p>
          )}
          {!dashboardBalancesHidden && byCurrency.length > 0 && (
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
          </>}
        </Card>
  );
}
