import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { currencySymbol } from "../utils/money";
import PwaInstallLink from "./PwaInstallLink";

const BASE_LINKS = [
  { to: "/home", label: "Главная" },
  { to: "/accounts", label: "Счета" },
  { to: "/transactions", label: "Записи" },
  { to: "/reports", label: "Анализ" },
  { to: "/goals", label: "Цели" },
];

const MOBILE_PRIMARY_LINKS = [
  { to: "/home", label: "Главная", icon: "⌂" },
  { to: "/transactions", label: "Записи", icon: "≡" },
  { to: "/reports", label: "Анализ", icon: "⌁" },
  { to: "/accounts", label: "Счета", icon: "▣" },
];

const RECORD_LINKS = [
  { to: "/transactions", label: "Все записи" },
  { to: "/import", label: "Импорт" },
  { to: "/history", label: "История" },
];

const MOBILE_MORE_LINKS = [
  { to: "/goals", label: "Цели" },
  { to: "/import", label: "Импорт" },
  { to: "/history", label: "История изменений" },
  { to: "/settings/personal", label: "Настройки" },
];

// Раздел «Настройки» — выпадающее меню
const SETTINGS_LINKS = [
  { to: "/settings/personal", label: "Персональные" },
  { to: "/settings/categories", label: "Категории" },
  { to: "/settings/currencies", label: "Валюты" },
];

export default function Nav() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState("more");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { user, mainCurrency } = useUser();
  const links = BASE_LINKS;
  const settingsLinks = user?.is_admin
    ? [...SETTINGS_LINKS, { to: "/admin", label: "Админка" }]
    : SETTINGS_LINKS;

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
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

        <button
          type="button"
          className="nav-mobile-burger"
          onClick={() => {
            setMobileMenu("burger");
            setOpen(true);
          }}
          aria-label="Открыть дополнительное меню"
          aria-expanded={open}
          aria-controls="mobile-more-menu"
        >
          <span aria-hidden="true">☰</span>
        </button>

        <div style={{ display: "flex", gap: 2, flex: 1, alignItems: "center" }} className="nav-links-desktop">
          {links.map(l => (
            l.to === "/transactions" ? (
              <DropdownNav
                key={l.to}
                label="Записи"
                links={RECORD_LINKS}
                linkStyle={linkStyle}
              />
            ) : (
              <NavLink key={l.to} to={l.to} style={linkStyle}>
                {l.label}
              </NavLink>
            )
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
                  <PwaInstallLink style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "8px 12px", borderTop: "1px solid #ece6d8",
                    marginTop: 4, color: "#9c7b3c", fontSize: 14,
                  }} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Plan badge */}
        <NavLink
          to="/settings/personal"
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
          to="/settings/currencies"
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

      </div>

      {open && (
        <>
          <button
            type="button"
            className="nav-mobile-backdrop"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
          />
          <div id="mobile-more-menu" className="nav-mobile-menu" role="dialog" aria-modal="true" aria-label="Дополнительное меню">
          <div className="nav-mobile-sheet-head">
            <strong>{mobileMenu === "burger" ? "Меню" : "Ещё"}</strong>
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost" aria-label="Закрыть меню">×</button>
          </div>
          {mobileMenu === "burger" ? (
            <>
              <PwaInstallLink className="nav-mobile-install" />
              <NavLink to="/help" style={mobileLinkStyle} onClick={() => setOpen(false)}>Помощь</NavLink>
              {user?.is_admin && (
                <NavLink to="/admin" style={mobileLinkStyle} onClick={() => setOpen(false)}>Админка</NavLink>
              )}
              <button
                onClick={handleLogout}
                style={{
                  marginTop: 8, textAlign: "left", minHeight: 44,
                  background: "transparent", border: "1px solid #e4ddcd",
                  color: "#c0432b",
                }}
              >
                Выйти
              </button>
            </>
          ) : (
            <>
              {MOBILE_MORE_LINKS.map(l => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  style={mobileLinkStyle}
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </NavLink>
              ))}
              <NavLink to="/settings/currencies" style={mobileLinkStyle} onClick={() => setOpen(false)}>
                Основная валюта <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)" }}>{currencySymbol(mainCurrency)} {mainCurrency}</span>
              </NavLink>
            </>
          )}
          </div>
        </>
      )}

      <div className="mobile-bottom-nav" aria-label="Основная навигация">
        {MOBILE_PRIMARY_LINKS.map(link => (
          <NavLink key={link.to} to={link.to} end={link.to === "/home"}>
            <span aria-hidden="true">{link.icon}</span>
            <small>{link.label}</small>
          </NavLink>
        ))}
        <button type="button" onClick={() => {
          setMobileMenu("more");
          setOpen(true);
        }} aria-label="Открыть дополнительные разделы">
          <span aria-hidden="true">•••</span>
          <small>Ещё</small>
        </button>
      </div>

      <style>{`
        .nav-links-desktop { display: flex !important; }
        .nav-settings-desktop { display: block !important; }
        .nav-mobile-burger { display: none; }
        .mobile-bottom-nav { display: none; }
        @media (max-width: 767px) {
          .nav-links-desktop { display: none !important; }
          .nav-settings-desktop { display: none !important; }
          nav > div:first-child { padding: 0 6px 0 12px !important; }
          .nav-mobile-burger {
            display: flex; margin-left: auto; width: 48px; height: 48px; padding: 0;
            align-items: center; justify-content: center; flex: 0 0 48px;
            border: 0; border-radius: 8px; background: transparent; color: #fff;
          }
          .nav-mobile-burger:hover, .nav-mobile-burger:focus { background: rgba(255,255,255,.1); }
          .nav-mobile-burger span { font-size: 25px; line-height: 1; }
          .nav-mobile-backdrop { position: fixed; inset: 0; z-index: 119; border: 0; border-radius: 0; background: rgba(10,29,44,.48); }
          .nav-mobile-menu {
            position: fixed; z-index: 120; left: 0; right: 0; bottom: 0;
            max-height: min(78svh, 680px); overflow-y: auto;
            padding: 10px 16px calc(84px + env(safe-area-inset-bottom, 0px));
            background: #fffdf7; border-radius: 20px 20px 0 0;
            box-shadow: 0 -12px 30px rgba(15,30,45,.2);
            display: flex; flex-direction: column; gap: 2px;
          }
          .nav-mobile-menu a { color: #1b2531 !important; background: transparent !important; min-height: 44px; display: flex !important; align-items: center; }
          .nav-mobile-menu a[aria-current="page"] { color: #173a54 !important; background: #f6f2e9 !important; }
          .nav-mobile-sheet-head { display: flex; align-items: center; justify-content: space-between; min-height: 48px; padding: 0 4px 4px 11px; }
          .nav-mobile-sheet-head strong { font-size: 18px; }
          .nav-mobile-sheet-head button { width: 44px; height: 44px; padding: 0; font-size: 20px; }
          .nav-mobile-install {
            min-height: 48px; padding: 10px 12px; margin-bottom: 4px;
            border: 1px solid #d9c79f !important; border-radius: 9px !important;
            background: #f1eadb !important; color: #173a54 !important;
            text-align: left; font-weight: 700;
          }
          .mobile-bottom-nav {
            display: grid; grid-template-columns: repeat(5, 1fr);
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 110;
            min-height: calc(62px + env(safe-area-inset-bottom, 0px));
            padding-bottom: env(safe-area-inset-bottom, 0px);
            background: rgba(255,253,247,.98); border-top: 1px solid #e4ddcd;
            box-shadow: 0 -5px 18px rgba(15,30,45,.08);
          }
          .mobile-bottom-nav a, .mobile-bottom-nav button {
            min-width: 0; min-height: 62px; padding: 7px 2px 5px; border: 0; border-radius: 0;
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
            background: transparent; color: #7a8590; text-decoration: none;
          }
          .mobile-bottom-nav a[aria-current="page"] { color: #173a54; }
          .mobile-bottom-nav span { font-size: 21px; line-height: 1; }
          .mobile-bottom-nav small { font-size: 10.5px; font-weight: 600; }
        }
      `}</style>
    </nav>
  );
}

function DropdownNav({ label, links, linkStyle }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          ...linkStyle({ isActive: false }),
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        {label} <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0,
            background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 8,
            boxShadow: "0 8px 20px rgba(15,30,45,0.18)", padding: 4, zIndex: 91,
            minWidth: 150,
          }}>
            {links.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
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
  );
}
