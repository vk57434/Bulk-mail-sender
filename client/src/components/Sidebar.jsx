import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Mail, Settings, Send, X, FileText, History, Megaphone } from 'lucide-react'

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/send', label: 'Send Email', icon: Send },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/email-accounts', label: 'Email Accounts', icon: Mail },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/history', label: 'History', icon: History },
]

export default function Sidebar({ open, onClose, onLogout }) {
  const location = useLocation()
  useEffect(() => onClose(), [location.pathname, onClose])

  return (
    <>
      <button className={`drawer-scrim${open ? ' visible' : ''}`} aria-label="Close navigation" tabIndex={open ? 0 : -1} onClick={onClose} />
      <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Send size={17} fill="currentColor" /></span><span>Mail<span className="brand-light">flow</span></span><button type="button" className="icon-button sidebar-close" aria-label="Close menu" onClick={onClose}><X size={18} /></button></div>
        <div className="sidebar-caption">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/dashboard'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></NavLink>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note"><span className="note-spark" /><div><strong>Your workspace</strong><span>Send with confidence</span></div></div>
        <NavLink to="/settings" className={({ isActive }) => `nav-link settings-link${isActive ? ' active' : ''}`}><Settings size={18} /><span>Settings</span></NavLink>
        <button className="nav-link logout-link" type="button" onClick={onLogout}><span className="avatar-small">A</span><span>Sign out</span></button>
        <div className="sidebar-footer">MAILFLOW <span>v1.0</span></div>
      </aside>
    </>
  )
}
