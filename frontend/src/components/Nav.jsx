import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { COMMON_CURRENCIES, currencySymbol } from "../utils/money";

const BASE_LINKS = [
  { to: "/home", label: "Главная" },
  { to: "/accounts", label: "Счета" },
  { to: "/transactions", label: "Записи" },
  { to: "/reports", label: "Анализ" },
  { to: "/goals", label: "Цели" },
];

// Раздел «Настройки» — выпадающее меню
const SETTINGS_LINKS = [
  { to: "/settings", label: "Настройки" },
  { to: "/categories", label: "Категории" },
  { to: "/currencies", label: "Валюты" },
  { to: "/history", label: "История" },
];

export default function Nav() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { user, mainCurrency, updateMainCurrency } = useUser();
  const links = BASE_LINKS;
  const settingsLinks = user?.is_admin
    ? [...SETTINGS_LINKS, { to: "/admin", label: "Админка" }]
    : SETTINGS_LINKS;

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

        <div style={{ display: "flex", gap: 2, flex: 1, alignItems: "center" }} className="nav-links-desktop">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} style={linkStyle}>
              {l.label}
            </NavLink>
          ))}

          {/* Настройки — выпадающее меню */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setSettingsOpen(o => !o)}
              style={{
                ...linkStyle({ isActive: false }),
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              Настройки <span style={{ fontSize: 10 }}>▾</span>
            </button>
            {settingsOpen && (
              <>
                <div
                  onClick={() => setSettingsOpen(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 90 }}
                />
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0,
                  background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 8,
                  boxShadow: "0 8px 20px rgba(15,30,45,0.18)", padding: 4, zIndex: 91,
                  minWidth: 160,
                }}>
                  {settingsLinks.map(l => (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      onClick={() => setSettingsOpen(false)}
                      style={({ isActive }) => ({
                        display: "block", padding: "8px 12px", borderRadius: 6,
                        textDecoration: "none", fontSize: 14, whiteSpace: "nowrap",
                        color: isActive ? "#173a54" : "#1b2531",
                        fontWeight: isActive ? 600 : 400,
                        background: isActive ? "#f6f2e9" : "transparent",
                      })}
                    >
                      {l.label}
                    </NavLink>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Plan badge */}
        <NavLink
          to="/settings"
          className="nav-settings-desktop"
          style={{
            marginLeft: "auto", fontSize: 11, padding: "4px 11px",
            textDecoration: "none",
            color: "rgba(244,241,232,0.82)",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 999,
            whiteSpace: "nowrap",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
          title="Тариф Personal"
        >
          Personal
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
          <div style={{
            fontSize: 11, color: "rgba(244,241,232,0.45)", textTransform: "uppercase",
            letterSpacing: 0.5, padding: "10px 11px 4px",
          }}>
            Настройки
          </div>
          {settingsLinks.map(l => (
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
