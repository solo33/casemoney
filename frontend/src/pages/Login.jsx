import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login, getPublicConfig } from "../api/auth";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [regEnabled, setRegEnabled] = useState(true);

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
      navigate("/home");
    } catch (err) {
      setError(err.response?.data?.detail || "Неверный email или пароль");
    } finally {
      setBusy(false);
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
        alignItems: "center",
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

          {/* Features */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12, marginBottom: 32,
          }}>
            <Feature icon="💱" title="Мультивалютность">
              Фиат и крипта. Курсы ЦБ РФ и CoinGecko, обновление каждый час.
            </Feature>
            <Feature icon="🌳" title="Иерархия категорий">
              Покупки → Подарки, Еда → Кафе. Перетаскивание, детализация в отчетах.
            </Feature>
            <Feature icon="📊" title="Годовой анализ">
              12 месяцев в одной таблице. Клик по сумме открывает операции.
            </Feature>
            <Feature icon="📥" title="Импорт из CSV">
              Выгрузки из других сервисов загружаются за пару кликов с превью.
            </Feature>
          </div>

          {/* Pricing teaser */}
          <div style={{
            display: "flex", gap: 12, flexWrap: "wrap",
          }}>
            <PricingPill plan="Free" desc="3 счета · 10 категорий · 1 валюта" />
            <PricingPill plan="Premium" desc="без лимитов · все валюты · история без срока" highlight />
          </div>
        </div>

        {/* Login form */}
        <div style={{
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
          <p style={{ color: "#7a8590", fontSize: 13, margin: "0 0 20px" }}>
            Используйте свой email и пароль.
          </p>

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
          <Link to="/privacy" style={{ color: "#9c7b3c", textDecoration: "none" }}>Конфиденциальность</Link>
          <Link to="/terms" style={{ color: "#9c7b3c", textDecoration: "none" }}>Соглашение</Link>
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
        }
      `}</style>
    </div>
  );
}

function Feature({ icon, title, children }) {
  return (
    <div style={{
      background: "#fffdf7",
      border: "1px solid #e4ddcd",
      borderRadius: 10,
      padding: 14,
    }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#1b2531", marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 12.5, color: "#7a8590", lineHeight: 1.4 }}>
        {children}
      </div>
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
      <strong style={{ fontWeight: 700 }}>{highlight ? "★ " : ""}{plan}</strong>
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
