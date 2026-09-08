

export const MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

export function periodForCell(year, monthIdx /* 0..11 или null = весь год */) {
  if (monthIdx === null || monthIdx === undefined) {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  const m = String(monthIdx + 1).padStart(2, "0");
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return { from: `${year}-${m}-01`, to: `${year}-${m}-${String(lastDay).padStart(2, "0")}` };
}
