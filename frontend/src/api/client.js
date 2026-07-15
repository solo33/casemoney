import axios from 'axios'

// Базовый URL нашего FastAPI backend.
// Если VITE_API_URL не задан — берём тот же хост, с которого открыт фронт
// (localhost, 127.0.0.1 или IP в локальной сети), и порт 8000. Так при смене
// IP машины роутером (DHCP) не нужно править .env — просто открой фронт по
// новому адресу, бэкенд найдётся сам.
const DEFAULT_API_URL = `${window.location.protocol}//${window.location.hostname}:8000`

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || DEFAULT_API_URL,
})

let activeRequests = 0

function publishRequestCount() {
  window.__casemoneyActiveRequests = activeRequests
  window.dispatchEvent(new CustomEvent('casemoney:network-progress', {
    detail: { activeRequests },
  }))
}

function startRequest(config) {
  if (config?.skipGlobalProgress || config?.__casemoneyTracked) return config
  config.__casemoneyTracked = true
  activeRequests += 1
  publishRequestCount()
  return config
}

function finishRequest(config) {
  if (!config?.__casemoneyTracked) return
  config.__casemoneyTracked = false
  activeRequests = Math.max(0, activeRequests - 1)
  publishRequestCount()
}

// Перехватчик запросов — автоматически добавляет JWT токен в каждый запрос
client.interceptors.request.use((config) => {
  startRequest(config)
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Перехватчик ответов — нормализует ошибки, чтобы во всех catch
// `e.response?.data?.detail` всегда содержал понятный человеку текст.
client.interceptors.response.use(
  (res) => {
    finishRequest(res.config)
    return res
  },
  (error) => {
    finishRequest(error.config)
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('token')
      window.location.href = '/login'
      return new Promise(() => {})  // редирект уже идёт, дальше обрабатывать нечего
    }
    if (!error.response) {
      // Сеть/таймаут/бэкенд не запущен — ответа нет вообще
      error.response = {
        data: { detail: 'Сервер недоступен. Проверьте соединение и попробуйте позже.' },
      }
    } else {
      const { status, data } = error.response
      if (status >= 500) {
        error.response.data = { ...data, detail: 'Ошибка сервера. Попробуйте позже.' }
      } else if (data?.detail && typeof data.detail !== 'string') {
        // FastAPI 422: detail — массив объектов валидации
        error.response.data = { ...data, detail: 'Проверьте правильность заполнения полей.' }
      }
    }
    return Promise.reject(error)
  }
)

export default client
