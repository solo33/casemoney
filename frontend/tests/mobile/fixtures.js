export const longName = 'Семейные покупки продуктов и товаров для дома с длинным названием';
const months = Array.from({ length: 12 }, (_, i) => 10000 + i * 1000);
const cat = { id: 1, category_id: 1, name: longName, category_name: longName, type: 'expense', parent_id: null, children: [], total: 186000, own_total: 186000, monthly: months, percent: 100, color: '#173a54', sort_order: 0 };
const account = { id: 1, user_id: 1, name: longName, type: 'card', group_id: 1, include_in_balance: true, show_for_entries: true, balances: [{ id: 1, currency: 'RUB', balance: 1234567.89 }], total_in_main: 1234567.89 };
const tx = { id: 1, amount: 123456.78, currency: 'RUB', type: 'expense', account_id: 1, category_id: 1, description: longName, date: '2026-09-01T12:00:00Z', updated_at: '2026-09-06T12:00:00Z', created_at: '2026-09-01T12:00:00Z', is_family_expense: true, tags: [] };
const user = { id: 1, username: 'Андрей', email: 'mobile@example.test', main_currency: 'RUB', preferred_mode: 'family', family_access: true, plan: 'family', is_admin: true, email_verified: true, onboarding_completed: true, dashboard_widgets: {} };
const family = { id: 1, name: 'Наша семья', current_user_id: 1, current_user_role: 'owner', members: [{ id: 1, user_id: 1, name: 'Андрей', email: user.email, role: 'owner', status: 'active' }, { id: 2, user_id: 2, name: 'Светлана', email: 'member@example.test', role: 'editor', status: 'active' }] };
export async function mockApi(page) {
  // Analytics is unrelated to layout and can keep networkidle pending offline.
  await page.route('https://mc.yandex.ru/**', route => route.abort());
  await page.addInitScript(() => { localStorage.setItem('token', 'layout-test'); localStorage.setItem('cm_onb_done', '1'); localStorage.setItem('cm_cookie_consent', 'accepted'); });
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
    const p = new URL(route.request().url()).pathname.replace(/\/$/, '');
    const data = {
      '/api/me': user,
      '/api/me/limits': { plan: 'family', accounts: { used: 1, limit: null }, categories: { used: 1, limit: null } },
      '/api/accounts': [account],
      '/api/accounts/grouped': [{ group: { id: 1, name: longName }, accounts: [account], total_in_main: 1234567.89 }],
      '/api/account-groups': [{ id: 1, name: longName }],
      '/api/categories': [cat, { ...cat, id: 2, parent_id: 1, name: 'Подкатегория' }],
      '/api/transactions': { items: [tx], total: 1, total_pages: 1 },
      '/api/transactions/history': { items: [{ ...tx, action: 'updated', op_date: tx.date, account_name: longName, category_name: longName }], total: 1 },
      '/api/reports/summary': { main_currency: 'RUB', total_income: 250000, total_expense: 186000, net: 64000, transactions_count: 12, date_from: '2026-01-01', date_to: '2026-12-31', category_breakdown: [cat] },
      '/api/reports/annual': { main_currency: 'RUB', year: 2026, income: [cat], expense: [cat], income_totals: months, expense_totals: months, net_monthly: months.map(() => 0), income_total: 186000, expense_total: 186000, net_total: 0 },
      '/api/reports/annual-balances': { main_currency: 'RUB', year: 2026, total_monthly: months, groups: [{ group_id: 1, group_name: longName, monthly: months, accounts: [{ account_id: 1, name: longName, monthly: months }] }] },
      '/api/reports/monthly-trend': { main_currency: 'RUB', points: months.map((v, i) => ({ month: `2026-${String(i + 1).padStart(2,'0')}`, label: String(i + 1), income: v, expense: v / 2 })) },
      '/api/reports/yoy': { main_currency: 'RUB', years: [2025, 2026], rows: months.map((v, i) => ({ month: i + 1, label: `Месяц ${i + 1}`, values: { 2025: v, 2026: v * 2 } })), totals: { 2025: 186000, 2026: 372000 } },
      '/api/dashboard': { total_balance: 1234567, month_income: 250000, month_expense: 186000, recent_transactions: [tx], recently_changed: [tx], forecast: { events: [], accounts: [], income: 0, expense: 0, balance: 1234567 } },
      '/api/family': { family, pending_invitations: [] },
      '/api/family/report': { expenses: [{ ...tx, paid_by_name: 'Светлана', account_name: longName, reimbursement_amount: 123456.78 }], outstanding: [{ user_id: 2, name: 'Светлана', amount: 123456.78, currency: 'RUB' }], totals: [{ amount: 123456.78, currency: 'RUB' }], settlements: [] },
      '/api/family/analytics': { currency: 'RUB', income_total: 250000, expense_total: 186000, net_total: 64000, members: [], categories: [], goals: [], budget: [], settlements: [], notable_expenses: [], month_summary: [] },
      '/api/family/accounts': { accounts: [], members: family.members },
      '/api/family/expense-accounting/pending': { items: [{ ...tx, source_name: 'Светлана', source_category_name: longName }], categories: [cat], accounts: [account] },
      '/api/family/recurring-suggestions': { items: [] },
      '/api/notifications': { items: [], unread_count: 0 },
      '/api/finance-insights/summary': { insights: [] },
      '/api/calendar/subscription': { url: 'https://example.test/calendar/long-subscription-token' },
      '/api/billing/overview': { billing_enabled: false, payments: [], plans: [] },
      '/api/admin/users': { items: [user], total: 1 },
      '/api/admin/stats': {},
      '/api/admin/config': {},
      '/api/automation/settings': { rules_enabled: true, duplicates_enabled: true },
      '/api/currencies': { main_currency: 'RUB', currencies: [{ id: 1, currency: 'RUB', rate: 1, is_main: true }] },
    }[p] ?? [];
    await route.fulfill({ json: data });
  });
}
