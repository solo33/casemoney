import { Link, useLocation } from "react-router-dom";
import { useUser } from "../contexts/UserContext";

const tabs = [
  { to: "/settings/personal", label: "Персональные" },
  { to: "/settings/categories", label: "Категории" },
  { to: "/settings/currencies", label: "Валюты" },
  { to: "/settings/automation", label: "Автоматизация" },
  { to: "/settings/billing", label: "Тариф и оплата" },
  { to: "/settings/family", label: "Семья" },
];

export default function SettingsTabs() {
  const { pathname } = useLocation();
  const { user } = useUser();
  const visibleTabs = tabs.filter(
    tab => tab.to !== "/settings/family" || (user?.family_access && user?.preferred_mode === "family")
  );

  return (
    <div className="settings-tabs" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {visibleTabs.map(tab => {
        const active = pathname === tab.to;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            style={{
              padding: "8px 13px",
              borderRadius: 6,
              border: "1px solid #e4ddcd",
              background: active ? "#173a54" : "#fffdf7",
              color: active ? "#fff" : "#173a54",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
