

export const PAGE_SIZE = 50;

export function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export function toLocalIsoDate(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function dateRangeForPreset(preset) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  if (preset === "today") return { from: today, to: today };
  if (preset === "this_week") return { from: monday, to: today };
  if (preset === "last_week") {
    const from = new Date(monday); from.setDate(monday.getDate() - 7);
    const to = new Date(monday); to.setDate(monday.getDate() - 1);
    return { from, to };
  }
  if (preset === "this_month") return { from: monthStart, to: today };

  const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const to = new Date(today.getFullYear(), today.getMonth(), 0);
  return { from, to };
}
