const RU_MONTHS_FULL = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// granularity + опорная дата → query-параметры для /api/reports/summary
export function buildPeriodParams(gran, anchor) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth() + 1;
  if (gran === "day") {
    const d = isoDate(anchor);
    return { period: "custom", date_from: d, date_to: d };
  }
  if (gran === "year") {
    return { period: "year", year: y };
  }
  return { period: "month", year: y, month: m };
}

// Человекочитаемый заголовок периода
export function periodLabel(gran, anchor) {
  const y = anchor.getFullYear();
  if (gran === "day") {
    return anchor.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }
  if (gran === "year") return `${y} год`;
  return `${RU_MONTHS_FULL[anchor.getMonth()]} ${y}`;
}

// Сдвиг опорной даты на ±1 шаг выбранной гранулярности
export function stepAnchor(gran, anchor, dir) {
  const d = new Date(anchor);
  if (gran === "day") d.setDate(d.getDate() + dir);
  else if (gran === "year") d.setFullYear(d.getFullYear() + dir);
  else { d.setDate(1); d.setMonth(d.getMonth() + dir); }
  return d;
}
