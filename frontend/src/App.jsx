import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Activate from './pages/Activate'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Privacy from './pages/legal/Privacy'
import Terms from './pages/legal/Terms'
import Home from './pages/Home'
import Reports from './pages/Reports'
import AnnualReport from './pages/AnnualReport'
import AnnualBalances from './pages/AnnualBalances'
import Goals from './pages/Goals'
import Admin from './pages/Admin'
import Accounts from './pages/Accounts'
import Categories from './pages/Categories'
import Currencies from './pages/Currencies'
import Import from './pages/Import'
import ImportHomeMoney from './pages/ImportHomeMoney'
import Transactions from './pages/Transactions'
import Settings from './pages/Settings'
import History from './pages/History'
import Nav from './components/Nav'
import QuickAddFab from './components/QuickAddFab'
import EmailVerifyBanner from './components/EmailVerifyBanner'
import { UserProvider } from './contexts/UserContext'

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return (
    <UserProvider>
      <Nav />
      <EmailVerifyBanner />
      {children}
      <QuickAddFab />
    </UserProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/activate" element={<Activate />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports/annual"
          element={
            <ProtectedRoute>
              <AnnualReport />
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports/balances"
          element={
            <ProtectedRoute>
              <AnnualBalances />
            </ProtectedRoute>
          }
        />

        <Route
          path="/goals"
          element={
            <ProtectedRoute>
              <Goals />
            </ProtectedRoute>
          }
        />

        {/* старый /dashboard теперь редиректит на /reports */}
        <Route path="/dashboard" element={<Navigate to="/reports" replace />} />

        <Route
          path="/accounts"
          element={
            <ProtectedRoute>
              <Accounts />
            </ProtectedRoute>
          }
        />

        <Route
          path="/categories"
          element={
            <ProtectedRoute>
              <Categories />
            </ProtectedRoute>
          }
        />

        <Route
          path="/currencies"
          element={
            <ProtectedRoute>
              <Currencies />
            </ProtectedRoute>
          }
        />

        <Route
          path="/import"
          element={
            <ProtectedRoute>
              <Import />
            </ProtectedRoute>
          }
        />

        <Route
          path="/import/homemoney"
          element={
            <ProtectedRoute>
              <ImportHomeMoney />
            </ProtectedRoute>
          }
        />

        <Route
          path="/transactions"
          element={
            <ProtectedRoute>
              <Transactions />
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />

        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
