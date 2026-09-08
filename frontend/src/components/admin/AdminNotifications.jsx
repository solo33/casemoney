import { useState, useEffect } from "react";

import api from "../../api/client";
import { uniqueUsers } from "../../utils/adminView";

export function NotificationsTab() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ user_id: "", title: "", message: "", link: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/api/admin/users", { params: { limit: 200, offset: 0 } })
      .then(response => setUsers(uniqueUsers(response.data.items)))
      .catch(() => setUsers([]));
  }, []);

  const send = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await api.post("/api/admin/notifications", {
        title: form.title.trim(),
        message: form.message.trim(),
        link: form.link.trim() || null,
        user_id: form.user_id ? Number(form.user_id) : null,
      });
      setResult(`Уведомление отправлено: ${response.data.recipients_count} получателей`);
      setForm(current => ({ ...current, title: "", message: "", link: "" }));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Не удалось отправить уведомление");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} style={{
      maxWidth: 720, background: "#fffdf7", border: "1px solid #e4ddcd",
      borderRadius: 10, padding: 18, display: "grid", gap: 12,
    }}>
      <div>
        <h3 style={{ margin: "0 0 4px" }}>Новое уведомление</h3>
        <p style={{ margin: 0, color: "#7a8590", fontSize: 13 }}>
          Выберите пользователя или оставьте «Всем пользователям».
        </p>
      </div>
      <label>
        <span style={{ display: "block", marginBottom: 5, fontSize: 13 }}>Получатель</span>
        <select value={form.user_id} onChange={event => setForm({ ...form, user_id: event.target.value })} style={{ width: "100%" }}>
          <option value="">Всем пользователям</option>
          {users.map(user => (
            <option key={user.id} value={user.id}>{user.username} — {user.email}</option>
          ))}
        </select>
      </label>
      <label>
        <span style={{ display: "block", marginBottom: 5, fontSize: 13 }}>Заголовок</span>
        <input required maxLength={160} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} style={{ width: "100%" }} />
      </label>
      <label>
        <span style={{ display: "block", marginBottom: 5, fontSize: 13 }}>Сообщение</span>
        <textarea required maxLength={4000} rows={5} value={form.message} onChange={event => setForm({ ...form, message: event.target.value })} style={{ width: "100%", resize: "vertical" }} />
      </label>
      <label>
        <span style={{ display: "block", marginBottom: 5, fontSize: 13 }}>Ссылка (необязательно)</span>
        <input placeholder="/goals или https://..." maxLength={500} value={form.link} onChange={event => setForm({ ...form, link: event.target.value })} style={{ width: "100%" }} />
      </label>
      {error && <div style={{ color: "#c0432b" }}>{typeof error === "string" ? error : "Проверьте заполнение полей"}</div>}
      {result && <div style={{ color: "#167a4a" }}>{result}</div>}
      <button type="submit" disabled={busy} style={{ justifySelf: "start" }}>
        {busy ? "Отправляем..." : "Отправить уведомление"}
      </button>
    </form>
  );
}
