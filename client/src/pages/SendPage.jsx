import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { accounts, sendEmail, templates } from '../services/mailflow.service'

export default function SendPage() {
  const location = useLocation()
  const incomingTemplate = location.state
  const [list, setList] = useState([])
  const [savedTemplates, setSavedTemplates] = useState([])
  const [form, setForm] = useState({ emailAccountId: '', to: '', cc: '', bcc: '', subject: incomingTemplate?.subject || '', html: incomingTemplate?.html || '' })
  const [show, setShow] = useState(false)
  const [result, setResult] = useState('')
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const a = await accounts()
        if (cancelled) return
        setList(a)
        if (a.length) {
          set('emailAccountId', (a.find((x) => x.isDefault) || a[0])?.id || '')
        }
      } catch {
          // handled by UI fallback
        }
    })()
    templates()
      .then((data) => {
        if (!cancelled) setSavedTemplates(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setResult('')
    try {
      await sendEmail(form)
      setResult(`Email sent successfully to ${form.to}.`)
      setForm((f) => ({ ...f, to: '', cc: '', bcc: '', subject: '', html: '' }))
    } catch {
      setResult('Email could not be sent. Check the connected account and try again.')
    }
  }

  if (!list.length) {
    return (
      <section className="panel empty-state">
        <h1>Connect an email account first</h1>
        <p>Once connected, you can send an email in seconds.</p>
        <Link className="button button-primary" to="/email-accounts">Connect Email</Link>
      </section>
    )
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h1>Send Email</h1>
          <p>Write a message and send it from your connected account.</p>
        </div>
        <Link className="text-link" to="/send/bulk">Send Bulk Email</Link>
      </section>
      <form className="panel page-stack composer" onSubmit={submit}>
        <label>
          From
          <select value={form.emailAccountId} onChange={(e) => set('emailAccountId', e.target.value)}>
            {list.map((a) => (
              <option key={a.id} value={a.id}>
            {a.provider === 'gmail' ? 'Gmail' : 'SMTP'} · {a.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <input required type="email" value={form.to} onChange={(e) => set('to', e.target.value)} placeholder="recipient@example.com" />
        </label>
        <button type="button" className="text-link" onClick={() => setShow(!show)}>Cc / Bcc</button>
        {show && (
          <div className="composer-row">
            <label>Cc<input value={form.cc} onChange={(e) => set('cc', e.target.value)} /></label>
            <label>Bcc<input value={form.bcc} onChange={(e) => set('bcc', e.target.value)} /></label>
          </div>
        )}
        <label>
          Subject
          <input required value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Enter subject" />
        </label>
        {savedTemplates.length > 0 && (
          <label>
            Use a template
            <select
              defaultValue=""
              onChange={(e) => {
                const t = savedTemplates.find((x) => x._id === e.target.value)
                if (t) {
                  setForm((f) => ({ ...f, subject: t.subject, html: t.html }))
                }
              }}
            >
              <option value="">Choose a template (optional)</option>
              {savedTemplates.map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Message
          <textarea required rows="12" value={form.html} onChange={(e) => set('html', e.target.value)} placeholder="Write your email..." />
        </label>
        {result && (
          <p className={result.startsWith('Email sent') ? 'success-message' : 'login-error'}>
            {result}
          </p>
        )}
        <div className="composer-actions">
          <Link className="button button-secondary" to="/templates">Manage templates</Link>
          <button className="button button-primary">Send Email</button>
        </div>
      </form>
    </div>
  )
}
