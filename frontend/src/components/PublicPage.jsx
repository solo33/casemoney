import { Link } from "react-router-dom";
import Seo from "./Seo";

export default function PublicPage({ title, description, path, schema, children }) {
  const isAuthed = Boolean(localStorage.getItem("token"));

  return (
    <div style={{ minHeight: "100svh", background: "#f6f2e9" }}>
      <Seo title={title} description={description} path={path} schema={schema} />
      {!isAuthed && (
        <header className="public-header">
          <Link to="/" className="public-brand" aria-label="CaseMoney — главная">
            <img src="/icon.svg" alt="" width={34} height={34} />
            <span>CaseMoney</span>
          </Link>
          <nav className="public-nav" aria-label="Публичная навигация">
            <Link to="/articles">Статьи</Link>
            <Link to="/help">Помощь</Link>
            <Link to="/about">О программе</Link>
            <Link to="/login">Войти</Link>
            <Link to="/register" className="public-nav-cta">Начать бесплатно</Link>
          </nav>
        </header>
      )}

      <main className="public-main">
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}

export const card = {
  background: "#fffdf7",
  border: "1px solid #e4ddcd",
  borderRadius: 12,
  padding: 22,
};

export const paragraph = {
  margin: "0 0 10px",
  color: "#515c68",
  fontSize: 15,
  lineHeight: 1.7,
};
