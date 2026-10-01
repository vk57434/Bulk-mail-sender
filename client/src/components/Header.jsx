import { useLocation } from 'react-router-dom'
import { Menu, Moon, Sun } from 'lucide-react'
import useAuth from '../hooks/useAuth'
import useTheme from '../hooks/useTheme'

const pageNames = {
  '/dashboard': 'Dashboard',
  '/campaigns': 'Campaigns',
  '/campaigns/new': 'Create campaign',
  '/recipients': 'Recipients',
  '/settings': 'Settings',
}

export default function Header({ onMenuClick }) {
  const location = useLocation()
  const { user } = useAuth()
  const { setTheme } = useTheme()
  const title = location.pathname.startsWith('/campaigns/') && location.pathname !== '/campaigns/new' ? 'Campaign details' : pageNames[location.pathname] || 'Mailflow'
  const activeTheme = document.documentElement.dataset.theme

  return (
    <header className="topbar">
      <div className="topbar-left"><button type="button" className="icon-button mobile-menu" aria-label="Open navigation" onClick={onMenuClick}><Menu size={20} /></button><div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{title}</strong></div></div>
      <div className="topbar-right"><span className="system-status"><span /> Service ready</span><button type="button" className="icon-button theme-toggle" aria-label={`Switch to ${activeTheme === 'dark' ? 'light' : 'dark'} mode`} title="Toggle color mode" onClick={() => setTheme(activeTheme === 'dark' ? 'light' : 'dark')}>{activeTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button><span className="header-divider" /><span className="header-user"><span className="avatar-small">{(user?.email || 'A').slice(0, 1).toUpperCase()}</span><span className="header-email">{user?.email || 'Admin'}</span></span></div>
    </header>
  )
}