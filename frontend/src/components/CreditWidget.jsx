import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useUser } from "../contexts/UserContext";
import { formatMoneyWithCurrency } from "../utils/money";

const COLLAPSED_COUNT = 2;

export default function CreditWidget({ collapsed = false, onCollapseChange }) {
  const { user } = useUser();
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!user?.family_access || navigator.onLine === false) return;
    api.get("/api/calendar/events", { params: { days: 120 } })
      .then(response => setItems(response.data || []))
      .catch(() => setItems([]));
  }, [user?.family_access]);
  if (!user?.family_access || !items.length) return null;
  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT);
  const hiddenCount = items.length - visible.length;
  return <section className="credit-widget">
    <div><strong
      role={onCollapseChange ? "button" : undefined}
      tabIndex={onCollapseChange ? 0 : undefined}
      onClick={() => onCollapseChange?.(!collapsed)}
      onKeyDown={event => {
        if (onCollapseChange && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onCollapseChange(!collapsed);
        }
      }}
      className={onCollapseChange ? "credit-widget-title" : undefined}
    >{onCollapseChange && <span className="widget-chevron">{collapsed ? "▸" : "▾"}</span>}Ближайшие операции</strong><Link to="/planning">Все →</Link></div>
    {!collapsed && <>
    {visible.map(item => <Link to={item.source === "obligation" ? "/credits" : "/planning"} key={item.id} className={item.is_overdue ? "overdue" : ""}><span>{item.title}<small>{item.type === "income" ? "Доход" : "Расход"}{item.recurring ? " · повторяется" : ""} · {new Date(`${item.date}T12:00:00`).toLocaleDateString("ru-RU")}</small></span><strong>{item.amount ? formatMoneyWithCurrency(item.amount, item.currency) : "—"}</strong></Link>)}
    {hiddenCount > 0 && <button type="button" className="credit-widget-toggle" onClick={() => setExpanded(true)}>Ещё {hiddenCount} →</button>}
    {expanded && items.length > COLLAPSED_COUNT && <button type="button" className="credit-widget-toggle" onClick={() => setExpanded(false)}>Свернуть</button>}
    </>}
    <style>{`.credit-widget{background:#fffdf7;border:1px solid #e4ddcd;border-radius:12px;padding:13px 15px}.credit-widget>div,.credit-widget>a{display:flex;justify-content:space-between;align-items:center;gap:10px}.credit-widget>div{margin-bottom:7px}.credit-widget>div a{color:#9c7b3c;font-size:12px;text-decoration:none}.credit-widget>a{padding:8px 0;border-top:1px solid #eee8dc;text-decoration:none;color:#1b2531;font-size:13px}.credit-widget>a span{display:grid;gap:2px}.credit-widget small{color:#7a8590;font-size:11px}.credit-widget>a.overdue small{color:#a83220;font-weight:700}.credit-widget-toggle{width:100%;margin-top:7px;padding:6px 0;background:transparent;border:none;color:#9c7b3c;font-size:12px;cursor:pointer;text-align:center}.credit-widget-toggle:hover{color:#173a54}`}</style>
  </section>;
}
