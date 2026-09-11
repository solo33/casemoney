import MobileMoreMenu from "./MobileMoreMenu";
import { useCallback, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { currencySymbol } from "../utils/money";
import PwaInstallLink from "./PwaInstallLink";
import NotificationBell from "./NotificationBell";

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

const FAMILY_BUDGET_LINK = { to: "/budget", label: "Бюджет", familyOnly: true };
const FAMILY_PLAN_LINK = { to: "/planning", label: "Расписание", familyOnly: true };
const FAMILY_DEPOSITS_LINK = { to: "/deposits", label: "Вклады", familyOnly: true };
const FAMILY_CREDITS_LINK = { to: "/credits", label: "Кредиты", familyOnly: true };
// Планирование объединяет бюджет, разовые и повторяющиеся операции, вклады и кредиты.
const SCHEDULE_LINKS = [FAMILY_BUDGET_LINK, FAMILY_PLAN_LINK, FAMILY_DEPOSITS_LINK, FAMILY_CREDITS_LINK];

const RECORD_LINKS = [
  { to: "/transactions", label: "Все записи" },
  { to: "/import", label: "Импорт" },
  { to: "/history", label: "История" },
  { to: "/bank-drafts", label: "Черновики из банка" },
];

const HELP_LINKS = [
  { to: "/help", label: "Помощь" },
  { to: "/articles", label: "Статьи" },
  { to: "/about", label: "О программе" },
];

// Раздел «Настройки» — выпадающее меню
const SETTINGS_LINKS = [
  { to: "/settings/personal", label: "Персональные" },
  { to: "/settings/categories", label: "Категории" },
  { to: "/settings/currencies", label: "Валюты" },
  { to: "/settings/automation", label: "Автоматизация" },
  { to: "/settings/billing", label: "Тариф и оплата" },
];

export default function Nav() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const closeMobileMenu = useCallback(() => setOpen(false), []);
  const { pathname } = useLocation();
  const moreActive = !MOBILE_PRIMARY_LINKS.some(link => pathname === link.to || pathname.startsWith(`${link.to}/`));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => localStorage.getItem("casemoney:last-successful-sync"));
  const { user, mainCurrency } = useUser();
  const accountLabel = user?.username?.trim() || user?.email || "Аккаунт";
  // Personal остаётся упрощённым интерфейсом даже во время бесплатного
  // запуска. Переключение на Family не требует оплаты, пока она выключена.
  const hasFamilyPlan = Boolean(user?.family_access) && user?.preferred_mode === "family";
  const links = BASE_LINKS.filter(link => link.to !== "/goals" || hasFamilyPlan);

  useEffect(() => {
    const onSync = event => setLastSyncedAt(event.detail || localStorage.getItem("casemoney:last-successful-sync"));
    window.addEventListener("casemoney:last-successful-sync", onSync);
    return () => window.removeEventListener("casemoney:last-successful-sync", onSync);
  }, []);
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


  return (
    <nav className="app-nav" style={{
      background: "#173a54",
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      <div className="app-nav-inner" style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "0 20px",
        height: 58,
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}>
        {/* Бренд */}
        <NavLink to="/home" className="app-nav-brand" style={{
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

        <NavLink
          to="/settings/personal"
          className="nav-user-mobile"
          title={user?.email || accountLabel}
        >
          {accountLabel}
        </NavLink>

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
              <NavLink key={l.to} to={l.to} style={linkStyle} data-tour={l.to === "/accounts" ? "accounts" : l.to === "/reports" ? "reports" : undefined}>
                {l.label}
              </NavLink>
            )
          ))}

          {hasFamilyPlan && (
            <DropdownNav label="Планирование" links={SCHEDULE_LINKS} linkStyle={linkStyle} />
          )}

          {hasFamilyPlan ? <DropdownNav label="Семья" links={[{ to: "/family", label: "Обзор семьи" }, { to: "/family/purchases", label: "Общие покупки" }, { to: "/family/settlements", label: "Взаиморасчёты" }, { to: "/family/statistics", label: "Статистика" }, { to: "/family/settings", label: "Настройки семьи" }, { to: "/shopping", label: "Списки покупок" }]} linkStyle={linkStyle} /> : <NavLink to="/shopping" style={linkStyle}>Покупки</NavLink>}
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

        <div className="nav-settings-desktop">
          <DropdownNav
            label="?"
            links={HELP_LINKS}
            linkStyle={linkStyle}
            round
            footer={lastSyncedAt ? `Обновлено ${new Date(lastSyncedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : null}
          />
        </div>

        <NotificationBell />

        {/* Current account */}
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
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={user?.email || accountLabel}
        >
          {accountLabel}
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

      {open && <MobileMoreMenu hasFamilyPlan={hasFamilyPlan} isAdmin={user?.is_admin} onClose={closeMobileMenu} onLogout={handleLogout} />}

      <div className="mobile-bottom-nav" aria-label="Основная навигация">
        {MOBILE_PRIMARY_LINKS.map(link => (
          <NavLink key={link.to} to={link.to} end={link.to === "/home"}>
            <span aria-hidden="true">{link.icon}</span>
            <small>{link.label}</small>
          </NavLink>
        ))}
        <button type="button" onClick={() => setOpen(true)} aria-label="Открыть дополнительные разделы" aria-expanded={open} aria-controls="mobile-more-menu" className={moreActive || open ? "is-active" : undefined}>
          <span aria-hidden="true">•••</span>
          <small>Ещё</small>
        </button>
      </div>

      <style>{`
        .nav-links-desktop { display: flex !important; }
        .nav-settings-desktop { display: block !important; }
        .nav-user-mobile { display: none; }
        .mobile-bottom-nav { display: none; }
        @media (max-width: 767px) {
          .app-nav { padding-top: env(safe-area-inset-top, 0px); }
          .nav-links-desktop { display: none !important; }
          .nav-settings-desktop { display: none !important; }
          .app-nav-inner { padding: 0 6px 0 12px !important; }
          .nav-user-mobile {
            display: block; margin-left: auto; max-width: 96px; overflow: hidden;
            color: rgba(244,241,232,.82); font-size: 12px; font-weight: 600;
            text-decoration: none; text-overflow: ellipsis; white-space: nowrap;
          }
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
          .nav-mobile-group { margin: 8px 0; }
          .nav-mobile-group h2 { margin: 12px 11px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: #596572; }
          .nav-mobile-group a { padding: 10px 11px; text-decoration: none; font-size: 15px; gap: 12px; justify-content: space-between; border-bottom: 1px solid #eee8dc; overflow-wrap: anywhere; }
          .nav-mobile-group summary { min-height: 44px; padding: 11px; color: #173a54; cursor: pointer; font-weight: 600; }
          details.nav-mobile-group { border-top: 1px solid #e4ddcd; }
          .nav-mobile-logout { text-align: left; min-height: 44px; margin: 6px 0; background: transparent; color: #a83220; border: 1px solid #e4ddcd; }
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
          .mobile-bottom-nav button.is-active, .mobile-bottom-nav a[aria-current="page"] { color: #173a54; }
          .mobile-bottom-nav span { font-size: 21px; line-height: 1; }
          .mobile-bottom-nav small { font-size: 10.5px; font-weight: 600; }
        }
      `}</style>
    </nav>
  );
}

function DropdownNav({ label, links, linkStyle, round = false, footer = null }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={round ? "Помощь" : undefined}
        style={round ? {
          width: 36, height: 36, padding: 0, border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 999, background: "transparent", color: "#f4f1e8",
          fontSize: 15, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        } : {
          ...linkStyle({ isActive: false }),
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        {round ? label : <>{label} <span style={{ fontSize: 10 }}>▾</span></>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: round ? 0 : "auto", left: round ? "auto" : 0,
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
            {footer && <div style={{ borderTop: "1px solid #ece6d8", marginTop: 4, padding: "8px 12px", color: "#7a8590", fontSize: 11, whiteSpace: "nowrap" }}>{footer}</div>}
          </div>
        </>
      )}
    </div>
  );
}
