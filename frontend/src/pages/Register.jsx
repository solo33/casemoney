import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register, verifyCode, getPublicConfig } from "../api/auth";
import { DEMO_SESSION_FLAG, REAL_LOGIN_FLAG } from "./Login";

function markRealLogin(token) {
  localStorage.setItem("token", token);
  localStorage.removeItem(DEMO_SESSION_FLAG);
  localStorage.setItem(REAL_LOGIN_FLAG, "1");
}

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", username: "", password: "", preferred_mode: "personal" });
  const [consent, setConsent] = useState(false);
  const [regEnabled, setRegEnabled] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("form");      // form | code
  const [smtpOk, setSmtpOk] = useState(true);
  const [code, setCode] = useState("");
  const [info, setInfo] = useState("");

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
      setSmtpOk(res.data.smtp_configured);
      if (res.data.access_token) {
        markRealLogin(res.data.access_token);
        navigate("/home");
        return;
      }
      if (res.data.requires_code) {
        setStep("code");
        setInfo("");
      } else {
        // подтверждение email отключено админом — аккаунт создан сразу
        navigate("/login");
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Ошибка регистрации");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await verifyCode(form.email, code.trim());
      markRealLogin(res.data.access_token);
      navigate("/home");
    } catch (err) {
      setError(err.response?.data?.detail || "Неверный код");
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError(""); setInfo("");
    try {
      await register(form);
      setInfo("Код отправлен повторно. Проверьте почту (и папку Спам).");
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось отправить код");
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
          <span style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600, color: "#173a54" }}>
            CaseMoney
          </span>
        </div>

        {step === "code" ? (
          <>
            <h2 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 24, margin: "0 0 6px" }}>
              Введите код
            </h2>
            <p style={{ color: "#515c68", fontSize: 14, margin: "0 0 16px" }}>
              Мы отправили 6-значный код на <strong style={{ color: "#1b2531" }}>{form.email}</strong>.
              Код действителен 15 минут.
            </p>

            {!smtpOk && (
              <div style={{
                background: "#fefce8", border: "1px solid #facc15", borderRadius: 8,
                padding: 12, marginBottom: 16, fontSize: 12, color: "#7a8590",
              }}>
                <strong>Dev-режим:</strong> SMTP не настроен — код выведен в консоль backend.
              </div>
            )}

            <form onSubmit={handleVerify}>
              <input
                inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus
                placeholder="______"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                style={{
                  width: "100%", textAlign: "center", fontSize: 28, letterSpacing: 8,
                  fontWeight: 700, padding: "12px", marginBottom: 14,
                }}
              />
              {error && <p style={{ color: "#c0432b", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
              {info && <p style={{ color: "#167a4a", fontSize: 13, margin: "0 0 12px" }}>{info}</p>}
              <button
                type="submit" disabled={busy || code.length < 6}
                style={{ width: "100%", padding: "12px", fontSize: 15, fontWeight: 600, opacity: code.length < 6 ? 0.6 : 1 }}
              >
                {busy ? "Проверяем..." : "Подтвердить"}
              </button>
            </form>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 13 }}>
              <button onClick={handleResend} className="btn-link" style={{ padding: 0 }}>
                Отправить код заново
              </button>
              <button onClick={() => { setStep("form"); setCode(""); setError(""); }} className="btn-link" style={{ padding: 0 }}>
                Изменить email
              </button>
            </div>
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
            <h2 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 24, margin: "0 0 4px" }}>
              Регистрация
            </h2>
            <p style={{ color: "#7a8590", fontSize: 13, margin: "0 0 14px" }}>
              Выберите формат: его можно поменять в настройках в любой момент.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
              <ModeOption active={form.preferred_mode === "personal"} title="Personal" text="Упрощённый личный учёт" onClick={() => setForm({ ...form, preferred_mode: "personal" })} />
              <ModeOption active={form.preferred_mode === "family"} title="Family" text="Семейные финансы и планы" onClick={() => setForm({ ...form, preferred_mode: "family" })} />
            </div>

            <div style={{
              background: "#f6f2e9",
              border: "1px solid #e4ddcd",
              borderRadius: 10,
              padding: 14,
              marginBottom: 18,
            }}>
              <div style={{ color: "#9c7b3c", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Больше порядка с первого дня
              </div>
              <p style={{ margin: "6px 0 0", color: "#515c68", fontSize: 13, lineHeight: 1.5 }}>
                Начните с обычного учета, а дальше подключайте импорт CSV/Excel, отчеты и роадмап будущих функций.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <label style={lbl}>
                <span style={lblText}>Email</span>
                <input
                  name="email" type="email" required autoFocus
                  placeholder="your@email.com"
                  value={form.email} onChange={handleChange}
                  style={{ width: "100%" }}
                />
              </label>
              <label style={lbl}>
                <span style={lblText}>Имя пользователя</span>
                <input
                  name="username" required
                  placeholder="Например, Андрей"
                  value={form.username} onChange={handleChange}
                  style={{ width: "100%" }}
                />
              </label>
              <label style={lbl}>
                <span style={lblText}>Пароль</span>
                <input
                  name="password" type="password" required minLength={4}
                  placeholder="не менее 4 символов"
                  value={form.password} onChange={handleChange}
                  style={{ width: "100%" }}
                />
              </label>

              <label style={{
                display: "flex", gap: 8, alignItems: "flex-start",
                fontSize: 12.5, color: "#57534e", margin: "0 0 14px", cursor: "pointer",
              }}>
                <input
                  type="checkbox" checked={consent}
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

              {error && <p style={{ color: "#c0432b", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}

              <button
                type="submit" disabled={busy || !consent}
                style={{ width: "100%", padding: "12px", fontSize: 15, fontWeight: 600, opacity: consent ? 1 : 0.6 }}
              >
                {busy ? "Отправляем код..." : "Зарегистрироваться"}
              </button>
            </form>

            <p style={{ marginTop: 16, fontSize: 13, color: "#7a8590", textAlign: "center" }}>
              Уже есть аккаунт?{" "}
              <Link to="/login" style={{ color: "#173a54", fontWeight: 500 }}>Войти</Link>
            </p>
            <div className="register-secondary-links" style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
              <Link to="/articles" style={{ color: "#9c7b3c" }}>Статьи</Link>
              <Link to="/help" style={{ color: "#9c7b3c" }}>Помощь</Link>
              <Link to="/roadmap" style={{ color: "#9c7b3c" }}>Роадмап</Link>
              <Link to="/about" style={{ color: "#9c7b3c" }}>О программе</Link>
              <Link to="/cookies" style={{ color: "#9c7b3c" }}>Cookie</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ModeOption({ active, title, text, onClick }) {
  return <button type="button" onClick={onClick} style={{
    textAlign: "left", padding: 12, borderRadius: 9, cursor: "pointer",
    border: `1px solid ${active ? "#173a54" : "#e4ddcd"}`,
    background: active ? "#eef4f7" : "#fffdf7", color: "#1b2531",
  }}><strong style={{ display: "block", marginBottom: 4 }}>{title}</strong><span style={{ fontSize: 12, color: "#687582" }}>{text}</span></button>;
}

const lbl = { display: "block", marginBottom: 14 };
const lblText = {
  display: "block",
  fontSize: 12, color: "#7a8590",
  marginBottom: 4, fontWeight: 500,
};
