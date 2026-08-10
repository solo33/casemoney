import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import PwaInstallLink from "../components/PwaInstallLink";
import { login, demoLogin, getPublicConfig } from "../api/auth";

export const REAL_LOGIN_FLAG = "cm_used_real_login";
export const DEMO_SESSION_FLAG = "cm_demo_session";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [regEnabled, setRegEnabled] = useState(true);
  // Кнопку демо-входа показываем, только если с этого устройства ещё ни разу
  // не логинились под настоящим аккаунтом (флаг переживает разлогин).
  const [showDemo] = useState(() => localStorage.getItem(REAL_LOGIN_FLAG) !== "1");

  useEffect(() => {
    getPublicConfig()
      .then(r => setRegEnabled(r.data?.registration_enabled !== false))
      .catch(() => {});
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await login(form);
      localStorage.setItem("token", res.data.access_token);
      localStorage.removeItem(DEMO_SESSION_FLAG);
      localStorage.setItem(REAL_LOGIN_FLAG, "1");
      navigate("/home");
    } catch (err) {
      setError(err.response?.data?.detail || "Неверный email или пароль");
    } finally {
      setBusy(false);
    }
  };

  // Каждый клик создаёт свой изолированный одноразовый аккаунт на бэкенде —
  // это не логин под общими test@test.com/test12345.
  const handleDemoLogin = async () => {
    setError("");
    setDemoBusy(true);
    try {
      const res = await demoLogin();
      localStorage.setItem("token", res.data.access_token);
      localStorage.setItem(DEMO_SESSION_FLAG, "1");
      navigate("/home");
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось создать демо-доступ");
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100svh",
      background: "linear-gradient(180deg, #f6f2e9 0%, #efe9db 100%)",
    }}>
      {/* Header */}
      <header style={{
        maxWidth: 1200, margin: "0 auto",
        padding: "20px 24px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/icon.svg" alt="" width={36} height={36} style={{ borderRadius: 10 }} />
          <span style={{
            fontFamily: "var(--serif)",
            fontSize: 22, fontWeight: 600, color: "#173a54",
            letterSpacing: -0.01,
          }}>
            CaseMoney
          </span>
        </div>
        {regEnabled && (
          <Link
            to="/register"
            style={{
              fontSize: 13, fontWeight: 500,
              color: "#173a54", textDecoration: "none",
              border: "1px solid #173a54", padding: "6px 14px", borderRadius: 6,
            }}
          >
            Регистрация
          </Link>
        )}
      </header>

      {/* Hero + form */}
      <main style={{
        maxWidth: 1200, margin: "0 auto",
        padding: "20px 24px 60px",
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr",
        gap: 60,
        alignItems: "start",
      }} className="login-grid">
        <div>
          <h1 style={{
            fontFamily: "var(--serif)",
            fontSize: 56, lineHeight: 1.05, letterSpacing: -0.025,
            fontWeight: 500, color: "#1b2531",
            margin: "0 0 20px",
          }}>
            Все счета и валюты<br />
            <span style={{ color: "#173a54" }}>в одном месте.</span>
          </h1>
          <p style={{
            fontSize: 17, lineHeight: 1.55, color: "#515c68",
            margin: "0 0 32px", maxWidth: 480,
          }}>
            Счета в разных валютах с автоматическим курсом ЦБ и CoinGecko.
            Категории с иерархией. Годовые отчеты с детализацией по клику.
          </p>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
            marginBottom: 18,
          }}>
            <InfoCard eyebrow="Уже работает" title="Учёт, импорт и анализ">
              Счета, валюты, категории, быстрые записи, CSV/Excel импорт и годовые отчёты уже доступны.
            </InfoCard>
            <InfoCard eyebrow="Скоро" title="Напоминания и автоплатежи">
              Платёжный календарь, регулярные операции и более умная проверка импорта перед загрузкой.
            </InfoCard>
          </div>

          {/* Features */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12, marginBottom: 32,
          }}>
            <FeatureLink icon="❓" title="Помощь" to="/help">
              Ответы на частые вопросы: счета, категории, импорт, отчёты.
            </FeatureLink>
            <FeatureLink icon="🗺️" title="Роадмап" to="/roadmap">
              Что уже готово и что планируется дальше в CaseMoney.
            </FeatureLink>
          </div>

          {/* Pricing teaser */}
          <div style={{
            display: "flex", gap: 12, flexWrap: "wrap",
            marginBottom: 18,
          }}>
            <PricingPill plan="Personal" desc="счета · категории · валюты · импорт · отчеты" highlight />
          </div>

        </div>

        {/* Login form */}
        <div className="login-form-card" style={{
          background: "#fffdf7",
          border: "1px solid #e4ddcd",
          borderRadius: 12,
          padding: 28,
        }}>
          <h2 style={{
            fontFamily: "var(--serif)",
            fontSize: 24, fontWeight: 500, marginTop: 0, marginBottom: 4,
          }}>
            Войти
          </h2>
          <p style={{ color: "#7a8590", fontSize: 13, margin: "0 0 16px" }}>
            Используйте свой email и пароль.
          </p>

          {showDemo && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              marginBottom: 20, padding: "10px 12px",
              background: "#f6f2e9", border: "1px solid #e4ddcd", borderRadius: 8,
            }}>
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={demoBusy}
                style={{ padding: "7px 12px", fontSize: 13, fontWeight: 700 }}
              >
                {demoBusy ? "Готовим песочницу…" : "Демо-вход без регистрации"}
              </button>
              <span style={{ fontSize: 12.5, color: "#7a8590" }}>
                Свежий аккаунт с тестовыми данными, удаляется через несколько часов
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <label style={lbl}>
              <span style={lblText}>Email</span>
              <input
                name="email"
                type="email"
                placeholder="your@email.com"
                value={form.email}
                onChange={handleChange}
                required
                autoFocus
                style={{ width: "100%" }}
              />
            </label>

            <label style={lbl}>
              <span style={lblText}>Пароль</span>
              <input
                name="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                required
                style={{ width: "100%" }}
              />
            </label>

            {error && (
              <p style={{ color: "#c0432b", fontSize: 13, margin: "0 0 12px" }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{ width: "100%", padding: "12px", fontSize: 15, fontWeight: 600 }}
            >
              {busy ? "Входим..." : "Войти"}
            </button>
          </form>

          <p style={{ marginTop: 12, fontSize: 13, textAlign: "center" }}>
            <Link to="/forgot-password" style={{ color: "#9c7b3c", fontWeight: 500 }}>
              Забыли пароль?
            </Link>
          </p>
          {regEnabled && (
            <p style={{ marginTop: 4, fontSize: 13, color: "#7a8590", textAlign: "center" }}>
              Еще нет аккаунта?{" "}
              <Link to="/register" style={{ color: "#173a54", fontWeight: 500 }}>
                Создать
              </Link>
            </p>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        maxWidth: 1200, margin: "0 auto",
        padding: "20px 24px",
        borderTop: "1px solid #e4ddcd",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 12, color: "#a6afb8",
      }}>
        <span>© CaseMoney · Личные финансы</span>
        <span style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <PwaInstallLink style={{ padding: 0, color: "#9c7b3c", fontSize: 12 }} />
          <Link to="/privacy" style={{ color: "#9c7b3c", textDecoration: "none" }}>Конфиденциальность</Link>
          <Link to="/terms" style={{ color: "#9c7b3c", textDecoration: "none" }}>Соглашение</Link>
          <Link to="/cookies" style={{ color: "#9c7b3c", textDecoration: "none" }}>Cookie</Link>
          <Link to="/articles" style={{ color: "#9c7b3c", textDecoration: "none" }}>Статьи</Link>
          <Link to="/help" style={{ color: "#9c7b3c", textDecoration: "none" }}>Помощь</Link>
          <Link to="/roadmap" style={{ color: "#9c7b3c", textDecoration: "none" }}>Роадмап</Link>
          <Link to="/about" style={{ color: "#9c7b3c", textDecoration: "none" }}>О программе</Link>
          <span>Курсы: ЦБ РФ · CoinGecko</span>
        </span>
      </footer>

      <style>{`
        @media (max-width: 860px) {
          .login-grid {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
          .login-grid h1 { font-size: 38px !important; }
          /* На телефоне форма входа — первым экраном, до маркетинга */
          .login-form-card { order: -1; }
        }
      `}</style>
    </div>
  );
}

function FeatureLink({ icon, title, to, children }) {
  return (
    <Link
      to={to}
      style={{
        display: "block",
        background: "#fffdf7",
        border: "1px solid #e4ddcd",
        borderRadius: 10,
        padding: 14,
        textDecoration: "none",
        transition: "border-color 150ms, box-shadow 150ms",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#9c7b3c"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#e4ddcd"; }}
    >
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#1b2531", marginBottom: 4 }}>
        {title} →
      </div>
      <div style={{ fontSize: 12.5, color: "#7a8590", lineHeight: 1.4 }}>
        {children}
      </div>
    </Link>
  );
}

function InfoCard({ eyebrow, title, children }) {
  return (
    <div style={{
      background: "#fffdf7",
      border: "1px solid #e4ddcd",
      borderRadius: 10,
      padding: 16,
    }}>
      <div style={{ color: "#9c7b3c", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {eyebrow}
      </div>
      <h2 style={{ margin: "6px 0 8px", fontSize: 21, fontFamily: "var(--serif)", fontWeight: 600 }}>
        {title}
      </h2>
      <p style={{ margin: 0, color: "#515c68", fontSize: 14, lineHeight: 1.5 }}>
        {children}
      </p>
    </div>
  );
}

function PricingPill({ plan, desc, highlight }) {
  return (
    <div style={{
      padding: "10px 16px", borderRadius: 999,
      background: highlight ? "linear-gradient(90deg, #173a54 0%, #be123c 100%)" : "#fff",
      color: highlight ? "#fff" : "#1b2531",
      border: highlight ? "none" : "1px solid #e4ddcd",
      fontSize: 13,
      display: "flex", gap: 10, alignItems: "center",
    }}>
      <strong style={{ fontWeight: 700 }}>{plan}</strong>
      <span style={{ opacity: highlight ? 0.9 : 0.7 }}>· {desc}</span>
    </div>
  );
}

const lbl = { display: "block", marginBottom: 14 };
const lblText = {
  display: "block",
  fontSize: 12, color: "#7a8590",
  marginBottom: 4, fontWeight: 500,
};
