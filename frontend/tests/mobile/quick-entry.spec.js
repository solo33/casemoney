import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures';

const accounts = [
  { id: 1, user_id: 1, name: 'Тинькофф', type: 'card', show_for_entries: true, balances: [{ currency: 'RUB', balance: 100000 }] },
  { id: 2, user_id: 1, name: 'В тумбочке', type: 'cash', show_for_entries: true, balances: [{ currency: 'RUB', balance: 10000 }, { currency: 'USD', balance: 100 }] },
];
async function setup(page) {
  await mockApi(page, {
    '/api/accounts': accounts,
    '/api/accounts/grouped': [{ group: { id: 1, name: "Мои счета" }, accounts, total_in_main: 110000 }],
    '/api/categories': [{ id: 1, name: 'Комиссии', type: 'expense', parent_id: null }],
  });
}

test('desktop quick entry aligns date and family option and provides room for the amount', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await setup(page);
  await page.goto('/home');
  const form = page.locator('.quick-add-inline');
  await expect(page.locator('.home-records-card').getByRole('button', { name: /^Записи за / })).toBeVisible();
  await form.getByLabel('Дата записи').fill('2024-12-25');
  await expect(page.locator('.home-records-card').getByRole('button', { name: 'Записи · 25 декабря', exact: true })).toBeVisible();
  await form.getByLabel('Сумма', { exact: true }).fill('1234567.89');
  const amount = await form.getByLabel('Сумма', { exact: true }).boundingBox();
  expect(amount.width).toBeGreaterThanOrEqual(170);
  const wrapper = await form.locator('.amount-input-with-calculator').first().boundingBox();
  const date = await form.getByLabel('Дата записи').boundingBox();
  expect(Math.abs(wrapper.x - date.x)).toBeLessThan(2);
  const note = await form.getByLabel('Примечание', { exact: true }).boundingBox();
  const family = await form.locator('.family-expense-toggle').boundingBox();
  expect(Math.abs(note.y - family.y)).toBeLessThan(2);
  expect(Math.abs(note.height - family.height)).toBeLessThan(2);
  await form.screenshot({ path: test.info().outputPath('expense.png') });
  await form.getByRole('button', { name: /Перевод/ }).click();
  await form.locator('.qai-row').nth(1).locator('select').first().selectOption('2');
  await expect(form.locator('.same-transfer-amount')).toBeVisible();
  expect(Math.abs((await form.getByLabel('Дата записи').boundingBox()).x - wrapper.x)).toBeLessThan(2);
  await expect(form.locator('.transfer-fee-fields')).toHaveCount(0);
  await form.screenshot({ path: test.info().outputPath('transfer.png') });
  await form.getByRole('checkbox', { name: 'Добавить комиссию' }).check();
  await form.getByLabel('Комиссия, RUB', { exact: true }).fill('50');
  const fee = await form.getByLabel('Комиссия, RUB', { exact: true }).boundingBox();
  expect(fee.width).toBeGreaterThanOrEqual(170);
  expect(fee.width).toBeLessThan(240);
  await form.screenshot({ path: test.info().outputPath('transfer-fee.png') });
});

test('disabling a commission clears the draft and excludes it from the submitted transfer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setup(page);
  let saved;
  await page.route(/\/api\/transactions\/?$/, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { id: 23, ...saved } });
  });
  await page.goto('/home');
  const form = page.locator('.quick-add-inline');
  await form.getByRole('button', { name: /Перевод/ }).click();
  await form.getByLabel('Сумма', { exact: true }).fill('1000');
  await form.locator('.qai-row').nth(1).locator('select').first().selectOption('2');
  const checkbox = form.getByRole('checkbox', { name: 'Добавить комиссию' });
  await checkbox.check();
  await form.getByLabel('Комиссия, RUB', { exact: true }).fill('50');
  await form.locator('.transfer-fee-category select').selectOption('1');
  await checkbox.uncheck();
  await checkbox.check();
  await expect(form.getByLabel('Комиссия, RUB', { exact: true })).toHaveValue('');
  await expect(form.locator('.transfer-fee-category select')).toHaveValue('');
  await checkbox.uncheck();
  await form.getByRole('button', { name: 'Записать', exact: true }).click();
  await expect.poll(() => saved?.amount).toBe(1000);
  expect(saved.fee_amount).toBeUndefined();
  expect(saved.fee_category_id).toBeUndefined();
  expect(saved.to_amount).toBe(1000);
  await expect(checkbox).not.toBeChecked();
});

test('an enabled commission is validated and submitted with its category', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setup(page);
  let saved;
  await page.route(/\/api\/transactions\/?$/, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { id: 23, ...saved } });
  });
  await page.goto('/home');
  const form = page.locator('.quick-add-inline');
  await form.getByRole('button', { name: /Перевод/ }).click();
  await form.getByLabel('Сумма', { exact: true }).fill('1000');
  await form.locator('.qai-row').nth(1).locator('select').first().selectOption('2');
  await form.getByRole('checkbox', { name: 'Добавить комиссию' }).check();
  await form.getByLabel('Комиссия, RUB', { exact: true }).fill('25.50');
  await form.getByRole('button', { name: 'Записать', exact: true }).click();
  await expect(form).toContainText('Выберите категорию комиссии');
  expect(saved).toBeUndefined();
  await form.locator('.transfer-fee-category select').selectOption('1');
  await form.getByRole('button', { name: 'Записать', exact: true }).click();
  await expect.poll(() => saved?.fee_amount).toBe(25.5);
  expect(saved.fee_category_id).toBe(1);
  await expect(form.getByRole('checkbox', { name: 'Добавить комиссию' })).not.toBeChecked();
});

for (const width of [320, 375]) {
  test(`mobile commission fits ${width}px and collapses without preserving a hidden fee`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await setup(page);
    await page.goto('/home');
    await page.locator('.fab-add-btn').click();
    const form = page.getByRole('dialog', { name: 'Быстрое добавление' });
    await form.getByRole('button', { name: /Перевод/ }).click();
    await form.locator('.amount-input-with-calculator input').first().fill('1000');
    await form.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await form.getByRole('checkbox', { name: 'Добавить комиссию' }).check();
    await form.getByLabel('Комиссия, RUB', { exact: true }).fill('15');
    const box = await form.getByLabel('Комиссия, RUB', { exact: true }).boundingBox();
    expect(box.width).toBeGreaterThan(160);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await form.getByRole('checkbox', { name: 'Добавить комиссию' }).uncheck();
    await expect(form.locator('.transfer-fee-fields')).toHaveCount(0);
  });
}

