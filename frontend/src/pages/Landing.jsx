import { Link, Navigate } from "react-router-dom";
import Seo, { SITE_URL } from "../components/Seo";

const features = [
  ["Счета и валюты", "Реальные остатки, группы счетов, переводы и пересчёт общего баланса."],
  ["Операции и импорт", "Доходы, расходы, переводы, корректировки, CSV, Excel и выгрузки Т‑Банка."],
  ["Категории и анализ", "Группы и подкатегории, динамика по месяцам и годовые сравнения."],
  ["Цели", "Накопления с суммой, сроком и привязкой к реальному счёту."],
  ["Семейные финансы", "Общие расходы с личных счетов, вклад участников и взаиморасчёты."],
  ["Обязательства и депозиты", "Будущие платежи и доходы, кредитные карты, займы, история и напоминания."],
];

export default function Landing() {
  if (localStorage.getItem("token")) return <Navigate to="/home" replace />;
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CaseMoney",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web, iOS, Android",
    url: SITE_URL,
    inLanguage: "ru-RU",
    description: "Сервис для учёта личных и семейных финансов: счета, операции, категории, отчёты, цели, обязательства, депозиты и импорт банковских выписок.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
  };

  return (
    <div className="landing-page">
      <Seo
        title="CaseMoney — учёт личных и семейных финансов"
        description="Бесплатный сервис личных финансов: счета, расходы и доходы, категории, отчёты, цели и импорт. Семейный учёт, обязательства, депозиты и напоминания в Family."
        path="/"
        schema={schema}
      />
      <header className="landing-header">
        <Link to="/" className="public-brand"><img src="/icon.svg" alt="" width={38} height={38} /><span>CaseMoney</span></Link>
        <nav className="public-nav" aria-label="Основная навигация">
          <Link to="/articles">Статьи</Link><Link to="/help">Помощь</Link><Link to="/login">Войти</Link><Link to="/register" className="public-nav-cta">Начать бесплатно</Link>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <div>
            <p className="landing-kicker">Личные финансы без сложных таблиц</p>
            <h1>Понимайте, сколько у вас денег и куда они уходят</h1>
            <p>CaseMoney объединяет счета, операции, категории, цели и отчёты. Вносите данные вручную или импортируйте банковскую историю — остатки и аналитика обновятся автоматически.</p>
            <div className="landing-actions"><Link to="/register">Создать бесплатный аккаунт</Link><Link to="/articles/nastroit-uchet-za-15-minut">Как начать за 15 минут</Link></div>
          </div>
          <div className="landing-summary" aria-label="Пример финансовой сводки">
            <span>Общий баланс</span><strong>₽ · € · $</strong>
            <div><i style={{ width: "78%" }} /><em>Доходы</em></div>
            <div><i style={{ width: "54%" }} /><em>Расходы</em></div>
            <small>Данные доступны на компьютере и телефоне</small>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="features-title">
          <p className="landing-kicker">Возможности</p><h2 id="features-title">Всё необходимое для ежедневного учёта</h2>
          <div className="landing-feature-grid">{features.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>

        <section className="landing-plans" aria-labelledby="plans-title">
          <div><p className="landing-kicker">Два режима работы</p><h2 id="plans-title">Начните лично, подключите семью позже</h2><p>Personal включает весь текущий личный учёт. Family добавляет совместную финансовую плоскость, взаиморасчёты, обязательства и депозиты.</p></div>
          <div className="landing-plan-cards"><article><strong>Personal</strong><span>Бесплатно</span><p>Счета, операции, импорт, категории, отчёты и цели.</p></article><article><strong>Family</strong><span>Совместные финансы</span><p>Семейные расходы, взаиморасчёты, обязательства, депозиты и напоминания.</p></article></div>
        </section>

        <section className="landing-final"><h2>Начните с текущих остатков</h2><p>Переносить всю историю необязательно. Создайте основные счета и получите первую финансовую картину уже сегодня.</p><Link to="/register">Начать бесплатно</Link></section>
      </main>
      <footer className="landing-footer"><span>© 2026 CaseMoney</span><Link to="/privacy">Конфиденциальность</Link><Link to="/terms">Соглашение</Link><Link to="/cookies">Cookie</Link><Link to="/about">О программе</Link></footer>
    </div>
  );
}
