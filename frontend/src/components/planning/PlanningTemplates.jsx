import { formatMoney } from "../../utils/money";

export default function PlanningTemplates({ templates, applyTemplate, removeTemplate }) {
  return <section className="planning-templates-card"><h2>Шаблоны операций</h2><p>Сохраните регулярный платёж один раз, затем подставляйте его в план за один клик.</p>{templates.length === 0 ? <span className="empty-state">Шаблонов пока нет.</span> : <div className="planning-templates">{templates.map(template => <div key={template.id}><button type="button" onClick={() => applyTemplate(template)}><strong>{template.name}</strong><span>{template.type === "income" ? "Доход" : "Расход"} · {formatMoney(template.amount)} {template.currency}</span></button><button className="btn-ghost danger" type="button" onClick={() => removeTemplate(template)}>×</button></div>)}</div>}</section>;
}
