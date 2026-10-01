import { useEffect, useState } from 'react'
import { history } from '../services/mailflow.service'
import StatusBadge from '../components/StatusBadge'
import { formatDate } from '../lib/format'

export default function HistoryPage() {
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    history({ q, status }).then(setItems).catch(() => setError('Unable to connect to MailFlow. Please try again.'))
  }, [q, status])

  const statusMap = {
    'SENT': 'sent',
    'FAILED': 'failed',
    'PENDING': 'queued',
    'PROCESSING': 'queued',
  }

  const normalizedStatus = (s) => statusMap[s] || s

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h1>Email History</h1>
          <p>See the status of every email you send.</p>
        </div>
      </section>
      <section className="panel table-panel">
        <div className="campaign-toolbar">
          <input
            className="search-field"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search email or subject"
          />
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="queued">Queued</option>
          </select>
        </div>
        {error && <p className="login-error">{error}</p>}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Subject</th>
                <th>From</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map(x => (
                <tr key={x._id}>
                  <td>{x.to?.join(', ')}</td>
                  <td>{x.subject}</td>
                  <td>{x.from}</td>
                  <td><StatusBadge status={normalizedStatus(x.status)} /></td>
                  <td>{formatDate(x.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && (
          <div className="empty-state">
            <h3>No emails found</h3>
            <p>Your sent email history will appear here.</p>
          </div>
        )}
      </section>
    </div>
  )
}
