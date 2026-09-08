import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures';

test('mobile bulk category change submits selected records and clears selection', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 550 });
  await mockApi(page);
  let saved;
  await page.route(/\/api\/transactions\/bulk\/category$/, async route => {
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { updated: 1 } });
  });
  await page.goto('/transactions', { waitUntil: 'networkidle' });
  await page.locator('.mobile-transaction-select input').first().check();
  await page.getByLabel('Новая категория для выбранных записей').selectOption('2');
  await page.getByRole('button', { name: 'Изменить категорию', exact: true }).click();
  await expect.poll(() => saved).toEqual({ transaction_ids: [1], category_id: 2 });
  await expect(page.locator('.transactions-bulk-bar')).not.toBeVisible();
  await expect(page.locator('.mobile-transaction-select input').first()).not.toBeChecked();
});

test('mobile edit saves amount and category creation remains reachable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 550 });
  await mockApi(page);
  let saved;
  await page.route(/\/api\/transactions\/1$/, async route => {
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { id: 1, ...saved } });
  });
  await page.route(/\/api\/categories\/$/, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ json: { id: 99, name: 'Новая категория', type: 'expense', parent_id: null } });
  });
  await page.goto('/transactions', { waitUntil: 'networkidle' });
  await page.locator('.mobile-transaction-main').first().click();
  const editor = page.locator('.transactions-mobile-edit');
  const amount = editor.locator('.amount-input-with-calculator input').first();
  await amount.fill('31590');
  const inputBox = await amount.boundingBox();
  const calculatorBox = await editor.locator('.amount-calculator-trigger').first().boundingBox();
  expect(calculatorBox.x).toBeGreaterThanOrEqual(inputBox.x + inputBox.width - 1);
  await editor.locator('.category-picker-trigger').click();
  const sheet = page.getByRole('dialog', { name: 'Выбор категории' });
  await sheet.getByRole('button', { name: /Создать категорию/ }).click();
  await sheet.getByPlaceholder('Название категории').fill('Новая категория');
  await sheet.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(sheet).not.toBeVisible();
  await page.screenshot({ path: test.info().outputPath('mobile-edit.png') });
  await editor.getByRole('button', { name: /Сохранить/ }).click();
  await expect.poll(() => saved?.amount).toBe(31590);
  expect(saved.category_id).toBe(99);
});

test('last category remains reachable on a short mobile screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await mockApi(page);
  const categories = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, type: 'expense', name: `Категория ${String(i).padStart(2, '0')}`, parent_id: null }));
  await page.route(/\/api\/categories\/$/, route => route.fulfill({ json: categories }));
  await page.goto('/transactions', { waitUntil: 'networkidle' });
  await page.locator('.mobile-transaction-main').first().click();
  await page.locator('.transactions-mobile-edit .category-picker-trigger').click();
  const sheet = page.getByRole('dialog', { name: 'Выбор категории' });
  const last = sheet.getByRole('button', { name: 'Категория 59', exact: true });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await last.click();
  await expect(sheet).not.toBeVisible();
});
