import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { COMMON_CURRENCIES, currencySymbol } from "../utils/money";

const BASE_LINKS = [
  { to: "/home", label: "Главная" },
  { to: "/accounts", label: "Счета" },
  { to: "/categories", label: "Категории" },
  { to: "/currencies", label: "Валюты" },
  { to: "/transactions", label: "Транзакции" },
  { to: "/reports", label: "Отчёты" },
  { to: "/goals", label: "Цели" },
  { to: "/import", label: "Импорт" },
  { to: "/settings", label: "Настройки" },
];

export default function Nav() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { user, mainCurrency, updateMainCurrency, isPremium } = useUser();
  const links = user?.is_admin
    ? [...BASE_LINKS, { to: "/admin", label: "Админка", admin: true }]
    : BASE_LINKS;

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const handleChangeMainCurrency = async (e) => {
    const cur = e.target.value;
    try {
      await updateMainCurrency(cur);
    } catch (err) {
      alert("Не удалось обновить валюту: " + (err.response?.data?.detail || err.message));
    }
  };

  // Ссылки на navy-фоне: приглушённо-светлые, активная — белая на полупрозрачной заливке
  const linkStyle = ({ isActive }) => ({
    textDecoration: "none",
    fontWeight: isActive ? 600 : 400,
    color: isActive ? "#ffffff" : "rgba(244,241,232,0.70)",
    fontSize: 13.5,
    padding: "7px 11px",
    borderRadius: 6,
    background: isActive ? "rgba(255,255,255,0.11)" : "transparent",
    display: "block",
    whiteSpace: "nowrap",
    transition: "color 180ms, background 180ms",
  });

  const mobileLinkStyle = ({ isActive }) => ({
    ...linkStyle({ isActive }),
    fontSize: 15,
  });

  return (
    <nav style={{
      background: "#173a54",
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "0 20px",
        height: 58,
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}>
        {/* Бренд */}
        <NavLink to="/home" style={{
          display: "flex", alignItems: "center", gap: 9,
          marginRight: 16, textDecoration: "none", flexShrink: 0,
        }}>
          <img src="/icon.svg" alt="" width={32} height={32} style={{ borderRadius: 9 }} />
          <span style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600, fontSize: 19, letterSpacing: "-0.01em",
            color: "var(--text-on-dark)", whiteSpace: "nowrap",
          }}>
            CaseMoney
          </span>
        </NavLink>

        <div style={{ display: "flex", gap: 2, flex: 1 }} className="nav-links-desktop">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} style={linkStyle}>
              {l.label}
            </NavLink>
          ))}
        </div>

        {/* Plan badge */}
        <NavLink
          to="/settings"
          className="nav-settings-desktop"
          style={{
            marginLeft: "auto", fontSize: 11, padding: "4px 11px",
            textDecoration: "none",
            color: isPremium ? "var(--navy-deep)" : "rgba(244,241,232,0.82)",
            background: isPremium
              ? "linear-gradient(95deg, #9c7b3c, #c2a05a)"
              : "transparent",
            border: `1px solid ${isPremium ? "transparent" : "rgba(255,255,255,0.18)"}`,
            borderRadius: 999,
            whiteSpace: "nowrap",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
          title={isPremium ? "Premium активирован" : "Перейти на Premium"}
        >
          {isPremium ? "★ Premium" : "Free"}
        </NavLink>

        {/* Текущая основная валюта */}
        <NavLink
          to="/currencies"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12, padding: "5px 10px",
            textDecoration: "none", color: "rgba(244,241,232,0.82)",
            border: "1px solid rgba(255,255,255,0.18)", borderRadius: 6,
            whiteSpace: "nowrap",
          }}
          className="nav-settings-desktop"
          title="Управление валютами"
        >
          {currencySymbol(mainCurrency)} {mainCurrency}
        </NavLink>

        <button
          onClick={handleLogout}
          className="nav-settings-desktop"
          style={{
            fontSize: 13, padding: "5px 10px", whiteSpace: "nowrap",
            background: "transparent", border: "none",
            color: "rgba(244,241,232,0.72)",
          }}
        >
          Выйти
        </button>

        <button
          onClick={() => setOpen(o => !o)}
          className="nav-burger"
          style={{
            padding: "5px 10px", fontSize: 18, lineHeight: 1,
            background: "transparent", border: "1px solid rgba(255,255,255,0.18)",
            color: "var(--text-on-dark)",
          }}
          aria-label="Меню"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {open && (
        <div className="nav-mobile-menu" style={{
          background: "#0f293d",
          borderTop: "1px solid rgba(255,255,255,0.10)",
          padding: "8px 16px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}>
          {links.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              style={mobileLinkStyle}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </NavLink>
          ))}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 12, color: "rgba(244,241,232,0.6)" }}>Валюта:</span>
            <select value={mainCurrency} onChange={handleChangeMainCurrency} style={{ flex: 1 }}>
              {COMMON_CURRENCIES.map(c => (
                <option key={c} value={c}>{currencySymbol(c)} {c}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleLogout}
            style={{
              marginTop: 8, textAlign: "left",
              background: "transparent", border: "1px solid rgba(255,255,255,0.18)",
              color: "var(--text-on-dark)",
            }}
          >
            Выйти
          </button>
        </div>
      )}

      <style>{`
        .nav-links-desktop { display: flex !important; }
        .nav-settings-desktop { display: block !important; }
        .nav-burger { display: none !important; }
        @media (max-width: 720px) {
          .nav-links-desktop { display: none !important; }
          .nav-settings-desktop { display: none !important; }
          .nav-burger { display: block !important; }
        }
      `}</style>
    </nav>
  );
}
