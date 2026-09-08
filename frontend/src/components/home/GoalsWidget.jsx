import { useState, useEffect } from "react";

import api from "../../api/client";
import { Link } from "react-router-dom";
import { BrandProgress } from "../BrandProgress";
import { formatMoney } from "../../utils/money";
import { Card } from "./DashboardControls";
import { sectionTitle } from "../../utils/homeView";

export function GoalsWidget({ collapsed, order, onCollapseChange }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api.get("/api/goals/").then(response => { if (active) setGoals(response.data); }).catch(() => { if (active) setGoals([]); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <Card className="home-goals-card" style={{ order }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <h3 onClick={() => onCollapseChange(!collapsed)} style={{ ...sectionTitle, marginBottom: 0, cursor: "pointer", userSelect: "none" }}>
        <span style={{ display: "inline-block", width: 12, color: "#a6afb8", fontSize: 10 }}>{collapsed ? "▸" : "▾"}</span>Цели
      </h3>
      <Link to="/goals" style={{ color: "#9c7b3c", fontSize: 12, textDecoration: "none" }}>Открыть →</Link>
    </div>
    {!collapsed && (loading ? <BrandProgress label="Обновляем цели…" size={28} style={{ minHeight: 64 }} /> : goals.length === 0 ? (
      <p style={{ margin: "12px 0 0", color: "#7a8590", fontSize: 13 }}>Целей пока нет. Создайте первую цель.</p>
    ) : <div className="goal-widget-list">{goals.slice(0, 3).map(goal => <Link to="/goals" key={goal.id} className="goal-widget-row"><div><span>{goal.icon || "◎"} {goal.name}</span><small>{formatMoney(goal.current_amount)} из {formatMoney(goal.target_amount)} {goal.currency}</small></div><b>{formatMoney(goal.progress_percent, { maxFraction: 0 })}%</b><i><em style={{ width: `${Math.min(100, Math.max(0, goal.progress_percent))}%` }} /></i></Link>)}</div>)}

  </Card>;
}
