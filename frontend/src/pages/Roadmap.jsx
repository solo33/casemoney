import PublicPage, { card } from "../components/PublicPage";

const groups = [
  {
    title: "Развиваем сейчас",
    items: [
      "Расширенные семейные цели и вклад каждого участника.",
      "Правила автоматической категоризации и массовая обработка похожих операций.",
      "Поиск подписок, регулярных платежей и возможных дублей.",
      "Развитие кредитов: прогноз, календарь и автоматические действия.",
    ],
  },
  {
    title: "Далее",
    items: [
      "Сканирование QR-кодов и распознавание товарных позиций в чеках.",
      "Сопоставление чеков с банковскими операциями.",
      "Прогноз остатка, денежных разрывов и обязательных платежей.",
      "Недельные и месячные семейные отчёты по email.",
    ],
  },
  {
    title: "Исследуем",
    items: [
      "Безопасные банковские интеграции там, где доступны официальные API.",
      "Анализ покупок, динамики цен и семейной продуктовой корзины.",
      "Персональные рекомендации и объяснение необычных расходов.",
    ],
  },
];

export default function Roadmap() {
  return (
    <PublicPage
      title="Роадмап CaseMoney"
      description="Планы развития CaseMoney: автоматическая обработка операций, чеки, расширенная семейная аналитика, банковские интеграции и прогнозы."
      path="/roadmap"
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {groups.map(group => (
          <section key={group.title} style={card}>
            <h2 style={{ margin: "0 0 12px", fontSize: 21 }}>{group.title}</h2>
            <ul style={{ margin: 0, paddingLeft: 20, color: "#515c68", lineHeight: 1.65, fontSize: 14 }}>
              {group.items.map(item => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </PublicPage>
  );
}
