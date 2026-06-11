import { PublicPage, card } from "./Articles";

const groups = [
  {
    title: "Ближайшее",
    items: [
      "Правильный импорт: сканирование файла, подтверждение категорий и финальная загрузка.",
      "Напоминания о платежах и календарь регулярных расходов.",
      "Автотранзакции для кредита, аренды, подписок и других повторяющихся платежей.",
      "Более быстрый старт для новых пользователей.",
    ],
  },
  {
    title: "Далее",
    items: [
      "Правила автокатегоризации операций.",
      "Разбор чеков из почты и файлов.",
      "Семейный доступ и совместные бюджеты.",
      "Расширенные отчеты по целям, долгам и накоплениям.",
    ],
  },
  {
    title: "Исследуем",
    items: [
      "Интеграции с банками и магазинами там, где это технически и юридически реалистично.",
      "Платежный прогноз: сколько денег останется после обязательных списаний.",
      "Умные подсказки по аномальным расходам.",
    ],
  },
];

export default function Roadmap() {
  return (
    <PublicPage title="Роадмап">
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
