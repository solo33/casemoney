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

export default client