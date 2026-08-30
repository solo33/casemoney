import { sortCurrenciesRubFirst } from "./money";

// Единые правила для форм операции. Здесь нет React-состояния или запросов:
// все три интерфейса ввода используют одинаковые правила выбора валют и перевода.
export function accountCurrencies(account) {
  return sortCurrenciesRubFirst(
    (account?.balances || []).map(balance => balance.currency)
  );
}

export function preferredAccountCurrency(account, selectedCurrency = "") {
  const currencies = accountCurrencies(account);
  return currencies.includes(selectedCurrency) ? selectedCurrency : (currencies[0] || "");
}

export function isSameTransferCurrency(type, fromCurrency, toCurrency) {
  return type === "transfer" && Boolean(fromCurrency) && fromCurrency === toCurrency;
}

export function transferDisplayRate({ amount, toAmount, fallbackRate, allowZeroToAmount = false }) {
  const hasAmount = Number(amount) > 0;
  const hasTargetAmount = allowZeroToAmount ? Number(toAmount) >= 0 : Number(toAmount) > 0;
  return hasAmount && hasTargetAmount ? Number(toAmount) / Number(amount) : fallbackRate;
}

export function swapTransferFields(form, sameCurrency) {
  const creditedAmount = sameCurrency ? form.amount : form.to_amount;
  return {
    ...form,
    account_id: form.to_account_id,
    currency: form.to_currency,
    amount: creditedAmount || "",
    to_account_id: form.account_id,
    to_currency: form.currency,
    to_amount: form.amount || "",
  };
}
