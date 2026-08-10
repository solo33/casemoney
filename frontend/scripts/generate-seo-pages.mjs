import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ARTICLE_UPDATED, articles } from "../src/content/articles.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const siteUrl = "https://casemoney.ru";
const template = await readFile(join(dist, "index.html"), "utf8");

const escapeHtml = value => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

function replaceMeta(html, attribute, key, content) {
  const regex = new RegExp(`<meta\\s+${attribute}=["']${key}["']\\s+content=["'][^"']*["']\\s*\\/?>`, "i");
  const tag = `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`;
  return regex.test(html) ? html.replace(regex, tag) : html.replace("</head>", `  ${tag}\n  </head>`);
}

function renderPage({ path, title, description, body, type = "website", schema }) {
  const url = `${siteUrl}${path === "/" ? "/" : path}`;
  let html = template.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = replaceMeta(html, "name", "description", description);
  html = replaceMeta(html, "property", "og:title", title);
  html = replaceMeta(html, "property", "og:description", description);
  html = replaceMeta(html, "property", "og:type", type);
  html = replaceMeta(html, "property", "og:url", url);
  html = replaceMeta(html, "name", "twitter:title", title);
  html = replaceMeta(html, "name", "twitter:description", description);
  html = html.replace(/<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?>/i, `<link rel="canonical" href="${url}" />`);
  if (schema) {
    html = html.replace("</head>", `  <script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>\n  </head>`);
  }
  return html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

const articleList = articles.map(article => `
  <article><h2><a href="/articles/${article.slug}">${escapeHtml(article.title)}</a></h2><p>${escapeHtml(article.description)}</p></article>`).join("");

const pages = [
  {
    path: "/",
    title: "CaseMoney — учёт личных и семейных финансов",
    description: "Бесплатный сервис личных финансов: счета, расходы и доходы, категории, отчёты, цели и импорт. Семейный учёт, обязательства и депозиты в Family.",
    body: `<main><h1>Понимайте, сколько у вас денег и куда они уходят</h1><p>CaseMoney объединяет счета, операции, категории, цели и отчёты.</p><p><a href="/register">Создать бесплатный аккаунт</a></p><h2>Возможности</h2><p>Счета и валюты, импорт операций, категории, аналитика, цели, семейные финансы, обязательства и депозиты.</p></main>`,
    schema: { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "CaseMoney", applicationCategory: "FinanceApplication", operatingSystem: "Web, iOS, Android", url: siteUrl, offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" } },
  },
  {
    path: "/articles",
    title: "Статьи о личных и семейных финансах — CaseMoney",
    description: "Практические статьи о личном бюджете, счетах, импорте банковских операций, семейных расходах, кредитах и финансовых целях.",
    body: `<main><h1>Статьи о личных и семейных финансах</h1>${articleList}</main>`,
  },
  {
    path: "/help",
    title: "Помощь по CaseMoney — полное руководство",
    description: "Руководство по счетам, операциям, валютам, импорту Т‑Банка, отчётам, целям, семейным финансам, обязательствам, депозитам, уведомлениям и PWA.",
    body: `<main><h1>Помощь по CaseMoney</h1><h2>Основные разделы</h2><p>Начало работы, счета и остатки, операции, валюты, категории, импорт и экспорт, отчёты, цели, семейные финансы, обязательства, депозиты, уведомления и установка приложения.</p><p><a href="mailto:case.m0ney@ya.ru">Связаться с поддержкой</a></p></main>`,
  },
  { path: "/about", title: "О программе CaseMoney", description: "Информация о CaseMoney, версии приложения, поддержке и документах.", body: "<main><h1>О программе CaseMoney</h1><p>Сервис для учёта личных и семейных финансов.</p></main>" },
  { path: "/roadmap", title: "Роадмап CaseMoney", description: "Планы развития CaseMoney: автоматизация операций, чеки, семейная аналитика, банковские интеграции и прогнозы.", body: "<main><h1>Роадмап CaseMoney</h1><p>Автоматическая обработка операций, чеки, прогнозы и развитие семейных финансов.</p></main>" },
  { path: "/privacy", title: "Политика конфиденциальности — CaseMoney", description: "Политика обработки и защиты персональных данных пользователей CaseMoney.", body: "<main><h1>Политика конфиденциальности</h1><p>Правила обработки и защиты данных в CaseMoney.</p></main>" },
  { path: "/terms", title: "Пользовательское соглашение — CaseMoney", description: "Условия использования сервиса CaseMoney.", body: "<main><h1>Пользовательское соглашение</h1><p>Условия использования CaseMoney.</p></main>" },
  { path: "/cookies", title: "Использование Cookie — CaseMoney", description: "Какие Cookie и локальные данные использует CaseMoney.", body: "<main><h1>Использование Cookie</h1><p>Информация о технических данных браузера.</p></main>" },
];

for (const article of articles) {
  const path = `/articles/${article.slug}`;
  const body = `<main><article><p><a href="/articles">Статьи</a></p><h1>${escapeHtml(article.title)}</h1><p>${escapeHtml(article.lead)}</p>${article.sections.map(section => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map(text => `<p>${escapeHtml(text)}</p>`).join("")}</section>`).join("")}<p><a href="/register">Создать аккаунт CaseMoney</a></p></article></main>`;
  pages.push({
    path,
    title: `${article.title} — CaseMoney`,
    description: article.description,
    type: "article",
    body,
    schema: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: article.description,
      datePublished: "2026-08-08",
      dateModified: ARTICLE_UPDATED,
      inLanguage: "ru-RU",
      mainEntityOfPage: `${siteUrl}${path}`,
      author: { "@type": "Organization", name: "CaseMoney", url: siteUrl },
      publisher: { "@type": "Organization", name: "CaseMoney", url: siteUrl, logo: { "@type": "ImageObject", url: `${siteUrl}/icons/icon-512.png` } },
    },
  });
}

for (const page of pages) {
  const html = renderPage(page);
  const output = page.path === "/" ? join(dist, "index.html") : join(dist, page.path.slice(1), "index.html");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html, "utf8");
}

console.log(`Generated ${pages.length} SEO route pages.`);
