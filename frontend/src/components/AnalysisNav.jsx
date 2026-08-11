import { NavLink } from "react-router-dom";
import { useUser } from "../contexts/UserContext";

// Субнавигация раздела «Анализ»: сводка + годовые отчёты в одном месте.
const TABS = [
  { to: "/reports", label: "Сводка", end: true },
  { to: "/reports/annual", label: "Денежный поток" },
  { to: "/reports/balances", label: "Годовые балансы" },
  { to: "/reports/yoy", label: "Год к году" },
];

export default function AnalysisNav() {
  const { user } = useUser();
  const tabs = TABS.filter(tab => !["/reports/balances", "/reports/yoy"].includes(tab.to) || user?.plan === "family");
  return (
    <div className="analysis-nav" style={{
      display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16,
      borderBottom: "1px solid #e4ddcd", paddingBottom: 10,
    }}>
      {tabs.map(t => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className="analysis-nav-link"
          style={({ isActive }) => ({
            padding: "6px 14px",
            borderRadius: 999,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: isActive ? 600 : 500,
            border: `1px solid ${isActive ? "#173a54" : "#e4ddcd"}`,
            background: isActive ? "#173a54" : "transparent",
            color: isActive ? "#fff" : "#515c68",
          })}
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
