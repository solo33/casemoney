import { Card } from "./DashboardControls";
import { sectionTitle } from "../../utils/homeView";
import { Link } from "react-router-dom";
import { AccountLoadingStructure, GroupBlock } from "./AccountGroups";

export default function AccountsWidget({ widgetSettings, updateWidgetCollapsed, isWidgetCollapsed, accountsLoading, grouped, user, sym, goToAccount, setAdjustingBalance }) {
  return (
    <Card noPadding className="home-accounts-card" style={{ order: widgetSettings.accounts.order }}>
          <div style={{ padding: "12px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 onClick={() => updateWidgetCollapsed("accounts", !isWidgetCollapsed("accounts"))} style={{ ...sectionTitle, marginBottom: 0, cursor: "pointer", userSelect: "none" }}>
              <span style={{ display: "inline-block", width: 12, color: "#a6afb8", fontSize: 10 }}>{isWidgetCollapsed("accounts") ? "▸" : "▾"}</span>Счета
            </h3>
            <Link to="/accounts" style={{ fontSize: 12, color: "#9c7b3c", textDecoration: "none" }}>
              Настроить →
            </Link>
          </div>
          {!isWidgetCollapsed("accounts") && <>{accountsLoading ? (
            <AccountLoadingStructure />
          ) : grouped.length === 0 ? (
            <p style={{ padding: "10px 16px 16px", color: "#a6afb8", fontSize: 13 }}>
              Нет счетов. <Link to="/accounts">Добавить</Link>
            </p>
          ) : (
            grouped
              .map(bucket => {
                const accounts = (bucket.accounts || [])
                  .filter(a => a.include_in_balance !== false)
                  .filter(account => !user?.hide_zero_balance_currencies || (account.balances || []).some(
                    balance => Math.abs(Number(balance.balance || 0)) > 0.005,
                  ));
                return {
                  ...bucket,
                  accounts,
                  total_in_main: accounts.some(account => account.total_in_main == null) ? null : accounts.reduce(
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
                  hideZeroBalances={Boolean(user?.hide_zero_balance_currencies)}
                />
              ))
          )}</>}
        </Card>
  );
}
