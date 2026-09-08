

export const today = () => new Date().toISOString().slice(0, 10);

export const blankForm = () => ({ type: "expense", amount: "", currency: "RUB", account_id: "", category_id: "", description: "", date: today() });

export const FREQUENCY_LABELS = { daily: "Ежедневно", weekly: "Еженедельно", biweekly: "Раз в 2 недели", monthly: "Ежемесячно", yearly: "Ежегодно", custom: "Свой интервал" };

export const MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

export const isoDate = value => String(value || "").slice(0, 10);
