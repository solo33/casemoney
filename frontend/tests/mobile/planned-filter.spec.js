import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures';

for (const width of [375, 1280]) {
  test(`planned records are opt-in and labelled at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    const actual = { id: 31, amount: 100, currency: 'RUB', type: 'income', account_id: 1, category_id: 1, date: '2026-09-01T12:00:00Z', description: 'Полученный доход', is_planned: false };
    const planned = { ...actual, id: 32, amount: 35000, description: 'Ожидаемая аренда', is_planned: true };
    let lastParams;
    await page.route(/\/api\/transactions\/\?/, route => {
      lastParams = new URL(route.request().url()).searchParams;
      const items = lastParams.get('is_planned') === 'false' ? [actual] : [actual, planned];
      return route.fulfill({ json: { items, total: items.length } });
    });
    await page.goto('/transactions?type=income&category_id=1');
    await expect.poll(() => lastParams?.get('is_planned')).toBe('false');
    await expect(page.getByText('Ожидаемая аренда', { exact: true })).toHaveCount(0);
    if (width < 600) await page.getByRole('button', { name: /^Фильтры/ }).click();
    const toggle = page.getByRole('checkbox', { name: 'Учитывать план', exact: true });
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect.poll(() => lastParams?.has('is_planned')).toBe(false);
    if (width < 600) await page.getByRole('button', { name: 'Показать записи', exact: true }).click();
    await expect(page.getByText('Ожидаемая аренда', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.locator('.transaction-planned-label').filter({ visible: true })).toBeVisible();
    if (width < 600) await page.getByRole('button', { name: /^Фильтры/ }).click();
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
    await expect(toggle).not.toBeChecked();
    await expect.poll(() => lastParams?.get('is_planned')).toBe('false');
  });
}

test('report drilldown preserves explicit plan inclusion', async ({ page }) => {
  await mockApi(page);
  await page.goto('/reports');
  await expect(page.getByRole('checkbox', { name: 'Учитывать план' })).not.toBeChecked();
  await page.getByTitle('Открыть записи по этой категории').first().click();
  await expect(page).not.toHaveURL(/include_planned=true/);
  await page.goto('/reports');
  await page.getByRole('checkbox', { name: 'Учитывать план' }).check();
  await page.getByTitle('Открыть записи по этой категории').first().click();
  await expect(page).toHaveURL(/include_planned=true/);
  await expect(page.getByRole('checkbox', { name: 'Учитывать план' })).toBeChecked();
});
