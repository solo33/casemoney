import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/mobile', timeout: 180000, workers: 2,
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:5179', headless: true, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5179', url: 'http://127.0.0.1:5179', reuseExistingServer: true },
});
