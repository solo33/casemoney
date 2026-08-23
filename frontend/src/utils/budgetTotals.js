// Общая свёртка списка бюджетов в {limit, spent} — используется и в BudgetWidget
// на главной, и на странице /budget, чтобы округление/фоллбэки не расходились
// между копиями.
export function budgetTotals(budgets) {
  return budgets.reduce((result, item) => ({
    limit: result.limit + Number(item.effective_limit || 0),
    spent: result.spent + Number(item.spent || 0),
  }), { limit: 0, spent: 0 });
}
