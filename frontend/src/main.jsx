import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// Регистрация service worker — autoUpdate включен в vite.config.js,
// новая версия автоматически активируется при следующем визите.
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
    updateSW(true)
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    registration.update()
    window.setInterval(() => registration.update(), 10 * 60 * 1000)
  },
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
