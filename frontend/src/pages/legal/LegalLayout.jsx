import { Link, useLocation } from "react-router-dom";
import Seo from "../../components/Seo";

// Общий каркас для юридических страниц (публичные, без авторизации).
export default function LegalLayout({ title, updated, children }) {
  const location = useLocation();
  return (
    <div style={{ minHeight: "100svh", background: "#f6f2e9" }}>
      <Seo title={`${title} — CaseMoney`} description={`${title} сервиса CaseMoney для учёта личных и семейных финансов.`} path={location.pathname} />
      <header style={{
        maxWidth: 820, margin: "0 auto", padding: "20px 24px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <img src="/icon.svg" alt="" width={32} height={32} style={{ borderRadius: 9 }} />
          <span style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 600, color: "#173a54" }}>
            CaseMoney
          </span>
        </Link>
      </header>

      <main style={{
        maxWidth: 820, margin: "0 auto", padding: "8px 24px 64px",
      }}>
        <article style={{
          background: "#fffdf7", border: "1px solid #e4ddcd", borderRadius: 12,
          padding: "32px 36px",
        }}>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>{title}</h1>
          {updated && (
            <p style={{ color: "#a6afb8", fontSize: 13, marginBottom: 24 }}>
              Редакция от {updated}
            </p>
          )}
          <div style={{ color: "#33414f", fontSize: 15, lineHeight: 1.65 }}>
            {children}
          </div>
        </article>

        <div style={{ marginTop: 20, display: "flex", gap: 16, fontSize: 14 }}>
          <Link to="/privacy" style={{ color: "#9c7b3c" }}>Политика конфиденциальности</Link>
          <Link to="/terms" style={{ color: "#9c7b3c" }}>Пользовательское соглашение</Link>
          <Link to="/cookies" style={{ color: "#9c7b3c" }}>Cookie</Link>
          <Link to="/login" style={{ color: "#173a54" }}>Войти</Link>
        </div>
      </main>
    </div>
  );
}

// Хелперы для единообразных заголовков/абзацев
export function H2({ children }) {
  return <h2 style={{ fontSize: 19, marginTop: 28, marginBottom: 8 }}>{children}</h2>;
}
export function P({ children }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>;
}
export function Ul({ children }) {
  return <ul style={{ margin: "0 0 12px", paddingLeft: 22 }}>{children}</ul>;
}
