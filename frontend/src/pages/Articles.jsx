import { Link } from "react-router-dom";

const articles = [
  {
    title: "Зачем вести личный бюджет",
    body: [
      "Бюджет нужен не для запретов, а для ясности. Когда доходы, расходы и переводы лежат в одном месте, становится видно, какие решения двигают вас вперед, а какие просто растворяют деньги.",
      "Начинать лучше с простого: завести основные счета, внести крупные регулярные расходы и раз в несколько дней добавлять покупки. Через месяц появится первая полезная картина: сколько стоит обычная жизнь без догадок.",
    ],
  },
  {
    title: "Как понять, куда уходят деньги",
    body: [
      "Главный сигнал дают категории. Если не дробить их слишком мелко, отчет быстро показывает разницу между необходимыми расходами, привычками и случайными покупками.",
      "Хороший подход: держать 8-12 крупных категорий и добавлять подкатегории только там, где вы реально готовы что-то менять. Например, еда дома и кафе часто полезнее, чем одна большая категория Еда.",
    ],
  },
  {
    title: "Почему счета и валюты лучше учитывать отдельно",
    body: [
      "Баланс на карте, наличные, вклад и криптовалюта отвечают на разные вопросы. Если смешать их в одну сумму, легко переоценить доступные деньги и забыть про ограничения конкретного счета.",
      "Отдельные валюты помогают видеть реальную структуру накоплений. Итоговая валюта удобна для общей картины, но исходные суммы важны для точности и контроля.",
    ],
  },
  {
    title: "Как настроить учет за 15 минут",
    body: [
      "Сначала создайте счета: карта, наличные, накопительный счет. Затем проверьте валюты и оставьте только те, которыми пользуетесь. После этого настройте категории расходов и доходов.",
      "Если у вас уже есть история операций, загрузите CSV или Excel-файл через импорт. Сервис покажет предварительный разбор, а вы сможете подтвердить категории перед сохранением данных.",
    ],
  },
];

export default function Articles() {
  return (
    <PublicPage title="Статьи">
      <div style={{ display: "grid", gap: 16 }}>
        {articles.map(article => (
          <article key={article.title} style={card}>
            <h2 style={{ margin: "0 0 10px", fontSize: 22 }}>{article.title}</h2>
            {article.body.map((p, idx) => (
              <p key={idx} style={paragraph}>{p}</p>
            ))}
          </article>
        ))}
      </div>
    </PublicPage>
  );
}

export function PublicPage({ title, children }) {
  const isAuthed = Boolean(localStorage.getItem("token"));

  return (
    <div style={{ minHeight: "100svh", background: "#f6f2e9" }}>
      {!isAuthed && (
        <header style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: "20px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}>
          <Link to="/login" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <img src="/icon.svg" alt="" width={32} height={32} style={{ borderRadius: 9 }} />
            <span style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 600, color: "#173a54" }}>CaseMoney</span>
          </Link>
          <nav style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 14 }}>
            <Link to="/articles" style={navLink}>Статьи</Link>
            <Link to="/help" style={navLink}>Помощь</Link>
            <Link to="/roadmap" style={navLink}>Роадмап</Link>
            <Link to="/about" style={navLink}>О программе</Link>
            <Link to="/login" style={{ ...navLink, color: "#173a54" }}>Войти</Link>
          </nav>
        </header>
      )}

      <main style={{ maxWidth: 980, margin: "0 auto", padding: isAuthed ? "24px 24px 64px" : "8px 24px 64px" }}>
        <h1 style={{ margin: "0 0 20px", fontFamily: "var(--serif)", fontSize: 38 }}>{title}</h1>
        {children}
      </main>
    </div>
  );
}

export const card = {
  background: "#fffdf7",
  border: "1px solid #e4ddcd",
  borderRadius: 10,
  padding: 22,
};

export const paragraph = {
  margin: "0 0 10px",
  color: "#515c68",
  fontSize: 15,
  lineHeight: 1.65,
};

const navLink = { color: "#9c7b3c", textDecoration: "none", fontWeight: 600 };
