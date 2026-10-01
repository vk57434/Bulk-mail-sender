import { Monitor, Moon, Sun, ShieldCheck, Timer, Waves } from 'lucide-react'
import useAuth from '../hooks/useAuth'
import useTheme from '../hooks/useTheme'

const themes = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
]

export default function SettingsPage() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()

  return (
    <div className="page-stack settings-page">
      <section className="page-intro"><div><span className="eyebrow"><span className="eyebrow-line" /> PREFERENCES</span><h1>Settings</h1><p>Workspace identity and appearance preferences.</p></div></section>
      <section className="settings-section"><div className="settings-section-title"><span className="section-icon"><ShieldCheck size={18} /></span><div><h2>Account</h2><p>Signed-in administrator identity.</p></div></div><div className="settings-content panel"><div className="settings-row"><div><label className="field-label">Admin email</label><p className="settings-description">Used for this authenticated session.</p></div><div className="account-email"><span className="avatar-small">{(user?.email || 'A').slice(0, 1).toUpperCase()}</span>{user?.email || 'Unknown admin'}</div></div></div></section>
      <section className="settings-section"><div className="settings-section-title"><span className="section-icon"><Sun size={18} /></span><div><h2>Appearance</h2><p>Choose how Mailflow looks on this device.</p></div></div><div className="settings-content panel"><div className="settings-row"><div><strong>Color theme</strong><p className="settings-description">Your preference is stored in this browser.</p></div><div className="theme-options" role="radiogroup" aria-label="Color theme">{themes.map(({ id, label, icon: Icon }) => <button type="button" role="radio" aria-checked={theme === id} className={theme === id ? 'theme-option selected' : 'theme-option'} key={id} onClick={() => setTheme(id)}><Icon size={16} />{label}</button>)}</div></div></div></section>
      <section className="settings-section"><div className="settings-section-title"><span className="section-icon"><Waves size={18} /></span><div><h2>Sending information</h2><p>Operational details for your queue.</p></div></div><div className="sending-info-grid"><article className="panel info-tile"><span className="info-tile-icon"><Timer size={18} /></span><span className="section-kicker">SENDING INTERVAL</span><strong>10 seconds</strong><small>Between queued email jobs</small></article><article className="panel info-tile"><span className="info-tile-icon"><Waves size={18} /></span><span className="section-kicker">QUEUE ENGINE</span><strong>BullMQ</strong><small>Redis-backed job processing</small></article></div><p className="security-note"><ShieldCheck size={15} /> SMTP and signing secrets are managed by the backend and are not exposed here.</p></section>
    </div>
  )
}