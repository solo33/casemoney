import { Card, ToggleBtn } from "./DashboardControls";
import { sectionTitle } from "../../utils/homeView";

import { Link } from "react-router-dom";
import { BrandProgress } from "../BrandProgress";
import { CategoryBar } from "./CategoryBar";
import { formatMoney } from "../../utils/money";

export default function BreakdownWidget({ widgetSettings, isWidgetCollapsed, updateWidgetCollapsed, breakdownWord, monthLabel, breakdownType, setBreakdownType, initialLoading, breakdownItems, maxCatTotal, sym, goToCategory, breakdownColor, breakdownTotal }) {
  return (
    <Card className="home-breakdown-card" style={{ order: widgetSettings.breakdown.order }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isWidgetCollapsed("breakdown") ? 0 : 12, gap: 8, flexWrap: "wrap" }}>
            <h3
              onClick={() => {
                const next = !isWidgetCollapsed("breakdown");
                updateWidgetCollapsed("breakdown", next);
              }}
              style={{ ...sectionTitle, marginBottom: 0, cursor: "pointer", userSelect: "none" }}
            >
              <span style={{ display: "inline-block", width: 12, color: "#a6afb8", fontSize: 10 }}>
                {isWidgetCollapsed("breakdown") ? "▸" : "▾"}
              </span>
              {breakdownWord} за {monthLabel.toLowerCase()}
            </h3>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <ToggleBtn active={breakdownType === "expense"} onClick={() => setBreakdownType("expense")}>Расходы</ToggleBtn>
              <ToggleBtn active={breakdownType === "income"} onClick={() => setBreakdownType("income")}>Доходы</ToggleBtn>
              <Link to="/reports" style={{ fontSize: 12, color: "#9c7b3c", textDecoration: "none", marginLeft: 4 }}>
                Анализ →
              </Link>
            </div>
          </div>
          {isWidgetCollapsed("breakdown") ? null : initialLoading ? (
            <BrandProgress label="Обновляем категории…" size={34} style={{ minHeight: 72 }} />
          ) : breakdownItems.length === 0 ? (
            <p style={{ color: "#a6afb8", fontSize: 14 }}>
              Нет {breakdownType === "income" ? "доходов" : "расходов"} за этот месяц
            </p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {breakdownItems.slice(0, 12).map(c => (
                  <CategoryBar
                    key={String(c.category_id)}
                    name={c.category_name}
                    icon={c.category_icon}
                    color={c.category_color}
                    total={c.total}
                    max={maxCatTotal}
                    sym={sym}
                    onClick={() => goToCategory(c.category_id)}
                  />
                ))}
              </div>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginTop: 14, paddingTop: 12, borderTop: "1px solid #ece6d8",
                fontSize: 14, fontWeight: 600,
              }}>
                <span style={{ color: "#515c68" }}>Итого</span>
                <span style={{ color: breakdownColor }}>{formatMoney(breakdownTotal)} {sym}</span>
              </div>
            </>
          )}
        </Card>
  );
}
