import { Link } from "react-router-dom";
import PublicPage, { card, paragraph } from "../components/PublicPage";
import { ARTICLE_UPDATED, articles } from "../content/articles";

export default function Articles() {
  return (
    <PublicPage
      title="Статьи о личных и семейных финансах"
      description="Практические статьи CaseMoney о личном бюджете, счетах, категориях, импорте банковских операций, семейных расходах, кредитах и целях."
      path="/articles"
    >
      <p style={{ ...paragraph, maxWidth: 760, marginBottom: 22 }}>
        Понятные инструкции без сложной терминологии: как организовать учёт денег и использовать данные для повседневных решений.
      </p>
      <div className="article-list">
        {articles.map(article => (
          <article key={article.slug} style={card}>
            <p className="article-kicker">Обновлено {new Date(`${ARTICLE_UPDATED}T12:00:00`).toLocaleDateString("ru-RU")}</p>
            <h2><Link to={`/articles/${article.slug}`}>{article.title}</Link></h2>
            <p style={paragraph}>{article.description}</p>
            <Link className="article-read-link" to={`/articles/${article.slug}`}>
              Читать статью <span aria-hidden="true">→</span>
            </Link>
          </article>
        ))}
      </div>
    </PublicPage>
  );
}

export { card, paragraph } from "../components/PublicPage";
export { default as PublicPage } from "../components/PublicPage";
