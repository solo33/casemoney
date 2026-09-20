import { test, expect } from '@playwright/test';
import { mockApi, longName } from './fixtures';

for (const width of [320, 390, 1280]) {
  test(`category search and long labels work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await mockApi(page, { '/api/categories/tree': [{ id: 1, name: longName, type: 'expense', color: '#b50042', children: [{ id: 2, name: 'Очень длинная подкатегория ремонта и благоустройства квартиры', type: 'expense', parent_id: 1, color: '#b50042' }] }] });
    await page.goto('/planning?section=create');
    await page.locator('.planning-form .category-picker-trigger').click();
    const dialog = page.getByRole('dialog', { name: 'Выбор категории' });
    await dialog.getByPlaceholder('Поиск категории').fill('Подкат');
    await expect(dialog.getByRole('button', { name: longName, exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Подкатегория', exact: true }).click();
    await expect(page.locator('.planning-form .category-picker-trigger')).toContainText(`${longName} → Подкатегория`);
    await page.locator('.planning-form .category-picker-trigger').click();
    await page.screenshot({ path: test.info().outputPath('category-picker.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await page.goto('/settings/categories');
    await expect(page.locator('.category-node-name').first()).toBeVisible();
    await page.locator('.category-node-name').first().click();
    const overlap = await page.locator('.category-node-row').first().evaluate(row => {
      const name = row.querySelector('.category-node-name').getBoundingClientRect();
      const actions = row.querySelector('.category-node-actions').getBoundingClientRect();
      return name.right > actions.left && name.left < actions.right && name.bottom > actions.top && name.top < actions.bottom;
    });
    expect(overlap).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('categories.png') });
  });
}

test('create a template without recording a transaction', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  let saved, writes = 0;
  await page.route(/\/api\/transactions\/$/, route => {
    if (route.request().method() === 'POST') writes++;
    return route.fallback();
  });
  await page.route(/\/api\/transaction-templates\/$/, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { ...saved, id: 7 } });
  });
  await page.goto('/planning?section=templates');
  await page.getByRole('button', { name: '+ Создать шаблон', exact: true }).click();
  await page.getByLabel('Сумма', { exact: true }).fill('799');
  await page.getByRole('button', { name: 'Сохранить шаблон', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Интернет');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page).toHaveURL(/section=templates/);
  await expect(page.locator('.planning-templates')).toContainText('Интернет');
  expect(saved.amount).toBe(799);
  expect(writes).toBe(0);
});

test('goal form sends multiple accounts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, { '/api/accounts': [
    { id: 1, name: 'Вклад', balances: [{ currency: 'RUB', balance: 1000 }] },
    { id: 2, name: 'Накопительный счёт', balances: [{ currency: 'RUB', balance: 2000 }] },
  ] });
  let saved;
  await page.route(/\/api\/goals\/$/, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { id: 1, ...saved } });
  });
  await page.goto('/goals');
  await page.getByRole('button', { name: '+ Цель', exact: true }).click();
  await page.getByPlaceholder('Название (например, Резервный фонд)').fill('Резерв');
  await page.locator('.goal-form input[type=number]').first().fill('5000');
  await page.getByLabel('Вклад', { exact: true }).check();
  await page.getByLabel('Накопительный счёт', { exact: true }).check();
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect.poll(() => saved?.account_ids).toEqual([1, 2]);
});


test('a recent suggestion prefills a schedule for review', async ({ page }) => {
  await mockApi(page, { '/api/automation/regular-payments': [{ key: 'internet', transaction_type: 'expense', amount: 799, currency: 'RUB', account_id: 1, account_name: 'Карта', category_id: 2, description: 'Интернет', cadence: 'еженедельно', occurrences: 3, last_date: '2026-09-14', next_date: '2026-09-21' }] });
  await page.goto('/reports');
  await page.getByRole('link', { name: 'Настроить повторение →' }).click();
  await expect(page.getByLabel('Сумма', { exact: true })).toHaveValue('799');
  await expect(page.getByLabel('Дата', { exact: true })).toHaveValue('2026-09-21');
  await page.getByRole('button', { name: 'Настроить повторение', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Периодичность', exact: true })).toHaveValue('weekly');
});


test('frequent category cloud distinguishes equal names by their groups', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await mockApi(page, {
    '/api/categories': [
      { id: 10, name: 'Жильё', type: 'expense', parent_id: null },
      { id: 11, name: 'Ремонт', type: 'expense', parent_id: 10 },
      { id: 20, name: 'Автомобиль', type: 'expense', parent_id: null },
      { id: 21, name: 'Ремонт', type: 'expense', parent_id: 20 },
    ],
    '/api/transactions/frequent-categories': [
      { id: 11, name: 'Ремонт', uses: 12 }, { id: 21, name: 'Ремонт', uses: 3 },
    ],
  });
  await page.goto('/planning?section=create');
  await page.locator('.planning-form .category-picker-trigger').click();
  const cloud = page.locator('.category-picker-frequent');
  await expect(cloud.getByRole('button', { name: 'Жильё Ремонт' })).toBeVisible();
  const car = cloud.getByRole('button', { name: 'Автомобиль Ремонт' });
  await expect(car).toBeVisible();
  await page.getByPlaceholder('Поиск категории').fill('Автомобиль');
  await expect(cloud.getByRole('button')).toHaveCount(1);
  await car.click();
  await expect(page.locator('.planning-form .category-picker-trigger')).toContainText('Автомобиль → Ремонт');
});
