import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_FULL_VERSION } from './src/config/version.js'

function versionAssetPlugin() {
  return {
    name: 'casemoney-version-asset',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: APP_FULL_VERSION }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    versionAssetPlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.js',
      // Новая сборка ждёт явного подтверждения пользователя. Это защищает
      // незавершённый ввод операции от неожиданной перезагрузки PWA.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon.svg', 'icons/*.png'],
      manifest: {
        name: 'CaseMoney — личная бухгалтерия',
        short_name: 'CaseMoney',
        description: 'Учёт личных и семейных финансов: счета, операции, бюджеты, цели, кредиты, импорт и отчёты.',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#173a54',
        background_color: '#f6f2e9',
        icons: [
          { src: '/icons/icon-48.png',  sizes: '48x48',   type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-72.png',  sizes: '72x72',   type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-96.png',  sizes: '96x96',   type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-256.png', sizes: '256x256', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon.svg',           sizes: 'any',     type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'] },
      devOptions: {
        enabled: false, // включить только если нужно тестировать SW в dev
      },
    }),
  ],
})
