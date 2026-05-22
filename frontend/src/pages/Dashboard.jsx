import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const navigate = useNavigate()

  const handleLogout = () => {
    // Удаляем токен и отправляем на логин
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div style={{ maxWidth: 800, margin: '50px auto', padding: 24 }}>
      <h2>CaseMoney — Dashboard</h2>
      <p>Добро пожаловать! 🎉</p>
      <button onClick={handleLogout}>Выйти</button>
    </div>
  )
}