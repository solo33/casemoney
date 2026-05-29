import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { COMMON_CURRENCIES, currencySymbol } from "../utils/money";

const links = [
  { to: "/home", label: "Главная" },
  { to: "/accounts", label: "Счета" },
  { to: "/categories", label: "Категории" },
  { to: "/transactions", label: "Транзакции" },
  { to: "/reports", label: "Отчёты" },
];

export default function Nav() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { mainCurrency, updateMainCurrency, user } = useUser();

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

  const linkStyle = ({ isActive }) => ({
    textDecoration: "none",
    fontWeight: isActive ? "600" : "400",
    color: isActive ? "#6366f1" : "#334155",
    fontSize: 14,
    padding: "6px 10px",
    borderRadius: 6,
    background: isActive ? "rgba(99,102,241,0.08)" : "transparent",
    display: "block",
  });

  return (
    <nav style={{
      background: "#fff",
      borderBottom: "1px solid #e2e8f0",
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "0 16px",
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: "#6366f1", marginRight: 8, whiteSpace: "nowrap" }}>
          💰 CaseMoney
        </span>

        <div style={{ display: "flex", gap: 4, flex: 1 }} className="nav-links-desktop">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} style={linkStyle}>
              {l.label}
            </NavLink>
          ))}
        </div>

        {/* Settings: main currency */}
        <div style={{ position: "relative", marginLeft: "auto" }} className="nav-settings-desktop">
          <button
            type="button"
            onClick={() => setSettingsOpen(o => !o)}
            className="btn-ghost"
            style={{ fontSize: 13, padding: "5px 10px", whiteSpace: "nowrap" }}
            title="Основная валюта"
          >
            ⚙ {currencySymbol(mainCurrency)} {mainCurrency}
          </button>
          {settingsOpen && (
            <div style={{
              position: "absolute", right: 0, top: "100%", marginTop: 6,
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
              boxShadow: "0 8px 16px rgba(0,0,0,0.1)", padding: 12, minWidth: 200,
              zIndex: 110,
            }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
                Основная валюта
              </div>
              <select
                value={mainCurrency}
                onChange={handleChangeMainCurrency}
                style={{ width: "100%" }}
              >
                {COMMON_CURRENCIES.map(c => (
                  <option key={c} value={c}>{currencySymbol(c)} {c}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
                Все суммы в дашбордах конвертируются по текущему курсу.
              </div>
              {user && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 10, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
                  {user.username} · {user.email}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="btn-ghost"
          style={{ fontSize: 13, padding: "5px 12px", whiteSpace: "nowrap" }}
        >
          Выйти
        </button>

        <button
          onClick={() => setOpen(o => !o)}
          className="btn-ghost nav-burger"
          style={{ padding: "5px 10px", fontSize: 18, lineHeight: 1 }}
          aria-label="Меню"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {open && (
        <div className="nav-mobile-menu" style={{
          background: "#fff",
          borderTop: "1px solid #e2e8f0",
          padding: "8px 16px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}>
          {links.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              style={linkStyle}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </NavLink>
          ))}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Валюта:</span>
            <select value={mainCurrency} onChange={handleChangeMainCurrency} style={{ flex: 1 }}>
              {COMMON_CURRENCIES.map(c => (
                <option key={c} value={c}>{currencySymbol(c)} {c}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleLogout}
            className="btn-ghost"
            style={{ marginTop: 8, textAlign: "left" }}
          >
            Выйти
          </button>
        </div>
      )}

      <style>{`
        .nav-links-desktop { display: flex !important; }
        .nav-settings-desktop { display: block !important; }
        .nav-burger { display: none !important; }
        @media (max-width: 600px) {
          .nav-links-desktop { display: none !important; }
          .nav-settings-desktop { display: none !important; }
          .nav-burger { display: block !important; }
        }
      `}</style>
    </nav>
  );
}
