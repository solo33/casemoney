import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures';

for (const width of [320, 375]) {
  test(`shopping shortcut and forms work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await mockApi(page, { '/api/shopping/lists': [{ id: 1, name: 'Покупки', is_default: true }] });
    let saved;
    await page.route(/\/api\/shopping\/lists\/1\/items(?:\?.*)?$/, async route => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: [] });
      saved = route.request().postDataJSON();
      await route.fulfill({ json: { ...saved, id: 5, status: 'planned' } });
    });
    await page.goto('/home');
    const shortcut = page.locator('.mobile-bottom-nav').getByRole('link', { name: /Покупки/ });
    await expect(shortcut).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('home-shopping-button.png') });
    await page.getByRole('button', { name: 'Открыть дополнительные разделы' }).click();
    const more = page.getByRole('dialog', { name: 'Ещё' });
    await expect(more.getByRole('link').first()).toHaveText('Записи›');
    await page.screenshot({ path: test.info().outputPath('more-records.png') });
    await more.getByRole('link', { name: 'Записи', exact: false }).first().click();
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(more).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Открыть дополнительные разделы' })).toHaveClass(/is-active/);
    await shortcut.click();
    await expect(page).toHaveURL(/\/shopping$/);
    await expect(page.getByLabel('Название списка')).not.toBeVisible();
    await page.getByLabel('Товар', { exact: true }).fill('Молоко');
    await expect(page.getByLabel('Количество', { exact: true })).not.toBeVisible();
    await page.getByText('Количество и единица', { exact: true }).click();
    await page.getByLabel('Количество', { exact: true }).fill('2');
    await page.getByLabel('Единица измерения').fill('л');
    for (const control of await page.locator('.shopping-add-form input, .shopping-add-form button').all()) {
      const box = await control.boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.width).toBeGreaterThan(70);
    }
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.locator('.shopping-item')).toContainText('Молоко');
    expect(saved.quantity).toBe(2);
    expect(saved.planned_price).toBeNull();
    await expect(page.getByRole("button", { name: "Учесть расход" })).toHaveCount(0);
    expect((await page.locator(".shopping-check > span").boundingBox()).width).toBe(22);
    await page.getByText('+ Новый список', { exact: true }).click();
    await page.getByLabel('Название списка').fill('Дача и покупки для дома');
    await expect(page.getByLabel('Семейный')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: test.info().outputPath('shopping.png'), fullPage: true });
  });
}

test('existing shopping list can be shared and compact entry works on a short screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 480 });
  await mockApi(page, { '/api/shopping/lists': [{ id: 1, user_id: 1, name: 'Фермерский', is_shared: false }] });
  let shared, added, financialWrites = 0;
  await page.route(/\/api\/shopping\/lists\/1$/, async route => {
    shared = route.request().postDataJSON();
    await route.fulfill({ json: { id: 1, user_id: 1, name: 'Фермерский', is_shared: shared.is_shared } });
  });
  await page.route(/\/api\/transactions\//, route => {
    if (route.request().method() === 'POST') financialWrites++;
    return route.fallback();
  });
  await page.route(/\/api\/shopping\/lists\/1\/items(?:\?.*)?$/, async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] });
    added = route.request().postDataJSON();
    await route.fulfill({ json: { id: 9, ...added, status: 'planned' } });
  });
  await page.goto('/shopping');
  await page.getByRole('checkbox', { name: 'Доступен семье' }).click();
  await expect.poll(() => shared?.is_shared).toBe(true);
  await expect(page.getByRole('checkbox', { name: 'Доступен семье' })).toBeChecked();
  const input = page.getByLabel('Товар', { exact: true });
  await input.fill('Молоко');
  await input.scrollIntoViewIfNeeded();
  const box = await input.boundingBox();
  const addBox = await page.getByRole('button', { name: 'Добавить', exact: true }).boundingBox();
  expect(Math.abs(box.y - addBox.y)).toBeLessThan(3);
  await input.press('Enter');
  await expect.poll(() => added?.name).toBe('Молоко');
  expect(added.quantity).toBe(1);
  expect(added.planned_price).toBeNull();
  expect(financialWrites).toBe(0);
  await expect(page.getByRole('button', { name: 'Учесть расход' })).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 850 });
  await page.screenshot({ path: test.info().outputPath('compact-family-shopping.png'), fullPage: true });
});
