import { useState, useEffect } from "react";

import api from "../../api/client";
import { budgetTotals } from "../../utils/budgetTotals";
import { Link } from "react-router-dom";
import { BrandProgress } from "../BrandProgress";
import { formatMoney } from "../../utils/money";
import { Card } from "./DashboardControls";
import { sectionTitle } from "../../utils/homeView";

export function BudgetWidget({ collapsed, order, onCollapseChange }) {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.get("/api/budgets/")
      .then(response => { if (active) setBudgets(response.data); })
      .catch(() => { if (active) setBudgets([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const totals = budgetTotals(budgets);
  const overspent = totals.spent > totals.limit;

  return (
    <Card className="home-budget-card" style={{ order }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h3 onClick={() => onCollapseChange(!collapsed)} style={{ ...sectionTitle, marginBottom: 0, cursor: "pointer", userSelect: "none" }}>
          <span style={{ display: "inline-block", width: 12, color: "#a6afb8", fontSize: 10 }}>{collapsed ? "▸" : "▾"}</span>
          Бюджет
        </h3>
        <Link to="/budget" style={{ color: "#9c7b3c", fontSize: 12, textDecoration: "none" }}>Открыть →</Link>
      </div>
      {!collapsed && (loading ? (
        <BrandProgress label="Обновляем бюджет…" size={28} style={{ minHeight: 64 }} />
      ) : budgets.length === 0 ? (
        <p style={{ margin: "12px 0 0", color: "#7a8590", fontSize: 13 }}>Лимитов пока нет. Задайте первый бюджет.</p>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
            <span>Потрачено</span>
            <strong style={{ color: overspent ? "#c0432b" : "#173a54" }}>{formatMoney(totals.spent)} / {formatMoney(totals.limit)}</strong>
          </div>
          <div className="budget-bar" style={{ marginTop: 7 }}><div style={{ width: `${Math.min(100, totals.limit ? totals.spent / totals.limit * 100 : 0)}%`, background: overspent ? "#c0432b" : undefined }} /></div>
          <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
            {budgets.slice(0, 4).map(item => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                <span>{item.category_icon} {item.category_name}</span>
                <span style={{ color: item.is_overspent ? "#c0432b" : "#617080" }}>{formatMoney(item.remaining)} {item.currency}</span>
              </div>
            ))}
          </div>
        </>
      ))}
    </Card>
  );
}
