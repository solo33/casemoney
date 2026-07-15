// Форматирование валют. Знак валюты после числа в русском стиле.

export const CURRENCY_SYMBOLS = {
  RUB: "₽",
  USD: "$",
  EUR: "€",
  GBP: "£",
  UAH: "₴",
  KZT: "₸",
  BYN: "Br",
  CNY: "¥",
  JPY: "¥",
  BTC: "₿",
  ETH: "Ξ",
  USDT: "₮",
};

export const COMMON_CURRENCIES = [
  "RUB", "USD", "EUR", "GBP", "UAH", "KZT", "BYN", "CNY", "JPY",
  "BTC", "ETH", "USDT", "USDC", "SOL", "BNB", "TON",
];

export function sortCurrenciesRubFirst(currencies) {
  return [...new Set(currencies)].sort((left, right) => {
    const leftCode = String(left).toUpperCase();
    const rightCode = String(right).toUpperCase();
    if (leftCode === "RUB" && rightCode !== "RUB") return -1;
    if (rightCode === "RUB" && leftCode !== "RUB") return 1;
    return 0;
  });
}

export function currencySymbol(code) {
  return CURRENCY_SYMBOLS[code?.toUpperCase()] || code;
}

export function formatMoney(amount, opts = {}) {
  const { maxFraction = 2 } = opts;
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "0";
  const numericAmount = Number(amount);
  const zeroThreshold = 0.5 * (10 ** -maxFraction);
  const displayAmount = Math.abs(numericAmount) < zeroThreshold ? 0 : numericAmount;
  return displayAmount.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFraction,
  });
}

export function formatMoneyWithCurrency(amount, currency, opts = {}) {
  // Для крипты больше знаков (BTC = 0.0001)
  const isCrypto = ["BTC", "ETH", "USDT", "USDC", "SOL", "BNB", "TON"].includes(
    (currency || "").toUpperCase()
  );
  const maxFraction = opts.maxFraction ?? (isCrypto ? 8 : 2);
  return `${formatMoney(amount, { maxFraction })} ${currencySymbol(currency)}`;
}
