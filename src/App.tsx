import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from './hooks/useAuth'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Board from './pages/Board'
import Accounts from './pages/Accounts'
import Operations from './pages/Operations'
import Trades from './pages/Trades'
import Bilancio from './pages/Bilancio'
import Id from './pages/Id'
import TabellaOperativita from './pages/TabellaOperativita'
import PropFirm from './pages/PropFirm'
import PropCounter from './pages/PropCounter'
import CalendarioPayout from './pages/CalendarioPayout'
import Users from './pages/Users'
import Outlook from './pages/Outlook'
import Settings from './pages/Settings'
import Install from './pages/Install'
import MicrosoftCallback from './pages/MicrosoftCallback'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/microsoft-callback" element={<MicrosoftCallback />} />
          <Route
            path="/"
            element={
              <AuthGuard>
                <Layout />
              </AuthGuard>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"           element={<Dashboard />} />
            <Route path="board"               element={<Board />} />
            <Route path="accounts"            element={<Accounts />} />
            <Route path="operations"          element={<Operations />} />
            <Route path="trades"              element={<Trades />} />
            <Route path="bilancio"            element={<Bilancio />} />
            <Route path="id"                  element={<Id />} />
            <Route path="tabella-operativita" element={<TabellaOperativita />} />
            <Route path="propfirm"            element={<PropFirm />} />
            <Route path="prop-counter"        element={<PropCounter />} />
            <Route path="calendario-payout"   element={<CalendarioPayout />} />
            <Route path="users"               element={<Users />} />
            <Route path="outlook"             element={<Outlook />} />
            <Route path="settings"            element={<Settings />} />
            <Route path="install"             element={<Install />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
