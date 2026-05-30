import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../api/auth";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      background: "linear-gradient(180deg, #faf8f3 0%, #f5f3ee 100%)",
    }}>
      {/* Header */}
      <header style={{
        maxWidth: 1200, margin: "0 auto",
        padding: "20px 24px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{
          fontFamily: "var(--serif)",
          fontSize: 22, fontWeight: 600, color: "#9f1239",
          letterSpacing: -0.01,
        }}>
          ₽ CaseMoney
        </div>
        <Link
          to="/register"
          style={{
            fontSize: 13, fontWeight: 500,
            color: "#9f1239", textDecoration: "none",
            border: "1px solid #9f1239", padding: "6px 14px", borderRadius: 6,
          }}
        >
          Регистрация
        </Link>
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
            fontWeight: 500, color: "#1c1917",
            margin: "0 0 20px",
          }}>
            Личные финансы<br />
            <span style={{ color: "#9f1239" }}>как редакция,</span><br />
            а не как игра.
          </h1>
          <p style={{
            fontSize: 17, lineHeight: 1.55, color: "#57534e",
            margin: "0 0 32px", maxWidth: 480,
          }}>
            Учёт счетов в разных валютах с автоматическим курсом ЦБ и CoinGecko.
            Категории с иерархией. Годовые отчёты с drill-down.
            Импорт из HomeMoney за минуту.
          </p>

          {/* Features */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12, marginBottom: 32,
          }}>
            <Feature icon="💱" title="Мультивалютность">
              Фиат + крипта. Курсы ЦБ РФ и CoinGecko, обновление каждый час.
            </Feature>
            <Feature icon="🌳" title="Иерархия категорий">
              Покупки → Подарки, Еда → Кафе. Drag-and-drop, drill-down в отчётах.
            </Feature>
            <Feature icon="📊" title="Годовой анализ">
              12 месяцев в одной таблице. Клик по сумме — операции под капотом.
            </Feature>
            <Feature icon="📥" title="Импорт из HomeMoney">
              CSV экспорт ihomemoney.com загружается за пару кликов с превью.
            </Feature>
          </div>

          {/* Pricing teaser */}
          <div style={{
            display: "flex", gap: 12, flexWrap: "wrap",
          }}>
            <PricingPill plan="Free" desc="3 счёта · 10 категорий · 1 валюта" />
            <PricingPill plan="Premium" desc="без лимитов · все валюты · история без срока" highlight />
          </div>
        </div>

        {/* Login form */}
        <div style={{
          background: "#fff",
          border: "1px solid #e7e5e0",
          borderRadius: 12,
          padding: 28,
        }}>
          <h2 style={{
            fontFamily: "var(--serif)",
            fontSize: 24, fontWeight: 500, marginTop: 0, marginBottom: 4,
          }}>
            Войти
          </h2>
          <p style={{ color: "#78716c", fontSize: 13, margin: "0 0 20px" }}>
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
              <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 12px" }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{ width: "100%", padding: "12px", fontSize: 15, fontWeight: 600 }}
            >
              {busy ? "Входим..." : "Войти"}
            </button>
          </form>

          <p style={{ marginTop: 16, fontSize: 13, color: "#78716c", textAlign: "center" }}>
            Ещё нет аккаунта?{" "}
            <Link to="/register" style={{ color: "#9f1239", fontWeight: 500 }}>
              Создать
            </Link>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        maxWidth: 1200, margin: "0 auto",
        padding: "20px 24px",
        borderTop: "1px solid #e7e5e0",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 12, color: "#a8a29e",
      }}>
        <span>© CaseMoney · Личные финансы</span>
        <span>Курсы валют: ЦБ РФ · CoinGecko</span>
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
      background: "#fff",
      border: "1px solid #e7e5e0",
      borderRadius: 10,
      padding: 14,
    }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#1c1917", marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 12.5, color: "#78716c", lineHeight: 1.4 }}>
        {children}
      </div>
    </div>
  );
}

function PricingPill({ plan, desc, highlight }) {
  return (
    <div style={{
      padding: "10px 16px", borderRadius: 999,
      background: highlight ? "linear-gradient(90deg, #9f1239 0%, #be123c 100%)" : "#fff",
      color: highlight ? "#fff" : "#1c1917",
      border: highlight ? "none" : "1px solid #e7e5e0",
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
  fontSize: 12, color: "#78716c",
  marginBottom: 4, fontWeight: 500,
};
