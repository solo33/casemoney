import { BrandProgress } from "../BrandProgress";
import { useState } from "react";
import { isMobileViewport } from "../../utils/dashboardWidgets";
import { formatMoney } from "../../utils/money";
import { BalanceActionRow } from "../BalanceActions";

export function AccountLoadingStructure() {
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

export function GroupBlock({ bucket, sym, onAccountClick, onAdjustBalance, hideZeroBalances }) {
  // На телефоне группы свёрнуты по умолчанию — важен итог, детали по тапу
  const [collapsed, setCollapsed] = useState(isMobileViewport);
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
          {bucket.total_in_main == null ? "Нет курса" : `${formatMoney(bucket.total_in_main)} ${sym}`}
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
              hideZeroBalances={hideZeroBalances}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AccountBlock({ acc, onClick, onAdjustBalance, hideZeroBalances }) {
  const balances = (acc.balances || []).filter(balance => (
    !hideZeroBalances || Math.abs(Number(balance.balance || 0)) > 0.005
  ));
  if (hideZeroBalances && balances.length === 0) return null;
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
