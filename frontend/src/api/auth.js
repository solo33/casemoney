import client from './client'

// Регистрация нового пользователя
export const register = (data) => client.post('/api/auth/register', data)

// Логин — возвращает JWT токен
export const login = (data) => client.post('/api/auth/login', data)