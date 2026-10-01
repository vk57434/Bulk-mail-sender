import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import useAuth from './hooks/useAuth'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import Layout from './components/Layout'
import Loading from './components/Loading'
import ErrorBoundary from './components/ErrorBoundary'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import TemplatesPage from './pages/TemplatesPage'
import BulkSendPage from './pages/BulkSendPage'
import SettingsPage from './pages/SettingsPage'
import SendPage from './pages/SendPage'
import EmailAccountsPage from './pages/EmailAccountsPage'
import HistoryPage from './pages/HistoryPage'
import CampaignsPage from './pages/CampaignsPage'
import CampaignDetailPage from './pages/CampaignDetailPage'
import CampaignFormPage from './pages/CampaignFormPage'
import RecipientsPage from './pages/RecipientsPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import './App.css'

function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <Loading label="Restoring your session..." />
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

function LoginRoute() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <Loading label="Restoring your session..." />
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : (
    <div className="public-login-shell">
      <LoginPage />
      <Link className="login-privacy-link" to="/privacy-policy">Privacy Policy</Link>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<ErrorBoundary><Layout /></ErrorBoundary>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/campaigns/new" element={<CampaignFormPage />} />
          <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
          <Route path="/campaigns/:id/edit" element={<CampaignFormPage />} />
          <Route path="/recipients" element={<RecipientsPage />} />
          <Route path="/send" element={<SendPage />} />
          <Route path="/send/bulk" element={<BulkSendPage />} />
          <Route path="/email-accounts" element={<EmailAccountsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider><AppRoutes /></ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
