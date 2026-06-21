import { useState } from "react";
import client from "../api/client";
import { SUPPORT_EMAIL } from "../config/contacts";
import { PublicPage, card, paragraph } from "./Articles";

const sections = [
  {
    title: "Как начать?",
    text: "Создайте счета, проверьте основную валюту, добавьте категории и внесите первую операцию. Если есть история данных, используйте импорт из CSV, XLSX или XLS.",
  },
  {
    title: "Какая структура импорта?",
    text: "Файл должен содержать колонки: date, account, category, amount, currency, description, transfer. Для CSV можно использовать разделитель точка с запятой или запятую. Для переводов укажите счет-получатель в колонке transfer.",
  },
  {
    title: "Как работают категории?",
    text: "Категории можно делать вложенными. Например, Продукты и Кафе могут жить внутри Еды, а отчеты покажут как общий итог, так и детализацию.",
  },
  {
    title: "Что такое переводы?",
    text: "Перевод перемещает деньги между двумя счетами. Он не считается доходом или расходом, но меняет балансы обоих счетов.",
  },
  {
    title: "Зачем нужны валюты?",
    text: "Валюта счета хранит исходную сумму операции, а основная валюта помогает собрать общий баланс и отчеты в одной единице.",
  },
  {
    title: "Можно ли выгрузить данные?",
    text: "Да. В настройках есть экспорт CSV. Он нужен для резервной копии и переноса данных.",
  },
  {
    title: "Как удалить данные?",
    text: "В персональных настройках есть опасная зона: можно удалить все операции, начать заново или удалить аккаунт полностью.",
  },
];

export default function Help() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("sending");
    setError("");
    try {
      await client.post("/api/support/contact", form);
      setStatus("sent");
      setForm({ name: "", email: "", message: "" });
    } catch (err) {
      setStatus("idle");
      setError(err.response?.data?.detail || "Не удалось отправить обращение. Напишите нам напрямую на почту.");
    }
  };

  return (
    <PublicPage title="Помощь">
      <div style={{ display: "grid", gap: 12 }}>
        <section style={card}>
          <h2 style={{ margin: "0 0 8px", fontSize: 19 }}>Связаться с поддержкой</h2>
          <p style={paragraph}>
            Напишите нам через форму или напрямую на{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={linkStyle}>{SUPPORT_EMAIL}</a>.
          </p>
          {status === "sent" ? (
            <div style={successStyle}>Спасибо, сообщение отправлено. Мы ответим на указанный email.</div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginTop: 14 }}>
              <label style={labelStyle}>
                Имя
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.name}
                  onChange={handleChange}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Email для ответа
                <input
                  name="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Сообщение
                <textarea
                  name="message"
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={5}
                  value={form.message}
                  onChange={handleChange}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </label>
              {error && <div style={errorStyle}>{error}</div>}
              <button type="submit" disabled={status === "sending"} style={buttonStyle}>
                {status === "sending" ? "Отправляем..." : "Отправить"}
              </button>
            </form>
          )}
        </section>
        {sections.map(section => (
          <section key={section.title} style={card}>
            <h2 style={{ margin: "0 0 8px", fontSize: 19 }}>{section.title}</h2>
            <p style={paragraph}>{section.text}</p>
          </section>
        ))}
      </div>
    </PublicPage>
  );
}

const labelStyle = {
  display: "grid",
  gap: 6,
  color: "#1b2531",
  fontSize: 14,
  fontWeight: 600,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d7cdb9",
  borderRadius: 8,
  padding: "11px 12px",
  background: "#fff",
  color: "#1b2531",
  font: "inherit",
};

const buttonStyle = {
  justifySelf: "start",
  border: 0,
  borderRadius: 8,
  padding: "11px 18px",
  background: "#173a54",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const linkStyle = { color: "#9c7b3c", fontWeight: 700 };

const successStyle = {
  marginTop: 12,
  padding: 12,
  borderRadius: 8,
  background: "#ecfdf3",
  color: "#166534",
  border: "1px solid #bbf7d0",
};

const errorStyle = {
  padding: 12,
  borderRadius: 8,
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
};
