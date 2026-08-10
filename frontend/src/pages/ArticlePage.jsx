import { Link, Navigate, useParams } from "react-router-dom";
import PublicPage, { card, paragraph } from "../components/PublicPage";
import { ARTICLE_UPDATED, getArticle } from "../content/articles";
import { SITE_URL } from "../components/Seo";

export default function ArticlePage() {
  const { slug } = useParams();
  const article = getArticle(slug);
  if (!article) return <Navigate to="/articles" replace />;

  const path = `/articles/${article.slug}`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: "2026-08-08",
    dateModified: ARTICLE_UPDATED,
    inLanguage: "ru-RU",
    mainEntityOfPage: `${SITE_URL}${path}`,
    author: { "@type": "Organization", name: "CaseMoney", url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "CaseMoney",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icons/icon-512.png` },
    },
  };

  return (
    <PublicPage title={article.title} description={article.description} path={path} schema={schema}>
      <article className="article-page" style={card}>
        <nav className="article-breadcrumb" aria-label="Хлебные крошки">
          <Link to="/articles">Статьи</Link><span aria-hidden="true">/</span><span>{article.title}</span>
        </nav>
        <p className="article-lead">{article.lead}</p>
        {article.sections.map(section => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map(text => <p key={text} style={paragraph}>{text}</p>)}
          </section>
        ))}
        <aside className="article-cta">
          <h2>Попробуйте CaseMoney</h2>
          <p>Соберите счета, операции и отчёты в одном месте. Тариф Personal доступен бесплатно.</p>
          <Link to="/register">Создать аккаунт</Link>
        </aside>
      </article>
    </PublicPage>
  );
}
