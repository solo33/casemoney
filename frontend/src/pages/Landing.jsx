import { Link, Navigate } from "react-router-dom";
import Seo, { SITE_URL } from "../components/Seo";

const highlights = [
  ["Учёт без таблиц", "Счета, наличные, карты, несколько валют, операции и переводы с фактическим курсом."],
  ["Импорт истории", "CSV, Excel и выгрузка Т‑Банка: сопоставьте счета и категории до сохранения."],
  ["Планирование", "Будущие расходы и доходы, шаблоны, повторяющиеся операции и напоминания."],
  ["Семейное пространство", "Общие траты с личных счетов, вклад участников, взаиморасчёты и общие цели."],
  ["Кредиты и депозиты", "Ипотека, кредитная карта, частный заём и будущие проценты по вкладу — в одной картине."],
  ["Телефон и компьютер", "Установите приложение как PWA; внесённые без сети данные дождутся синхронизации."],
];

export default function Landing() {
  if (localStorage.getItem("token")) return <Navigate to="/home" replace />;
  const schema = { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "CaseMoney", applicationCategory: "FinanceApplication", operatingSystem: "Web, iOS, Android", url: SITE_URL, inLanguage: "ru-RU", description: "Сервис для учёта личных и семейных финансов: счета, операции, планирование, цели, обязательства, депозиты, импорт и отчёты.", offers: { "@type": "Offer", name: "Personal", price: "0", priceCurrency: "RUB" } };
  return <div className="landing-page">
    <Seo title="CaseMoney — личные и семейные финансы" description="Учитывайте счета, расходы, доходы и валюты. Планируйте платежи, импортируйте историю Т‑Банка, ведите семейные финансы и цели в CaseMoney." path="/" schema={schema} />
    <header className="landing-header"><Link to="/" className="public-brand"><img src="/icon.svg" alt="" width={38} height={38} /><span>CaseMoney</span></Link><nav className="public-nav" aria-label="Основная навигация"><Link to="/roadmap">Роадмап</Link><Link to="/articles">Статьи</Link><Link to="/help">Помощь</Link><Link to="/login">Войти</Link><Link to="/register" className="public-nav-cta">Начать бесплатно</Link></nav></header>
    <main>
      <section className="landing-hero"><div><p className="landing-kicker">Личные и семейные финансы в одном месте</p><h1>Знайте, сколько денег у вас есть и на что они уходят</h1><p>CaseMoney собирает счета, операции, планы, цели и отчёты в понятную финансовую картину. Начните с текущих остатков, а историю добавьте вручную или импортом.</p><div className="landing-actions"><Link to="/register">Создать бесплатный аккаунт</Link><Link to="/articles/nastroit-uchet-za-15-minut">Настроить за 15 минут</Link></div><div className="landing-proof"><span>Personal — бесплатно</span><span>Family — совместные финансы и планирование</span></div></div><div className="landing-summary" aria-label="Возможности CaseMoney"><span>Ваша финансовая картина</span><strong>₽ · € · $</strong><div><i style={{ width: "78%" }} /><em>Доходы и остатки</em></div><div><i style={{ width: "54%" }} /><em>Расходы и планы</em></div><small>Работает на компьютере и телефоне. Данные, введённые без сети, синхронизируются позже.</small></div></section>
      <section className="landing-section landing-whats-new"><p className="landing-kicker">Уже в CaseMoney</p><h2>Главное для ежедневного учёта — уже работает</h2><div className="landing-feature-grid">{highlights.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}</div><Link className="landing-roadmap-link" to="/roadmap">Посмотреть, что будет дальше →</Link></section>
      <section className="landing-plans"><div><p className="landing-kicker">Два режима работы</p><h2>Начните лично, подключите семью позже</h2><p>Personal подходит для личного учёта. Family добавляет совместные расходы, планирование, расширенные цели, обязательства, депозиты и семейные сценарии.</p></div><div className="landing-plan-cards"><article><strong>Personal</strong><span>Бесплатно</span><p>Счета, операции, импорт, категории, базовые отчёты, список покупок и PWA.</p></article><article><strong>Family</strong><span>Совместные финансы</span><p>Участники, взаиморасчёты, планирование, цели, обязательства, депозиты и расширенная аналитика.</p></article></div></section>
      <section className="landing-final"><h2>Начните с текущих остатков</h2><p>Не нужно переносить всю историю. Добавьте основные счета, проверьте баланс и постепенно подключайте операции, планы и цели.</p><Link to="/register">Начать бесплатно</Link></section>
    </main>
    <footer className="landing-footer"><span>© 2026 CaseMoney</span><Link to="/roadmap">Роадмап</Link><Link to="/articles">Статьи</Link><Link to="/privacy">Конфиденциальность</Link><Link to="/terms">Соглашение</Link><Link to="/cookies">Cookie</Link><Link to="/about">О программе</Link></footer>
  </div>;
}
