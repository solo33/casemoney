import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import { APP_FULL_VERSION } from './config/version.js'

// Service worker не активирует новую сборку сам: пользователь видит понятное
// предложение обновиться и сам выбирает момент перезапуска.
let reloadingForUpdate = false
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return
    reloadingForUpdate = true
    window.location.reload()
  })
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    const update = () => updateSW(true)
    // Сохраняем callback, чтобы предложение не потерялось, если service worker
    // успел обнаружить сборку раньше монтирования защищённого интерфейса.
    window.__casemoneyPwaUpdate = update
    window.dispatchEvent(new CustomEvent('casemoney:pwa-update-available', { detail: { update } }))
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    registration.update()
    window.setInterval(() => registration.update(), 10 * 60 * 1000)
  },
})

async function checkServerVersion() {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return
    const { version } = await response.json()
    if (!version || version === APP_FULL_VERSION || !('serviceWorker' in navigator)) return

    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.update()))
    // registration.update() загрузит новую сборку и вызовет onNeedRefresh.
    // Не активируем её здесь — пользователь должен подтвердить перезапуск.
  } catch {
    // Проверка версии не должна мешать работе приложения без сети.
  }
}

checkServerVersion()
window.setInterval(checkServerVersion, 5 * 60 * 1000)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkServerVersion()
})

// Keep the one-shot browser install prompt until the user clicks our link.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  window.__casemoneyInstallPrompt = event
  window.dispatchEvent(new Event('casemoney:pwa-install-available'))
})

window.addEventListener('appinstalled', () => {
  window.__casemoneyInstallPrompt = null
})

window.__casemoneyCheckForUpdates = async () => {
  const registrations = await navigator.serviceWorker?.getRegistrations?.() || []
  await Promise.all(registrations.map(registration => registration.update()))
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
