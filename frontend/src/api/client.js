import axios from 'axios'

// Базовый URL нашего FastAPI backend
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

// Перехватчик запросов — автоматически добавляет JWT токен в каждый запрос
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Перехватчик ответов — нормализует ошибки, чтобы во всех catch
// `e.response?.data?.detail` всегда содержал понятный человеку текст.
client.interceptors.response.use(
  (res) => res,
  (error) => {
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