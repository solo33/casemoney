import { useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import usePlanningController from "../hooks/usePlanningController";
import PlanningOverview from "../components/planning/PlanningOverview";
import PlanningCreate from "../components/planning/PlanningCreate";
import PlanningTemplates from "../components/planning/PlanningTemplates";
import PlanningRecurring from "../components/planning/PlanningRecurring";
import PlanningPending from "../components/planning/PlanningPending";
import PlanningObligations from "../components/planning/PlanningObligations";
import FamilyPlanningSuggestions from "../components/planning/FamilyPlanningSuggestions";
import { PlanningActionModal, RecurringRunsModal } from "../components/planning/PlanningParts";
import "../styles/planning.css";

const sections = { calendar: "Календарь", schedules: "Расписания", templates: "Шаблоны", settings: "Настройки", create: "Новая операция" };
export default function Planning() {
  const controller = usePlanningController();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [selectedDate, setSelectedDate] = useState(null);
  const section = location.hash === "#family-suggestions" ? "schedules" : (sections[params.get("section")] ? params.get("section") : "calendar");
  const navigateSection = next => setParams({ section: next });
  if (controller.loading) return <div className="page">Загружаем расписание…</div>;
  return <main className="page planning-page">
    <header className="page-heading"><div><h1>Расписание</h1><p>Платежи, поступления и повторяющиеся операции.</p></div></header>
    <nav className="planning-tabs" aria-label="Разделы расписания">{Object.entries(sections).map(([key, label]) => <button type="button" key={key} aria-current={section === key ? "page" : undefined} onClick={() => navigateSection(key)}>{label}</button>)}</nav>
    {controller.error && <div className="form-error" role="status">{controller.error}</div>}
    {section === "calendar" && <><PlanningOverview {...controller} selectedDate={selectedDate} setSelectedDate={setSelectedDate} navigateSection={navigateSection} /><PlanningPending {...controller} /></>}
    {section === "schedules" && <><PlanningObligations obligations={controller.obligations} onDate={date => { controller.setCalendarMonth(new Date(`${date}T12:00:00`)); setSelectedDate(date); navigateSection("calendar"); }} /><PlanningRecurring {...controller} /><FamilyPlanningSuggestions onChanged={controller.load} /></>}
    {section === "templates" && <PlanningTemplates {...controller} applyTemplate={template => { controller.applyTemplate(template); navigateSection("create"); }} />}
    {section === "create" && <PlanningCreate {...controller} />}
    {section === "settings" && <section className="planning-templates-card"><h2>Подключение календаря</h2><p>Добавьте личную ссылку в Google, Яндекс или другой календарь.</p><div className="planning-calendar-feed"><div><strong>Личная ссылка iCalendar</strong><span>Не передавайте её другим: по ней видны названия и суммы плановых операций.</span></div><input readOnly value={controller.calendarUrl} aria-label="Ссылка календаря" /><button type="button" className="btn-secondary" onClick={controller.copyCalendarLink}>Копировать</button><button type="button" className="btn-ghost" onClick={controller.rotateCalendarLink}>Обновить ссылку</button></div></section>}
    {controller.modal && <PlanningActionModal modal={controller.modal} setModal={controller.setModal} onSaveTemplate={controller.submitTemplate} onSaveRecurring={controller.submitRecurring} />}
    {controller.recurringRuns && <RecurringRunsModal data={controller.recurringRuns} onClose={() => controller.setRecurringRuns(null)} />}
  </main>;
}
