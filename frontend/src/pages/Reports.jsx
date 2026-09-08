import FinanceAssistant from "../components/reports/FinanceAssistant";
import TrendChart from "../components/reports/TrendChart";
import CategoryPieChart from "../components/reports/CategoryPieChart";
import CategoryReport from "../components/reports/CategoryReport";

import AnalysisNav from "../components/AnalysisNav";
import ReportPeriodControls from "../components/ReportPeriodControls";
import { formatMoney } from "../utils/money";

import { useReportsController } from "../hooks/useReportsController";
import { StatCard } from "../components/reports/ReportsParts";

export default function Reports() {
  const { gran, setGran, anchor, setAnchor, setDrillCatId, expandedRows, setExpandedRows, breakdownType, setBreakdownType, trendMonths, setTrendMonths, includePlanned, setIncludePlanned, hasFamilyPlan, summary, insights, regularPayments, aiInsight, aiLoading, aiError, loading, error, label, breakdownLabel, breakdownGenitive, requestAiInsight, sym, drillRoot, pieData, barData, goToCategory } = useReportsController();
  return (
    <div className="page">
      <h1 style={{ margin: "0 0 12px" }}>Анализ</h1>
      <AnalysisNav />
      {hasFamilyPlan && (
        <label className="report-planned-toggle">
          <input
            type="checkbox"
            checked={includePlanned}
            onChange={event => setIncludePlanned(event.target.checked)}
          />
          Показать планируемые записи
        </label>
      )}

      <ReportPeriodControls gran={gran} anchor={anchor} onGranChange={setGran} onAnchorChange={setAnchor} />

      {/* Заголовок периода */}
      {summary && (
        <p style={{ color: "#7a8590", fontSize: 14, marginBottom: 20 }}>
          {label} · {summary.transactions_count} операций
        </p>
      )}

      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: "#c0432b" }}>{error}</p>}

      {summary && !loading && (
        <>
          {/* Карточки итогов */}
          <div className="report-stat-grid" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
            <StatCard label="Доходы" value={summary.total_income} color="#0f6a40" sign="+" sym={sym} />
            <StatCard label="Расходы" value={summary.total_expense} color="#a93421" sign="−" sym={sym} />
            <StatCard
              label="Сальдо"
              value={summary.net}
              color={summary.net >= 0 ? "#0f6a40" : "#a93421"}
              sign={summary.net >= 0 ? "+" : ""}
              sym={sym}
            />
          </div>

          {hasFamilyPlan && insights && (
            <FinanceAssistant insights={insights} aiLoading={aiLoading} requestAiInsight={requestAiInsight} aiError={aiError} aiInsight={aiInsight} />
          )}

          {hasFamilyPlan && regularPayments.length > 0 && (
            <section className="report-regular-card">
              <div><p className="finance-insights-eyebrow">ФИНАНСОВАЯ КАРТИНА</p><h2>Регулярные платежи и поступления</h2><p>Найдены по истории операций. Это подсказки: они не создают записи и не меняют план без вашего решения.</p></div>
              <div className="report-regular-grid">{regularPayments.map(item => <article key={item.key}>
                <div><strong>{item.description}</strong><span>{item.transaction_type === "expense" ? "Расход" : "Доход"} · {item.cadence} · {item.account_name}</span><small>Следующее ориентировочно {new Date(`${item.next_date}T12:00:00`).toLocaleDateString("ru-RU")}</small></div>
                <b className={item.transaction_type === "expense" ? "is-expense" : "is-income"}>{item.transaction_type === "expense" ? "−" : "+"}{formatMoney(item.amount)} {item.currency}</b>
              </article>)}</div>
            </section>
          )}

          {/* Графики */}
          <div className="report-chart-grid" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            <TrendChart trendMonths={trendMonths} setTrendMonths={setTrendMonths} barData={barData} sym={sym} />

            {/* Pie — выбранный тип операций по категориям с drill-down */}
            <CategoryPieChart drillRoot={drillRoot} breakdownLabel={breakdownLabel} label={label} setDrillCatId={setDrillCatId} pieData={pieData} breakdownGenitive={breakdownGenitive} sym={sym} />
          </div>

          {/* Таблица категорий с раскрывающимися подкатегориями */}
          <CategoryReport breakdownLabel={breakdownLabel} breakdownType={breakdownType} setBreakdownType={setBreakdownType} summary={summary} breakdownGenitive={breakdownGenitive} expandedRows={expandedRows} setExpandedRows={setExpandedRows} goToCategory={goToCategory} sym={sym} />
        </>
      )}
    </div>
  );
}
