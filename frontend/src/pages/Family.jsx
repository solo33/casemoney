import { Link, NavLink, Navigate, useLocation } from "react-router-dom";
import FamilyAnalytics from "../components/family/FamilyAnalytics";
import FamilySetup from "../components/family/FamilySetup";
import FamilySettings from "../components/family/FamilySettings";
import FamilyOverview from "../components/family/FamilyOverview";
import FamilyPurchases from "../components/family/FamilyPurchases";
import FamilySettlements from "../components/family/FamilySettlements";
import { useFamilyController } from "../hooks/useFamilyController";
import "../styles/family.css";

const sections = [
  { path: "", label: "Обзор" },
  { path: "/purchases", label: "Покупки" },
  { path: "/settlements", label: "Расчёты" },
  { path: "/statistics", label: "Статистика" },
];

export default function Family() {
  const controller = useFamilyController();
  const { pathname } = useLocation();
  const section = pathname.replace(/^\/family/, "").replace(/\/$/, "");
  const { state, loading, error, message, analyticsPeriod, setAnalyticsPeriod } = controller;
  if (![...sections.map(item => item.path), "/settings"].includes(section)) {
    return <Navigate to="/family" replace />;
  }
  return <main className="page family-page">
    <header className="family-page-heading">
      <div><h1>Семья</h1>{state.family && <p>{state.family.name} · {controller.roleLabel(state.family.current_user_role)}</p>}</div>
      {state.family && <NavLink className="family-settings-link" to="/family/settings">Настройки семьи</NavLink>}
    </header>
    {state.family && <nav className="family-section-nav" aria-label="Разделы семьи">
      {sections.map(item => <NavLink key={item.path} to={`/family${item.path}`} end>{item.label}</NavLink>)}
    </nav>}
    {error && <div className="family-error" role="alert">{error}</div>}
    {message && <div className="family-success" role="status">{message}</div>}
    {loading && <p role="status">Обновляем данные…</p>}
    {!loading && !state.family && <>
      <section className="family-intro"><strong>Общие покупки без раскрытия личных финансов</strong><p>В семейный отчёт попадают только операции, которые участник сам отметил как общие.</p></section>
      <FamilySetup {...controller} />
    </>}
    {state.family && <>
      {section !== "/settings" && <div className="family-period">
        <label>Период
          <input type="month" aria-label="Месяц семейного отчёта" value={`${analyticsPeriod.year}-${String(analyticsPeriod.month).padStart(2, "0")}`} onChange={event => {
            const [year, month] = event.target.value.split("-").map(Number);
            if (year > 0 && month >= 1 && month <= 12) setAnalyticsPeriod({ year, month });
          }} />
        </label>
        {section === "/settlements" && <span>Задолженность — за всё время. История — за выбранный месяц.</span>}
      </div>}
      <div aria-busy={loading}>
        {section === "" && <FamilyOverview controller={controller} />}
        {section === "/purchases" && <FamilyPurchases controller={controller} />}
        {section === "/settlements" && <FamilySettlements controller={controller} />}
        {section === "/statistics" && <FamilyAnalytics {...controller} />}
        {section === "/settings" && <FamilySettings controller={controller} />}
      </div>
      {section === "/settings" && <Link className="family-inline-link" to="/accounts">Перейти к счетам и балансам →</Link>}
    </>}
  </main>;
}
