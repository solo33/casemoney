import { test, expect } from '@playwright/test';
import { mockApi, user, family } from './fixtures';

test('family sections isolate forms, keep the selected month and support old links', async ({ page }) => {
  await mockApi(page);
  await page.goto('/settings/family');
  await expect(page).toHaveURL(/\/family$/);
  await expect(page.getByRole('heading', { name: 'Последние общие покупки' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Участники', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Семейный отчёт' })).toHaveCount(0);
  await page.getByLabel('Месяц семейного отчёта').fill('2026-08');
  await page.getByRole('navigation', { name: 'Разделы семьи' }).getByRole('link', { name: 'Покупки', exact: true }).click();
  await expect(page.getByLabel('Месяц семейного отчёта')).toHaveValue('2026-08');
  await expect(page.getByRole('heading', { name: 'Перенести общие покупки в мой учёт' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Зафиксировать возмещение' })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Разделы семьи' }).getByRole('link', { name: 'Расчёты', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Зафиксировать возмещение' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'История возмещений за месяц' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Разделы семьи' }).getByRole('link', { name: 'Статистика', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Семейный отчёт' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeVisible();
  await page.locator('.family-settings-link').click();
  await expect(page.getByRole('heading', { name: 'Участники', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Доступ к моим счетам' })).toBeVisible();
  await expect(page.getByLabel('Месяц семейного отчёта')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Общие покупки', exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByLabel('Месяц семейного отчёта')).toHaveValue('2026-08');
});

test('member permissions and family setup survive the new routes', async ({ page }) => {
  await mockApi(page, { '/api/family': { family: { ...family, current_user_role: 'viewer' }, pending_invitations: [] } });
  for (const path of ['/family/purchases', '/family/settlements', '/family/settings']) {
    await page.goto(path);
    await expect(page.locator('.family-page-heading')).toContainText('Наблюдатель');
    await expect(page.getByRole('button', { name: 'Пригласить', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Перенести общие покупки в мой учёт' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Зафиксировать возмещение' })).toHaveCount(0);
  }
});

test('a user without a family can create one or accept an invitation', async ({ page }) => {
  await mockApi(page, { '/api/family': { family: null, pending_invitations: [{ id: 2, family_name: 'Родные' }] } });
  await page.goto('/family');
  await expect(page.getByRole('heading', { name: 'Создать семейное пространство' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Принять приглашение' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Разделы семьи' })).toHaveCount(0);
});

test('mobile More groups navigation, traps focus and links to the standalone family', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await mockApi(page);
  await page.goto('/home');
  const trigger = page.getByRole('button', { name: 'Открыть дополнительные разделы' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Ещё' });
  await expect(dialog.getByRole('heading', { name: 'Совместные финансы' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Планирование' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Работа с записями' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Расписание' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Валюты', exact: true })).toBeHidden();
  await dialog.locator('summary').filter({ hasText: /^Настройки$/ }).click();
  await expect(dialog.getByRole('link', { name: 'Тариф и оплата' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Закрыть меню' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator('summary').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Закрыть меню' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('dialog').getByRole('link', { name: 'Семья', exact: true }).click();
  await expect(page).toHaveURL(/\/family$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toHaveClass(/is-active/);
  await page.screenshot({ path: test.info().outputPath('family-mobile.png'), fullPage: true });
  await trigger.click();
  await page.screenshot({ path: test.info().outputPath('more-mobile.png') });
});

test('personal mode keeps shopping and hides family-only menu groups', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await mockApi(page, { '/api/me': { ...user, preferred_mode: 'personal', family_access: false, is_admin: false } });
  await page.goto('/home');
  await page.getByRole('button', { name: 'Открыть дополнительные разделы' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Планирование' })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'Семья', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'Списки покупок' })).toBeVisible();
  await dialog.locator('summary').filter({ hasText: 'Помощь и приложение' }).click();
  await expect(dialog.getByRole('link', { name: 'Администрирование' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible();
  await page.goto('/family/settings');
  await expect(page).toHaveURL(/\/settings\/billing$/);
});

test('recurring family suggestions move to planning and refresh after creation', async ({ page }) => {
  await mockApi(page);
  let created = false;
  await page.route('**/api/family/recurring-suggestions**', async route => {
    if (route.request().method() === 'POST') { created = true; await route.fulfill({ json: {} }); return; }
    await route.fulfill({ json: { items: created ? [] : [{ fingerprint: 'rent', description: 'Аренда квартиры', currency: 'RUB', amount: 30000, change_amount: 0, occurrences: 3, frequency_label: 'Ежемесячно', next_date: '2026-10-01', can_create: true }] } });
  });
  await page.goto('/family');
  await page.getByRole('link', { name: /Предложения регулярных платежей/ }).click();
  await expect(page).toHaveURL(/\/planning#family-suggestions$/);
  await expect(page.locator('#family-suggestions')).toContainText('Аренда квартиры');
  await page.locator('#family-suggestions').getByRole('button', { name: 'Добавить в план' }).click();
  await expect(page.locator('#family-suggestions')).toContainText('Регулярный общий платёж добавлен в план');
  await expect(page.locator('#family-suggestions')).not.toContainText('Аренда квартиры');
});
