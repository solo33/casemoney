import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

test('production PWA activates an update without deleting queued transactions', async ({ page, context }) => {
  const root = resolve('dist');
  let currentWorker = false;
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      response.setHeader('Cache-Control', 'no-store');
      if (pathname === '/service-worker.js' && !currentWorker) {
        response.setHeader('Content-Type', 'text/javascript');
        response.end("self.addEventListener('install', () => self.skipWaiting()); self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));");
        return;
      }
      const file = resolve(root, '.' + (extname(pathname) ? pathname : '/index.html'));
      if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
      response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(origin + '/about');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('casemoney-local-changes', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('mutations', { keyPath: 'id' });
        store.createIndex('userId', 'userId');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('mutations', 'readwrite');
        tx.objectStore('mutations').put({ id: 'pwa-regression', userId: 'test-user', kind: 'transaction', data: { amount: 330, currency: 'RUB' }, createdAt: '2026-09-01T12:00:00Z' });
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    }));
    currentWorker = true;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect(page.locator('.pwa-update-prompt')).toBeVisible({ timeout: 30000 });
    page.on('dialog', dialog => dialog.accept());
    await page.locator('.pwa-update-prompt').getByRole('button', { name: 'Обновить', exact: true }).click();
    await expect(page.locator('.pwa-update-prompt')).not.toBeVisible({ timeout: 30000 });
    const queued = await page.evaluate(() => new Promise(resolve => {
      const request = indexedDB.open('casemoney-local-changes', 1);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction('mutations').objectStore('mutations').get('pwa-regression');
        read.onsuccess = () => { db.close(); resolve(read.result); };
      };
    }));
    expect(queued.data.amount).toBe(330);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: /О программе CaseMoney/ })).toBeVisible();
  } finally {
    await context.setOffline(false);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
