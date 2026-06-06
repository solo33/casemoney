import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import QuickAddFab from './components/QuickAddFab'
import EmailVerifyBanner from './components/EmailVerifyBanner'
import { UserProvider } from './contexts/UserContext'

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Activate = lazy(() => import('./pages/Activate'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Privacy = lazy(() => import('./pages/legal/Privacy'))
const Terms = lazy(() => import('./pages/legal/Terms'))
const Home = lazy(() => import('./pages/Home'))
const Reports = lazy(() => import('./pages/Reports'))
const AnnualReport = lazy(() => import('./pages/AnnualReport'))
const AnnualBalances = lazy(() => import('./pages/AnnualBalances'))
const Goals = lazy(() => import('./pages/Goals'))
const Admin = lazy(() => import('./pages/Admin'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Categories = lazy(() => import('./pages/Categories'))
const Currencies = lazy(() => import('./pages/Currencies'))
const Import = lazy(() => import('./pages/Import'))
const ImportHomeMoney = lazy(() => import('./pages/ImportHomeMoney'))
const Transactions = lazy(() => import('./pages/Transactions'))
const Settings = lazy(() => import('./pages/Settings'))
const History = lazy(() => import('./pages/History'))

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
      <Suspense fallback={<div className="page">Загрузка...</div>}>
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
      </Suspense>
    </BrowserRouter>
  )
}
