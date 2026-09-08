

export const ACTION_COLOR = {
  created: "#167a4a",   // записано
  edited: "#b45309",    // отредактировано
  deleted: "#c0432b",   // удалено
};

export const TYPE_ARROW = { income: "←", expense: "→", transfer: "⇄" };

export const RU_MONTHS_SHORT = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

export function changedAtLabel(iso) {
  const d = new Date(iso);
  const t = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${d.getDate()} ${RU_MONTHS_SHORT[d.getMonth()]} ${t}`;
}

export function opDateLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export const ACTION_FILTERS = [
  { key: "", label: "Все" },
  { key: "created", label: "Записано" },
  { key: "edited", label: "Отредактировано" },
  { key: "deleted", label: "Удалено" },
];
