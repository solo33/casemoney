import { Link } from "react-router-dom";
import { BrandProgress } from "../BrandProgress";
import { formatMoney, currencySymbol, formatMoneyWithCurrency } from "../../utils/money";

import { Card, ToggleBtn } from "./DashboardControls";
import { sectionTitle } from "../../utils/homeView";

export function ForecastWidget({ forecast, mainCurrency, days, collapsed, loading, onDaysChange, onCollapseChange, order }) {
  const events = forecast?.events || [];
  const net = Number(forecast?.net || 0);
  const projected = forecast?.projected_balance;
  return (
    <Card className="home-forecast-card" style={{ order }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h3 onClick={() => onCollapseChange(!collapsed)} style={{ ...sectionTitle, marginBottom: 0, cursor: "pointer", userSelect: "none" }}>
          <span style={{ display: "inline-block", width: 12, color: "#a6afb8", fontSize: 10 }}>{collapsed ? "▸" : "▾"}</span>
          Ближайшие операции
        </h3>
        <Link to="/planning" style={{ color: "#9c7b3c", fontSize: 12, textDecoration: "none" }}>Все →</Link>
      </div>
      {!collapsed && (loading ? (
        <BrandProgress label="Считаем прогноз…" size={28} style={{ minHeight: 68 }} />
      ) : (
        <>
          <div className="forecast-periods" aria-label="Горизонт прогноза">
            {[7, 30, 90].map(value => <ToggleBtn key={value} active={days === value} onClick={() => onDaysChange(value)}>{value} дн.</ToggleBtn>)}
          </div>
          {projected != null && <div className="forecast-total">
            <span>Ожидаемый баланс</span>
            <strong>{formatMoney(projected)} {currencySymbol(mainCurrency)}</strong>
            <small style={{ color: net < 0 ? "#c0432b" : net > 0 ? "#167a4a" : "#7a8590" }}>
              {net > 0 ? "+" : ""}{formatMoney(net)} {currencySymbol(mainCurrency)} за период
            </small>
          </div>}
          {events.length === 0 ? (
            <p style={{ margin: "12px 0 0", color: "#7a8590", fontSize: 13 }}>На выбранный период плановых операций нет.</p>
          ) : (
            <div className="forecast-events">
              {events.slice(0, 4).map(event => {
                const sign = event.type === "income" ? "+" : event.type === "expense" ? "−" : "";
                return <div key={event.id} className="forecast-event">
                  <span>{new Date(event.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
                  <div><b>{event.description || event.category_name || (event.type === "income" ? "Плановый доход" : event.type === "expense" ? "Плановый расход" : "Перевод")}</b><small>{event.account_name}</small></div>
                  <strong style={{ color: event.type === "income" ? "#167a4a" : event.type === "expense" ? "#c0432b" : "#617080" }}>{sign}{formatMoneyWithCurrency(event.amount, event.currency)}</strong>
                </div>;
              })}
              {events.length > 4 && <Link className="forecast-more" to="/planning">Ещё {events.length - 4} →</Link>}
            </div>
          )}
        </>
      ))}

    </Card>
  );
}
