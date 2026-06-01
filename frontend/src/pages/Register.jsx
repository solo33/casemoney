import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { register, resendActivation, getPublicConfig } from "../api/auth";

export default function Register() {
  const [form, setForm] = useState({ email: "", username: "", password: "" });
  const [consent, setConsent] = useState(false);
  const [regEnabled, setRegEnabled] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);   // {email, smtp_configured}
  const [resendMsg, setResendMsg] = useState("");

  useEffect(() => {
    getPublicConfig()
      .then(r => setRegEnabled(r.data?.registration_enabled !== false))
      .catch(() => {});
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!consent) { setError("Подтвердите согласие с условиями"); return; }
    setError("");
    setBusy(true);
    try {
      const res = await register(form);
      setDone({ email: form.email, smtp_configured: res.data.smtp_configured });
    } catch (err) {
      setError(err.response?.data?.detail || "Ошибка регистрации");
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setResendMsg("");
    try {
      await resendActivation(done.email);
      setResendMsg("Письмо отправлено повторно (проверьте папку Спам)");
    } catch {
      setResendMsg("Ошибка отправки. Попробуйте позже.");
    }
  };

  return (
    <div style={{
      minHeight: "100svh",
      background: "linear-gradient(180deg, #f6f2e9 0%, #efe9db 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 12,
        padding: 32, maxWidth: 460, width: "100%",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          marginBottom: 20,
        }}>
          <img src="/icon.svg" alt="" width={32} height={32} style={{ borderRadius: 9 }} />
          <span style={{
            fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600, color: "#173a54",
          }}>
            CaseMoney
          </span>
        </div>

        {done ? (
          <>
            <div style={{ fontSize: 48, color: "#167a4a", textAlign: "center", marginBottom: 8 }}>📬</div>
            <h2 style={{
              fontFamily: "var(--serif)", fontWeight: 500, textAlign: "center",
              margin: "0 0 12px",
            }}>
              Проверьте почту
            </h2>
            <p style={{ color: "#515c68", textAlign: "center", margin: "0 0 16px" }}>
              Мы отправили письмо со ссылкой активации на<br />
              <strong style={{ color: "#1b2531" }}>{done.email}</strong>
            </p>
            <p style={{ fontSize: 13, color: "#7a8590", textAlign: "center", margin: "0 0 20px" }}>
              Перейдите по ссылке из письма, чтобы подтвердить email. Проверьте папку Спам.
            </p>

            {!done.smtp_configured && (
              <div style={{
                background: "#fefce8", border: "1px solid #facc15",
                borderRadius: 8, padding: 12, marginBottom: 16,
                fontSize: 12, color: "#7a8590",
              }}>
                <strong>Dev-режим:</strong> SMTP не настроен на сервере, письмо выведено в консоль backend.
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleResend} className="btn-ghost" style={{ flex: 1 }}>
                Отправить ещё раз
              </button>
              <Link
                to="/login"
                style={{
                  flex: 1, padding: "10px", borderRadius: 6,
                  background: "#173a54", color: "#fff", textDecoration: "none",
                  textAlign: "center", fontWeight: 500,
                }}
              >
                На страницу входа
              </Link>
            </div>
            {resendMsg && (
              <p style={{ fontSize: 12, color: "#515c68", marginTop: 10, textAlign: "center" }}>
                {resendMsg}
              </p>
            )}
          </>
        ) : !regEnabled ? (
          <>
            <h2 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 24, margin: "0 0 8px" }}>
              Регистрация закрыта
            </h2>
            <p style={{ color: "#7a8590", fontSize: 14, margin: "0 0 20px" }}>
              Сейчас регистрация новых пользователей недоступна. Попробуйте позже.
            </p>
            <Link to="/login" style={{
              display: "block", textAlign: "center", padding: "10px", borderRadius: 6,
              background: "#173a54", color: "#fff", textDecoration: "none", fontWeight: 500,
            }}>
              На страницу входа
            </Link>
          </>
        ) : (
          <>
            <h2 style={{
              fontFamily: "var(--serif)", fontWeight: 500,
              fontSize: 24, margin: "0 0 4px",
            }}>
              Регистрация
            </h2>
            <p style={{ color: "#7a8590", fontSize: 13, margin: "0 0 20px" }}>
              Бесплатный тариф: 3 счёта · 10 категорий · 1 валюта
            </p>

            <form onSubmit={handleSubmit}>
              <label style={lbl}>
                <span style={lblText}>Email</span>
                <input
                  name="email" type="email" required autoFocus
                  placeholder="your@email.com"
                  value={form.email}
                  onChange={handleChange}
                  style={{ width: "100%" }}
                />
              </label>
              <label style={lbl}>
                <span style={lblText}>Имя пользователя</span>
                <input
                  name="username" required
                  placeholder="Например, Андрей"
                  value={form.username}
                  onChange={handleChange}
                  style={{ width: "100%" }}
                />
              </label>
              <label style={lbl}>
                <span style={lblText}>Пароль</span>
                <input
                  name="password" type="password" required minLength={4}
                  placeholder="не менее 4 символов"
                  value={form.password}
                  onChange={handleChange}
                  style={{ width: "100%" }}
                />
              </label>

              <label style={{
                display: "flex", gap: 8, alignItems: "flex-start",
                fontSize: 12.5, color: "#57534e", margin: "0 0 14px", cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={e => setConsent(e.target.checked)}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <span>
                  Я принимаю{" "}
                  <Link to="/terms" target="_blank" style={{ color: "#9c7b3c" }}>Пользовательское соглашение</Link>
                  {" "}и даю согласие на обработку персональных данных согласно{" "}
                  <Link to="/privacy" target="_blank" style={{ color: "#9c7b3c" }}>Политике конфиденциальности</Link>.
                </span>
              </label>

              {error && (
                <p style={{ color: "#c0432b", fontSize: 13, margin: "0 0 12px" }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={busy || !consent}
                style={{ width: "100%", padding: "12px", fontSize: 15, fontWeight: 600, opacity: consent ? 1 : 0.6 }}
              >
                {busy ? "Регистрируем..." : "Зарегистрироваться"}
              </button>
            </form>

            <p style={{ marginTop: 16, fontSize: 13, color: "#7a8590", textAlign: "center" }}>
              Уже есть аккаунт?{" "}
              <Link to="/login" style={{ color: "#173a54", fontWeight: 500 }}>
                Войти
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const lbl = { display: "block", marginBottom: 14 };
const lblText = {
  display: "block",
  fontSize: 12, color: "#7a8590",
  marginBottom: 4, fontWeight: 500,
};
