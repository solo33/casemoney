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
    await page.getByLabel('Количество', { exact: true }).fill('2');
    await page.getByLabel('Единица измерения').fill('л');
    await page.getByLabel('Цена', { exact: true }).fill('120');
    for (const control of await page.locator('.shopping-add-form input, .shopping-add-form button').all()) {
      const box = await control.boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.width).toBeGreaterThan(90);
    }
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.locator('.shopping-item')).toContainText('Молоко');
    expect(saved.quantity).toBe(2);
    expect(saved.planned_price).toBe(120);
    await page.getByText('+ Новый список', { exact: true }).click();
    await page.getByLabel('Название списка').fill('Дача и покупки для дома');
    await expect(page.getByLabel('Семейный')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: test.info().outputPath('shopping.png'), fullPage: true });
  });
}
