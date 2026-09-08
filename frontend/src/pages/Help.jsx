
import { useUser } from "../contexts/UserContext";
import { useState } from "react";
import client from "../api/client";
import PublicPage, { card, paragraph } from "../components/PublicPage";

import { START_GUIDED_TOUR_EVENT } from "../components/GuidedTour";
import { SUPPORT_EMAIL } from "../config/contacts";
import { Link } from "react-router-dom";
import { faqSchema, helpSections } from "../utils/helpView";
import { PlanComparison } from "../components/help/HelpParts";

export default function Help() {
  const { user } = useUser();
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const handleSubmit = async event => {
    event.preventDefault(); setStatus("sending"); setError("");
    try {
      await client.post("/api/support/contact", form);
      setStatus("sent"); setForm({ name: "", email: "", message: "" });
    } catch (requestError) {
      setStatus("idle");
      setError(requestError.response?.data?.detail || "Не удалось отправить обращение. Напишите нам напрямую на почту.");
    }
  };

  return (
    <PublicPage
      title="Помощь по CaseMoney"
      description="Полное руководство по CaseMoney: счета, операции, автоматизация, импорт Т‑Банка, отчёты, семейные финансы, расписание, календарь, обязательства, депозиты, уведомления и PWA."
      path="/help"
      schema={faqSchema}
    >
      <div className="help-layout">
        <nav className="help-toc" aria-label="Разделы справки">
          <strong>Разделы</strong>
          {helpSections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
          <a href="#support">Поддержка</a>
        </nav>
        <div className="help-content">
          {user && <section style={card} className="help-section help-tour-card"><div><h2>Знакомство с CaseMoney</h2><p style={paragraph}>Пройдите короткое интерактивное обучение: оно покажет баланс, создание операций, счета и отчёты прямо в интерфейсе.</p></div><button type="button" onClick={() => window.dispatchEvent(new CustomEvent(START_GUIDED_TOUR_EVENT))}>Запустить обучение</button></section>}
          <PlanComparison />
          {helpSections.map(section => (
            <section key={section.id} id={section.id} style={card} className="help-section">
              <h2>{section.title}</h2>
              {section.items.map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p style={paragraph}>{answer}</p>
                </details>
              ))}
            </section>
          ))}

          <section id="support" style={card} className="help-section">
            <h2>Связаться с поддержкой</h2>
            <p style={paragraph}>Не нашли ответ? Напишите через форму или на <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Также доступны <Link to="/privacy">политика конфиденциальности</Link> и <Link to="/terms">пользовательское соглашение</Link>.</p>
            {status === "sent" ? <div className="help-success">Спасибо, сообщение отправлено. Мы ответим на указанный email.</div> : (
              <form onSubmit={handleSubmit} className="help-form">
                <label>Имя<input name="name" required minLength={2} maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
                <label>Email для ответа<input name="email" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
                <label className="help-form-wide">Сообщение<textarea name="message" required minLength={10} maxLength={4000} rows={5} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} /></label>
                {error && <div className="help-error help-form-wide">{error}</div>}
                <button type="submit" disabled={status === "sending"}>{status === "sending" ? "Отправляем…" : "Отправить"}</button>
              </form>
            )}
          </section>
        </div>
      </div>
    </PublicPage>
  );
}
