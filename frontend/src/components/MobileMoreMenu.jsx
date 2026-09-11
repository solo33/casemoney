import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import PwaInstallLink from "./PwaInstallLink";

const planning = [
  ["/budget", "Бюджет"], ["/planning", "Расписание"], ["/goals", "Цели"],
  ["/credits", "Кредиты"], ["/deposits", "Вклады"],
];
const records = [["/bank-drafts", "Черновики из банка"], ["/import", "Импорт"], ["/history", "История изменений"]];
const settings = [
  ["/settings/personal", "Персональные настройки"], ["/settings/categories", "Категории"],
  ["/settings/currencies", "Валюты"], ["/settings/automation", "Автоматизация"],
  ["/settings/billing", "Тариф и оплата"],
];
const help = [["/help", "Помощь"], ["/articles", "Статьи"], ["/about", "О программе"]];

function MenuLinks({ links, onClose }) {
  return links.map(([to, label]) => <NavLink key={to} to={to} onClick={onClose}>{label}<span aria-hidden="true">›</span></NavLink>);
}

export default function MobileMoreMenu({ hasFamilyPlan, isAdmin, onClose, onLogout }) {
  const { pathname } = useLocation();
  const dialog = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current.querySelector("button").focus();
    const onKey = event => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = [...dialog.current.querySelectorAll("a[href], button:not([disabled]), summary")].filter(el =>
        el.getClientRects().length && (!el.closest("details:not([open])") || el.matches("summary"))
      );
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const desktop = window.matchMedia("(min-width: 768px)");
    const onResize = event => { if (event.matches) onClose(); };
    desktop.addEventListener("change", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onResize);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  return <>
    <button type="button" className="nav-mobile-backdrop" aria-label="Закрыть меню" onClick={onClose} />
    <div ref={dialog} id="mobile-more-menu" className="nav-mobile-menu" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title">
      <div className="nav-mobile-sheet-head"><strong id="mobile-more-title">Ещё</strong><button type="button" onClick={onClose} className="btn-ghost" aria-label="Закрыть меню">×</button></div>
      {hasFamilyPlan && <section className="nav-mobile-group" aria-labelledby="mobile-family-title">
        <h2 id="mobile-family-title">Совместные финансы</h2>
        <MenuLinks links={[["/family", "Семья"], ["/shopping", "Списки покупок"]]} onClose={onClose} />
      </section>}
      {hasFamilyPlan && <section className="nav-mobile-group" aria-labelledby="mobile-planning-title">
        <h2 id="mobile-planning-title">Планирование</h2><MenuLinks links={planning} onClose={onClose} />
      </section>}
      <section className="nav-mobile-group" aria-labelledby="mobile-records-title">
        <h2 id="mobile-records-title">Работа с записями</h2>
        <MenuLinks links={hasFamilyPlan ? records : [...records, ["/shopping", "Списки покупок"]]} onClose={onClose} />
      </section>
      <details className="nav-mobile-group" open={pathname.startsWith("/settings/") || undefined}>
        <summary>Настройки</summary><MenuLinks links={settings} onClose={onClose} />
      </details>
      <details className="nav-mobile-group" open={help.some(([to]) => pathname.startsWith(to)) || pathname === "/admin" || undefined}>
        <summary>Помощь и приложение</summary><MenuLinks links={help} onClose={onClose} />
        <PwaInstallLink className="nav-mobile-install" />
        {isAdmin && <MenuLinks links={[["/admin", "Администрирование"]]} onClose={onClose} />}
        <button type="button" className="nav-mobile-logout" onClick={() => { onClose(); onLogout(); }}>Выйти</button>
      </details>
    </div>
  </>;
}
