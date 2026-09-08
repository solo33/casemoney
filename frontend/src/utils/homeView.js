

export const TYPE_LABEL = { income: "Доход", expense: "Расход", transfer: "Перевод" };

export const TYPE_COLOR = { income: "#167a4a", expense: "#c0432b", transfer: "#2f6296" };

export const TYPE_ICON = { income: "↗", expense: "↘", transfer: "⇄" };

export const RU_MONTHS_FULL = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];

export function isToday(iso) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function isoToday() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n) => String(n).padStart(2, "0");
  const from = `${y}-${pad(m + 1)}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${pad(m + 1)}-${pad(last)}`;
  return { from, to };
}

export function aggregateByCurrency(groups) {
  const map = {};
  groups.forEach(g => g.accounts.forEach(a => {
    if (a.include_in_balance === false) return;
    (a.balances || []).forEach(b => {
      map[b.currency] = (map[b.currency] || 0) + b.balance;
    });
  }));
  return Object.entries(map)
    .map(([currency, balance]) => ({ currency, balance }))
    .filter(x => Math.abs(x.balance) > 0.005)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

export const sectionTitle = {
  margin: "0 0 10px",
  fontSize: 13,
  color: "#7a8590",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};
