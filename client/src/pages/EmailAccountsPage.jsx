import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Mail, Plus, X } from 'lucide-react'
import { accounts, accountConfig, addAccount, gmailConnect, removeAccount, setDefaultAccount, testAccount } from '../services/mailflow.service'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import useToast from '../hooks/useToast'

const initialForm = { email: '', host: '', port: '587', security: 'tls', username: '', password: '', displayName: '' }

function useQueryParams() {
  return new URLSearchParams(useLocation().search)
}

export default function EmailAccountsPage() {
  const { notify } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const query = useQueryParams()

  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [provider, setProvider] = useState('')
  const [gmailConfigured, setGmailConfigured] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [busy, setBusy] = useState(false)
  const [gmailBusy, setGmailBusy] = useState(false)
  const [formMessage, setFormMessage] = useState('')

  const startGmailConnect = useCallback(async () => {
    if (gmailBusy) return
    if (!gmailConfigured) {
      notify('Gmail OAuth is not configured on this server yet. Ask your administrator to set Google OAuth environment variables and configure the OAuth Consent Screen.', 'error')
      return
    }
    setGmailBusy(true)
    closeModal()
    try {
      const result = await gmailConnect()
      if (!result?.authUrl) throw new Error('Missing authUrl from Gmail connect response.')
      window.location.assign(result.authUrl)
    } catch (err) {
      notify(err?.message || 'Unable to start Gmail connection. Please try again.', 'error')
      setGmailBusy(false)
    }
  }, [gmailBusy, gmailConfigured, notify])

  const clearQuery = useCallback(() => {
    const next = new URLSearchParams(location.search)
    let changed = false
    ;['connected', 'error', 'message'].forEach((k) => {
      if (next.has(k)) {
        next.delete(k)
        changed = true
      }
    })
    if (changed) {
      navigate(`${location.pathname}${next.toString() ? `?${next.toString()}` : ''}`, { replace: true })
    }
  }, [location, navigate])

  useEffect(() => {
    const connected = query.get('connected')
    const qError = query.get('error')
    const qMessage = query.get('message')
    if (connected === 'gmail') {
      notify('Gmail account connected successfully.')
      clearQuery()
    } else if (qError) {
      notify(qMessage || 'Gmail connection failed. Try again or use SMTP.')
      clearQuery()
    }
  }, [query, notify, clearQuery])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [result, cfg] = await Promise.all([accounts(), accountConfig().catch(() => ({ gmailConfigured: false }))
      ])
      setGmailConfigured(Boolean(cfg?.gmailConfigured))
      if (!Array.isArray(result)) {
        throw new Error('Invalid email accounts response.')
      }
      setList(result)
    } catch (requestError) {
      console.error('Unable to load email accounts:', requestError)
      setError('Unable to load this page.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const [result, cfg] = await Promise.all([
          accounts(),
          accountConfig().catch(() => ({ gmailConfigured: false })),
        ])
        setGmailConfigured(Boolean(cfg?.gmailConfigured))
        if (cancelled) return
        if (!Array.isArray(result)) {
          throw new Error('Invalid email accounts response.')
        }
        setList(result)
      } catch (requestError) {
        if (cancelled) return
        console.error('Unable to load email accounts:', requestError)
        setError('Unable to load this page.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const closeModal = () => {
    if (busy) return
    setModalOpen(false)
    setProvider('')
    setForm(initialForm)
    setFormMessage('')
  }

  const openProvider = (initialProvider) => {
    if (initialProvider === 'gmail') {
      startGmailConnect()
      return
    }
    setProvider(initialProvider)
    setFormMessage('')
    setModalOpen(true)
  }

  async function run(action, successText) {
    setFormMessage('')
    try {
      await action()
      notify(successText, 'success')
      await load()
    } catch (requestError) {
      console.error('Email account action failed:', requestError)
      notify(requestError.message || 'Action failed.', 'error')
    }
  }

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setFormMessage('')
    try {
      await addAccount(form)
      notify('Email account connected.', 'success')
      closeModal()
      await load()
    } catch (requestError) {
      console.error('Unable to save SMTP account:', requestError)
      setFormMessage(requestError.message || 'Unable to connect this email account.')
    } finally {
      setBusy(false)
    }
  }

  async function testConnection() {
    setBusy(true)
    setFormMessage('')
    try {
      const account = await addAccount(form)
      await testAccount(account.id)
      notify('Connection verified and account saved.', 'success')
      closeModal()
      await load()
    } catch (requestError) {
      console.error('Unable to test SMTP account:', requestError)
      setFormMessage(requestError.message || 'Unable to verify this connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack email-accounts-page">
      <section className="page-intro">
        <div>
          <h1>Email Accounts</h1>
          <p>Connect your email account to send emails from your own email address.</p>
        </div>
        <button className="button button-primary" onClick={() => openProvider('')} type="button">
          <Plus size={17} /> Connect Email
        </button>
      </section>

      {loading ? (
        <section className="panel">
          <Loading label="Loading email accounts..." />
        </section>
      ) : error ? (
        <section className="panel">
          <div className="error-state" role="alert">
            <span>{error}</span>
            <button className="button button-primary" onClick={load} type="button">
              <Plus size={14} /> Try Again
            </button>
          </div>
        </section>
      ) : list.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={Mail}
            title="No email accounts connected yet."
            description="Connect Gmail or SMTP to start sending emails from your own address."
            action={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button className="button button-secondary" onClick={() => openProvider('gmail')} type="button">
                  Connect Gmail
                </button>
                <button className="button button-primary" onClick={() => openProvider('smtp')} type="button">
                  Connect SMTP
                </button>
              </div>
            }
          />
        </section>
      ) : (
        <section className="account-grid">
          {list.map((account) => (
            <article className="panel account-card" key={account.id}>
              <div>
                <strong>{account.provider === 'gmail' ? 'Gmail' : 'SMTP'}</strong>
                <p>{account.email}</p>
                <span className="status-badge status-sent">
                  <span className="status-dot" /> Connected{account.isDefault ? ' · Default' : ''}
                </span>
              </div>
              <div className="account-actions">
                <Link className="button button-secondary button-small" to="/send">
                  Send Email
                </Link>
                {!account.isDefault && (
                  <button
                    className="button button-secondary button-small"
                    onClick={() => void run(() => setDefaultAccount(account.id), 'Default email account updated.')}
                    type="button"
                  >
                    Set Default
                  </button>
                )}
                <button
                  className="button button-secondary button-small"
                  onClick={() => void run(() => testAccount(account.id), 'Connection verified.')}
                  type="button"
                >
                  Test
                </button>
                <button
                  className="button button-destructive button-small"
                  onClick={() => void run(() => removeAccount(account.id), 'Email account disconnected.')}
                  type="button"
                >
                  Disconnect
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {modalOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) closeModal()
        }}>
          <section className="confirm-dialog connect-dialog" role="dialog" aria-modal="true" aria-labelledby="connect-title">
            <button className="icon-button connect-close" onClick={closeModal} aria-label="Close" type="button" disabled={busy}>
              <X size={18} />
            </button>
            <h2 id="connect-title">Connect your email</h2>
            {!provider && (
              <>
                <p>Choose the provider you want to use with MailFlow.</p>
                <div className="provider-options">
                  <button className="button button-secondary" onClick={() => setProvider('gmail')} type="button">
                    Gmail
                  </button>
                  <button className="button button-primary" onClick={() => setProvider('smtp')} type="button">
                    SMTP
                  </button>
                </div>
              </>
            )}
            {provider === 'gmail' && (
              <>
                {gmailConfigured ? (
                  <>
                    <p>You will be redirected to Google to approve Gmail sending access. Choose the account you want to connect, then you will be returned here.</p>
                    <div className="dialog-actions">
                      <button className="button button-secondary" onClick={() => setProvider('')} type="button" disabled={busy || gmailBusy}>
                        Back
                      </button>
                      <button
                        className="button button-primary"
                        onClick={() => void startGmailConnect()}
                        type="button"
                        disabled={busy || gmailBusy}
                      >
                        {gmailBusy ? 'Connecting to Google…' : 'Open Google sign-in'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>Gmail OAuth is not configured on this server yet. Ask your administrator to add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI to the backend environment, and register the callback URL in Google Cloud Console.</p>
                    <button className="button button-secondary" onClick={() => setProvider('')} type="button" disabled={busy}>
                      Back
                    </button>
                  </>
                )}
              </>
            )}
            {provider === 'smtp' && (
              <form className="page-stack" onSubmit={save} style={{ gap: 12 }}>
                <div className="composer-row">
                  <label>
                    Email
                    <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} disabled={busy} />
                  </label>
                  <label>
                    Port
                    <input required value={form.port} onChange={(e) => set('port', e.target.value)} disabled={busy} />
                  </label>
                </div>
                <label>
                  SMTP Host
                  <input required value={form.host} onChange={(e) => set('host', e.target.value)} disabled={busy} />
                </label>
                <label>
                  Security
                  <select value={form.security} onChange={(e) => set('security', e.target.value)} disabled={busy}>
                    <option value="tls">TLS</option>
                    <option value="ssl">SSL</option>
                  </select>
                </label>
                <label>
                  Username
                  <input required value={form.username} onChange={(e) => set('username', e.target.value)} disabled={busy} />
                </label>
                <label>
                  Password
                  <input required type="password" value={form.password} onChange={(e) => set('password', e.target.value)} disabled={busy} />
                </label>
                {formMessage && <p className="login-error">{formMessage}</p>}
                <div className="dialog-actions">
                  <button type="button" className="button button-secondary" onClick={() => void testConnection()} disabled={busy}>
                    Test Connection
                  </button>
                  <button className="button button-primary" disabled={busy} type="submit">
                    {busy ? 'Saving...' : 'Save Account'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
