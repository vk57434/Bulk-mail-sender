import { useCallback, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const { logout } = useAuth()
  const location = useLocation()

  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} onClose={closeMenu} onLogout={() => logout()} />
      <div className="main-column"><Header onMenuClick={() => setMenuOpen(true)} /><main className="page-content" key={location.pathname}><Outlet /></main><footer className="app-footer"><span>Mailflow <span className="footer-dot">·</span> Campaign operations</span><span>Respectful sending, one message at a time.</span></footer></div>
    </div>
  )
}