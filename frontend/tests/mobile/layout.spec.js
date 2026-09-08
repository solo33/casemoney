import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures';

const paths = ['/home','/transactions','/accounts','/reports','/reports/annual','/reports/balances','/reports/yoy','/budget','/planning','/goals','/shopping','/settings/family','/credits','/deposits','/import','/import/file','/import/tbank','/settings/personal','/settings/categories','/settings/currencies','/settings/automation','/settings/billing','/history','/bank-drafts','/admin','/help','/about','/roadmap','/articles','/login','/register','/forgot-password','/reset-password','/privacy','/terms','/cookies','/'];
for (const width of [320,375,430,1280]) {
  test(`all routes fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await mockApi(page);
    const failures = [];
    let current = '';
    page.on('pageerror', e => failures.push(`${current}: ${e.message}`));
    page.on('console', message => {
      if (message.type() === 'error' && /controlled.*uncontrolled|uncontrolled.*controlled/.test(message.text())) {
        failures.push(`${current}: ${message.text()}`);
      }
    });
    for (const path of paths) {
      current = path;
      await page.goto(path, { waitUntil: 'networkidle' });
      const result = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        text: document.body.innerText.length,
        overflowing: [...document.querySelectorAll('body *')].filter(el => {
          if (el.closest('.table-wrap,.tbank-table-wrap,.plan-table-wrap,.recharts-wrapper')) return false;
          const r = el.getBoundingClientRect();
          // Text intentionally clipped by an ellipsis ancestor is not a page
          // overflow; the ancestor itself is still checked independently.
          let parent = el.parentElement;
          while (parent && parent !== document.body) {
            const style = getComputedStyle(parent);
            const bounds = parent.getBoundingClientRect();
            if (style.overflowX === 'hidden' && style.textOverflow === 'ellipsis' && bounds.left >= 0 && bounds.right <= innerWidth) return false;
            parent = parent.parentElement;
          }
          return r.width > 0 && (r.right > innerWidth + 2 || r.left < -2);
        }).slice(0, 8).map(el => `${el.tagName}.${el.className} ${el.textContent.slice(0,60)} parent=${el.parentElement.className} rect=${Math.round(el.getBoundingClientRect().right)}`),
      }));
      if (result.width > width + 2 || result.text < 25 || result.overflowing.length) {
        failures.push(`${path}: ${JSON.stringify(result)}`);
        await page.screenshot({ path: test.info().outputPath(path.replaceAll('/', '_') + '.png') });
      }
    }
    expect(failures).toEqual([]);
  });
}
test('annual mobile total and drilldown preserve the full year', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await mockApi(page); await page.goto('/reports/annual');
  await expect(page.locator('.mobile-period-select select')).toHaveValue('year');
  await expect(page.locator('.mobile-report-totals')).toContainText('186');
  await page.locator('.mobile-report-row').first().click();
  await expect(page).toHaveURL(/date_from=\d{4}-01-01.*date_to=\d{4}-12-31/);
});
