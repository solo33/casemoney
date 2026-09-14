import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures';

async function setup(page) {
  await page.clock.setFixedTime(new Date('2026-09-14T12:00:00Z'));
  await mockApi(page, {
    '/api/transactions': { items: [] },
    '/api/credits': [{ id: 4, name: 'Ипотека', kind: 'mortgage', status: 'active', next_payment_date: '2026-10-11', monthly_payment: 50000, currency: 'RUB' }],
    '/api/recurring-transactions': [{ id: 7, name: 'Аренда квартиры', frequency: 'monthly', next_date: '2026-09-15', amount: 35000, currency: 'RUB', is_active: true }],
    '/api/calendar/events': [
      { id: 'recurring-7-2026-09-15', source: 'recurring', date: '2026-09-15', title: 'Аренда квартиры', amount: 35000, currency: 'RUB', type: 'expense', account_id: 1, category_id: 1 },
      { id: 'obligation-4-2026-10-11', source: 'obligation', kind: 'mortgage', date: '2026-10-11', title: 'Ипотека', amount: 50000, currency: 'RUB', type: 'expense', account_id: 1 },
    ],
  });
}

for (const width of [320, 375, 1280]) {
  test(`planning separates settings and shows mortgage and tappable events at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await setup(page);
    await page.goto('/planning');
    await expect(page.getByLabel('Ссылка календаря')).toHaveCount(0);
    await page.getByRole('button', { name: '15 Сентябрь, операций: 1', exact: true }).click();
    await page.locator('.planning-event').click();
    const details = page.locator('dialog');
    await expect(details).toBeVisible();
    await expect(details).toContainText('Аренда квартиры');
    await page.keyboard.press('Escape');
    await expect(details).not.toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Разделы расписания' });
    await nav.getByRole('button', { name: 'Расписания', exact: true }).click();
    await expect(page.locator('.planning-obligation')).toContainText('11.10.2026');
    const actions = page.locator('.recurring-list .planning-actions button');
    for (const button of await actions.all()) {
      const box = await button.boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await button.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: test.info().outputPath('schedules.png'), fullPage: true });
    await page.getByRole('button', { name: 'В календаре', exact: true }).click();
    await expect(page.locator('.planning-calendar-nav')).toContainText('Октябрь 2026');
    await page.locator('.planning-event').click();
    await expect(details).toContainText('Ипотека');
    await expect(details.getByRole('link', { name: 'Открыть кредиты' })).toHaveAttribute('href', '/credits');
    await details.getByRole('button', { name: 'Закрыть' }).click();
    await page.screenshot({ path: test.info().outputPath('calendar.png'), fullPage: true });
    await nav.getByRole('button', { name: 'Настройки', exact: true }).click();
    await expect(page.getByLabel('Ссылка календаря')).toBeVisible();
    await expect(page.locator('.planning-calendar')).toHaveCount(0);
    await nav.getByRole('button', { name: 'Новая операция' }).click();
    await expect(page.getByLabel('Сумма', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('recurring creation preserves execution and reminder settings', async ({ page }) => {
  await setup(page);
  let saved;
  await page.route(/\/api\/recurring-transactions\/$/, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { ...saved, id: 8, is_active: true } });
  });
  await page.goto('/planning?section=create');
  await page.getByLabel('Сумма', { exact: true }).fill('1500');
  await page.getByRole('button', { name: 'Настроить повторение' }).click();
  await page.getByLabel('Как выполнять').selectOption('automatic');
  await page.getByLabel('Напомнить заранее, дней').fill('3');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect.poll(() => saved?.execution_mode).toBe('automatic');
  expect(saved.reminder_days).toBe(3);
});
