import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Ban, Check, Clock3, Edit3, FileSpreadsheet, Mail, Pause, Play, Trash2, Users, XCircle, Wifi, WifiOff } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getCampaign, getCampaignEventsToken, getCampaignRecipients, getCampaignStats, removeCampaign, runCampaignAction, uploadRecipients } from '../services/campaign.service'
import useToast from '../hooks/useToast'
import CampaignProgress from '../components/CampaignProgress'
import ConfirmDialog from '../components/ConfirmDialog'
import CsvUploader from '../components/CsvUploader'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import Pagination from '../components/Pagination'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { formatDate } from '../lib/format'

const terminalStates = ['completed', 'failed', 'cancelled']

function isOlderTimestamp(incoming, current) {
  return Boolean(incoming && current && new Date(incoming) < new Date(current))
}

function mergeEventIntoRecipient(items, recipientId, patch) {
  if (!Array.isArray(items)) return items
  let changed = false
  const next = items.map((r) => {
    if (String(r._id) !== String(recipientId)) return r
    // Prevent stale updates: only apply patch if it has a newer timestamp
    const patchTime = patch.updatedAt || patch.sentAt || patch.failedAt || patch.processingAt
    const existingTime = r.updatedAt || r.sentAt || r.failedAt || r.processingAt
    const terminalStatuses = ['sent', 'failed', 'cancelled']
    if (terminalStatuses.includes(String(r.status).toLowerCase()) && patch.status && String(patch.status).toLowerCase() !== String(r.status).toLowerCase()) {
      return r
    }
    if (isOlderTimestamp(patchTime, existingTime)) {
      // Patch is older, don't apply
      return r
    }
    changed = true
    const merged = { ...r, ...patch }
    return merged
  })
  return changed ? next : items
}

export default function CampaignDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { notify } = useToast()
  const eventSourceRef = useRef(null)
  const eventTokenRef = useRef('')
  const reconcileRef = useRef(null)
  const recipientEventsRef = useRef(new Map())

  const [campaign, setCampaign] = useState(null)
  const [stats, setStats] = useState(null)
  const [recipients, setRecipients] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [recipientStatus, setRecipientStatus] = useState('')
  const [initialRecipientsLoaded, setInitialRecipientsLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [recipientLoading, setRecipientLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadValidationResult, setUploadValidationResult] = useState(null)
  const [pendingUploadFile, setPendingUploadFile] = useState(null)
  const [confirmation, setConfirmation] = useState('')
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [connectionStatus, setConnectionStatus] = useState('connecting')

  useEffect(() => {
    recipientEventsRef.current.clear()
  }, [id])

  const applyStatsPatch = useCallback((patch) => {
    setStats((prev) => {
      if (prev && isOlderTimestamp(patch.updatedAt, prev.updatedAt)) return prev
      if (!prev) return { ...patch }
      const next = { ...prev }
      const keys = ['total', 'pending', 'processing', 'sent', 'failed', 'cancelled', 'processed', 'percentage', 'updatedAt', 'startedAt', 'completedAt']
      for (const k of keys) {
        if (patch[k] !== undefined) next[k] = patch[k]
      }
      return next
    })
    setCampaign((prev) => {
      if (!prev) return prev
      if (isOlderTimestamp(patch.updatedAt, prev.updatedAt)) return prev
      const next = { ...prev }
      const mapKeys = {
        total: 'totalRecipients',
        pending: 'pendingCount',
        processing: 'processingCount',
        sent: 'sentCount',
        failed: 'failedCount',
        cancelled: 'cancelledCount',
      }
      let changed = false
      for (const [k, target] of Object.entries(mapKeys)) {
        if (patch[k] !== undefined && prev[target] !== patch[k]) {
          next[target] = patch[k]
          changed = true
        }
      }
      if (patch.updatedAt !== undefined && next.updatedAt !== patch.updatedAt) {
        next.updatedAt = patch.updatedAt
        changed = true
      }
      return changed ? next : prev
    })
    setLastUpdated(new Date())
  }, [])

  const applyRecipientStatus = useCallback((event) => {
    if (!event || !event.recipientId) return
    const patch = {}
    if (event.status) patch.status = event.status
    if (event.error !== undefined) patch.error = event.error
    if (event.providerMessageId !== undefined) patch.providerMessageId = event.providerMessageId
    if (event.sentAt) patch.sentAt = event.sentAt
    if (event.failedAt) patch.failedAt = event.failedAt
    if (event.processingAt) patch.processingAt = event.processingAt
    if (event.updatedAt) patch.updatedAt = event.updatedAt
    if (Object.keys(patch).length === 0) return
    const recipientKey = String(event.recipientId)
    const previousEvent = recipientEventsRef.current.get(recipientKey)
    const previousStatus = String(previousEvent?.status || '').toLowerCase()
    const nextStatus = String(patch.status || '').toLowerCase()
    const terminalStatuses = ['sent', 'failed', 'cancelled']
    if (
      (!previousEvent || !isOlderTimestamp(event.updatedAt, previousEvent.updatedAt)) &&
      !(terminalStatuses.includes(previousStatus) && nextStatus && nextStatus !== previousStatus)
    ) {
      recipientEventsRef.current.set(recipientKey, { ...previousEvent, ...patch })
    }
    setRecipients((prev) => mergeEventIntoRecipient(prev, event.recipientId, patch))
    setLastUpdated(new Date())
  }, [])

  const refreshCampaign = useCallback(async () => {
    const [nextCampaign, nextStats] = await Promise.all([getCampaign(id), getCampaignStats(id)])
    setCampaign((prev) => (prev && isOlderTimestamp(nextCampaign.updatedAt, prev.updatedAt) ? prev : nextCampaign))
    setStats((prev) => (prev && isOlderTimestamp(nextStats.updatedAt, prev.updatedAt) ? prev : nextStats))
    setLastUpdated(new Date())
  }, [id])

  const refreshRecipients = useCallback(async (page = 1, status = recipientStatus) => {
    setRecipientLoading(true)
    try {
      const result = await getCampaignRecipients(id, { page, limit: 50, ...(status ? { status } : {}) })
      setRecipients((prev) => {
        const previousById = new Map((prev || []).map((item) => [String(item._id), item]))
        return (result.items || []).map((item) => {
          const existing = previousById.get(String(item._id))
          const serverItem = !existing || isOlderTimestamp(item.updatedAt, existing.updatedAt)
            ? existing || item
            : { ...existing, ...item }
          const latestEvent = recipientEventsRef.current.get(String(item._id))
          if (!latestEvent) return serverItem
          return mergeEventIntoRecipient([serverItem], item._id, latestEvent)[0]
        })
      })
      setPagination(result.pagination || { page: 1, pages: 1, total: 0 })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setRecipientLoading(false)
      setInitialRecipientsLoaded(true)
    }
  }, [id, recipientStatus])

  reconcileRef.current = async () => {
    try {
      await Promise.all([
        refreshCampaign(),
        refreshRecipients(pagination.page, recipientStatus),
      ])
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  useEffect(() => {
    let active = true
    startTransition(() => setLoading(true))
    Promise.all([getCampaign(id), getCampaignStats(id)])
      .then(([nextCampaign, nextStats]) => {
        if (!active) return
        setCampaign(nextCampaign)
        setStats(nextStats)
        setLastUpdated(new Date())
        setError('')
      })
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    startTransition(() => {
      void refreshRecipients(1, recipientStatus)
    })
  }, [refreshRecipients, recipientStatus])

  useEffect(() => {
    let cancelled = false
    let reconnectTimer = null
    let errorCount = 0
    const listeners = []
    const campaignStatus = campaign?.status

    function listen(source, eventName, handler) {
      source.addEventListener(eventName, handler)
      listeners.push([source, eventName, handler])
    }

    function closeCurrentEventSource() {
      if (eventSourceRef.current) {
        try { eventSourceRef.current.close() } catch { /* ignore */ }
        eventSourceRef.current = null
      }
      for (const [source, eventName, handler] of listeners) {
        source.removeEventListener(eventName, handler)
      }
      listeners.length = 0
    }

    async function startEventStream() {
      if (!campaignStatus || !initialRecipientsLoaded || terminalStates.includes(campaignStatus) || cancelled) return
      closeCurrentEventSource()
      try {
        setConnectionStatus(errorCount ? 'reconnecting' : 'connecting')
        console.info(`[SSE] Connecting campaign=${id}`)
        if (!eventTokenRef.current) {
          eventTokenRef.current = await getCampaignEventsToken(id)
        }
        if (cancelled || !eventTokenRef.current) return

        const base = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '')
        const url = `${base}/campaigns/${encodeURIComponent(id)}/events?token=${encodeURIComponent(eventTokenRef.current)}`
        const es = new EventSource(url, { withCredentials: false })
        eventSourceRef.current = es

        listen(es, 'open', () => {
          if (cancelled) return
          setConnectionStatus('connected')
          errorCount = 0
          console.info(`[SSE] Connected campaign=${id}`)
          reconcileRef.current?.()
        })

        listen(es, 'error', () => {
          if (cancelled) return
          setConnectionStatus('reconnecting')
          console.error(`[SSE] Connection error campaign=${id}`)
          closeCurrentEventSource()
          errorCount += 1
          console.warn(`[SSE] Client reconnecting campaign=${id}`)
          const backoff = Math.min(1000 * Math.pow(1.5, Math.min(errorCount - 1, 6)), 15000)
          eventTokenRef.current = ''
          reconnectTimer = window.setTimeout(() => {
            if (!cancelled) startEventStream()
          }, backoff)
        })

        listen(es, 'connected', (evt) => {
          if (cancelled) return
          setConnectionStatus('connected')
          try {
            const data = JSON.parse(evt.data)
            console.info(`[SSE] Connected campaign=${data.campaignId || id}`)
          } catch { /* ignore */ }
        })

        listen(es, 'ping', () => {
          if (cancelled) return
          setConnectionStatus('connected')
        })

        listen(es, 'campaign-progress', (evt) => {
          if (cancelled) return
          try {
            const payload = JSON.parse(evt.data)
            console.log('[SSE] Campaign progress:', payload)
            applyStatsPatch({
              total: payload.total,
              pending: payload.pending,
              processing: payload.processing,
              sent: payload.sent,
              failed: payload.failed,
              cancelled: payload.cancelled,
              processed: payload.processed,
              percentage: payload.percentage,
              updatedAt: payload.updatedAt,
            })
          } catch (err) {
            console.error('[SSE] Error parsing campaign-progress:', err)
          }
        })

        listen(es, 'recipient_status', (evt) => {
          if (cancelled) return
          try {
            const payload = JSON.parse(evt.data)
            const normalized = { ...payload, status: String(payload.status || '').toLowerCase() }
            console.info(`[React] recipient_status received campaign=${payload.campaignId} recipient=${payload.recipientId} status=${normalized.status}`)
            applyRecipientStatus(normalized)
            console.info(`[SSE] Recipient updated: ${payload.recipientId} -> ${String(payload.status || '').toUpperCase()}`)
          } catch (err) {
            console.error('[SSE] Error parsing recipient_status:', err)
          }
        })

        listen(es, 'recipient.snapshot', (evt) => {
          if (cancelled) return
          try {
            const payload = JSON.parse(evt.data)
            const snapshot = Array.isArray(payload.recipients) ? payload.recipients : []
            if (!snapshot.length) return
            setRecipients((prev) => {
              if (!prev || !prev.length) {
                return snapshot.map((r) => {
                  const recipient = {
                    _id: r.recipientId,
                    name: r.name,
                    email: r.email,
                    status: r.status,
                    error: r.error || '',
                    sentAt: r.sentAt,
                    failedAt: r.failedAt,
                    processingAt: r.processingAt,
                    updatedAt: r.updatedAt,
                  }
                  const latestEvent = recipientEventsRef.current.get(String(r.recipientId))
                  return latestEvent
                    ? mergeEventIntoRecipient([recipient], r.recipientId, latestEvent)[0]
                    : recipient
                })
              }
              let next = prev
              for (const r of snapshot) {
                next = mergeEventIntoRecipient(next, r.recipientId, {
                  name: r.name,
                  email: r.email,
                  status: r.status,
                  error: r.error || '',
                  sentAt: r.sentAt,
                  failedAt: r.failedAt,
                  processingAt: r.processingAt,
                  updatedAt: r.updatedAt,
                })
              }
              return next
            })
          } catch { /* ignore */ }
        })

        listen(es, 'campaign-completed', (evt) => {
          if (cancelled) return
          try {
            const payload = JSON.parse(evt.data)
            applyStatsPatch({
              total: payload.total,
              pending: 0,
              processing: 0,
              sent: payload.sent,
              failed: payload.failed,
              cancelled: payload.cancelled,
              updatedAt: payload.updatedAt,
              completedAt: new Date().toISOString(),
            })
            setCampaign((prev) => {
              if (!prev) return prev
              if (prev.status === 'completed' || prev.status === 'cancelled' || prev.status === 'failed') return prev
              return { ...prev, status: 'completed', completedAt: new Date(), updatedAt: payload.updatedAt || prev.updatedAt }
            })
            notify('Campaign completed')
          } catch { /* ignore */ }
        })
      } catch (requestError) {
        if (cancelled) return
          setConnectionStatus('reconnecting')
        console.error(`[SSE] Connection error campaign=${id}: ${requestError.message}`)
        eventTokenRef.current = ''
        errorCount += 1
        const backoff = Math.min(1000 * Math.pow(1.5, Math.min(errorCount - 1, 6)), 15000)
        reconnectTimer = window.setTimeout(() => {
          if (!cancelled) startEventStream()
        }, backoff)
        if (!cancelled) setError(requestError.message)
      }
    }

    startEventStream()

    return () => {
      cancelled = true
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      setConnectionStatus('disconnected')
      closeCurrentEventSource()
    }
  }, [id, campaign?.status, initialRecipientsLoaded, applyStatsPatch, applyRecipientStatus, notify])

  const current = useMemo(() => ({
    total: Number(stats?.total ?? campaign?.totalRecipients ?? 0),
    pending: Number(stats?.pending ?? campaign?.pendingCount ?? 0),
    processing: Number(stats?.processing ?? campaign?.processingCount ?? 0),
    sent: Number(stats?.sent ?? campaign?.sentCount ?? 0),
    failed: Number(stats?.failed ?? campaign?.failedCount ?? 0),
    cancelled: Number(stats?.cancelled ?? campaign?.cancelledCount ?? 0),
  }), [stats, campaign])

  async function handleAction(action) {
    if (['cancel', 'delete'].includes(action)) {
      setConfirmation(action)
      return
    }
    await executeAction(action)
  }

  async function executeAction(action) {
    setBusy(true)
    try {
      if (action === 'delete') {
        await removeCampaign(id)
        notify('Campaign deleted')
        navigate('/campaigns')
        return
      }
      await runCampaignAction(id, action)
      const label = { start: 'Campaign started', pause: 'Campaign paused', resume: 'Campaign resumed', cancel: 'Campaign cancelled' }[action]
      notify(label)
      setConfirmation('')
      await refreshCampaign()
      await refreshRecipients(1, recipientStatus)
    } catch (requestError) {
      notify(requestError.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(file, allowInvalid = false) {
    setUploading(true)
    setUploadProgress(0)
    try {
      const result = await uploadRecipients(id, file, setUploadProgress, allowInvalid)
      setUploadValidationResult(result.errors?.length ? result : null)
      setPendingUploadFile(null)
      notify(`${result.valid} recipients added; ${result.duplicates} duplicates, ${result.invalid} invalid, ${result.suppressed} suppressed`)
      await refreshCampaign()
      await refreshRecipients(1, recipientStatus)
    } catch (requestError) {
      if (requestError.code === 'CSV_VALIDATION_FAILED') {
        setUploadValidationResult(requestError.data)
        setPendingUploadFile(file)
      }
      notify(requestError.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <Loading label="Loading campaign..." />
  if (error && !campaign) return <ErrorState message={error} onRetry={() => { setError(''); refreshCampaign().catch((requestError) => setError(requestError.message)) }} />
  if (!campaign) return <EmptyState title="Campaign not found" description="This campaign may have been removed." action={<Link className="button button-secondary" to="/campaigns">Back to campaigns</Link>} />

  const status = campaign.status
  const processed = current.sent + current.failed + current.cancelled
  const percentage = current.total > 0 ? Math.min(100, Math.round((processed / current.total) * 100)) : 0

  return (
    <div className="page-stack detail-page">
      <Link to="/campaigns" className="back-link"><ArrowLeft size={16} />All campaigns</Link>
      {error && <ErrorState message={error} />}
      <section className="detail-heading">
        <div>
          <div className="detail-title-line">
            <h1>{campaign.name}</h1>
            <StatusBadge status={status} />
            {!terminalStates.includes(status) && status !== 'draft' && (
              <span className="chip connection-chip" title={`Live stream ${connectionStatus}`}>
                {connectionStatus === 'connected' ? <Wifi size={13} /> : <WifiOff size={13} />}
                {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting' : connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
              </span>
            )}
          </div>
          <p className="detail-subject"><Mail size={15} />{campaign.subject}</p>
          <div className="detail-dates">
            <span><Clock3 size={14} /> Created {formatDate(campaign.createdAt)}</span>
            <span><Play size={13} /> Started {formatDate(stats?.startedAt || campaign.startedAt)}</span>
            <span><Check size={14} /> Completed {formatDate(stats?.completedAt || campaign.completedAt)}</span>
          </div>
        </div>
        <div className="detail-actions">
          {status === 'draft' && (
            <>
              <Link to={`/campaigns/${id}/edit`} className="button button-secondary"><Edit3 size={16} />Edit</Link>
              <button className="button button-primary" type="button" disabled={busy || current.total === 0} title={current.total === 0 ? 'Add recipients before starting' : undefined} onClick={() => handleAction('start')}><Play size={16} />Start campaign</button>
              <button className="icon-button danger-icon" type="button" aria-label="Delete draft campaign" onClick={() => handleAction('delete')}><Trash2 size={17} /></button>
            </>
          )}
          {['queued', 'sending'].includes(status) && (
            <>
              <button className="button button-secondary" type="button" disabled={busy} onClick={() => handleAction('pause')}><Pause size={16} />Pause</button>
              <button className="button button-quiet button-destructive" type="button" disabled={busy} onClick={() => handleAction('cancel')}><Ban size={16} />Cancel</button>
            </>
          )}
          {status === 'paused' && (
            <>
              <button className="button button-primary" type="button" disabled={busy} onClick={() => handleAction('resume')}><Play size={16} />Resume</button>
              <button className="button button-quiet button-destructive" type="button" disabled={busy} onClick={() => handleAction('cancel')}><Ban size={16} />Cancel</button>
            </>
          )}
          {terminalStates.includes(status) && <span className="results-label"><Check size={15} /> Results available</span>}
        </div>
      </section>

      <section className="stats-grid detail-stats">
        <StatCard label="Total" value={current.total} icon={Users} tone="green" />
        <StatCard label="Sent" value={current.sent} icon={Check} tone="green" />
        <StatCard label="Processing" value={current.processing} icon={Play} tone="blue" />
        <StatCard label="Pending" value={current.pending} icon={Clock3} tone="amber" />
        <StatCard label="Failed" value={current.failed} icon={XCircle} tone="rose" />
        <StatCard label="Cancelled" value={current.cancelled} icon={Ban} tone="slate" />
      </section>

      <section className="panel progress-panel">
        <div className="panel-heading panel-heading-inline">
          <div>
            <span className="section-kicker">CAMPAIGN PROGRESS</span>
            <h2>{terminalStates.includes(status) ? 'Delivery results' : 'Live delivery'}</h2>
            <div className="progress-summary-line">
              <strong>{processed.toLocaleString()}</strong>
              <span className="muted-cell"> of {current.total.toLocaleString()} processed</span>
              <span className="progress-percent">{percentage}%</span>
            </div>
          </div>
          {!terminalStates.includes(status) && (
            <span className="updated-label" title={`Last updated ${lastUpdated.toLocaleTimeString()}`}>
              <span className="live-dot" /> Updated just now
            </span>
          )}
        </div>
        <CampaignProgress {...current} />
        <div className="detail-progress-legend">
          <span><i className="legend-dot legend-sent" /> Sent</span>
          <span><i className="legend-dot legend-pending" /> Pending</span>
          <span><i className="legend-dot legend-failed" /> Failed or cancelled</span>
        </div>
        {current.processing > 0 && (
          <div className="processing-note" aria-live="polite">
            <span className="live-dot live-dot-pulse" /> Sending email… Next email is processed according to your configured sending rate.
          </div>
        )}
        <span className="sr-only">Last updated {lastUpdated.toLocaleTimeString()}</span>
      </section>

      {status === 'draft' && (
        <section className="panel upload-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">RECIPIENTS</span>
              <h2>Add recipients</h2>
              <p>Upload a CSV to prepare this draft for sending.</p>
            </div>
          </div>
          <CsvUploader onUpload={handleUpload} uploading={uploading} progress={uploadProgress} disabled={uploading} />
          {uploadValidationResult && (
            <div className="validation-errors">
              <p>Total rows: {uploadValidationResult.totalRows} · Valid recipients: {uploadValidationResult.valid} · Invalid: {uploadValidationResult.invalid}</p>
              {uploadValidationResult.errors?.length > 0 && (
                <table className="error-table">
                  <thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Error</th></tr></thead>
                  <tbody>{uploadValidationResult.errors.map((item, index) => (
                    <tr key={`${item.row}-${item.email}-${index}`}>
                      <td>{item.row ?? '—'}</td><td>{item.name || '—'}</td><td>{item.email || '—'}</td><td className="error-cell">{item.error}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          )}
          {pendingUploadFile && uploadValidationResult?.valid > 0 && (
            <button className="button button-secondary" type="button" disabled={uploading} onClick={() => handleUpload(pendingUploadFile, true)}>
              Continue with {uploadValidationResult.valid} valid recipients
            </button>
          )}
        </section>
      )}

      <section className="panel table-panel">
        <div className="panel-heading panel-heading-inline">
          <div>
            <span className="section-kicker">AUDIENCE</span>
            <h2>Recipient preview</h2>
            <p>{current.total.toLocaleString()} records · paginated by the server</p>
          </div>
          <div className="toolbar-select">
            <select aria-label="Filter recipients by status" value={recipientStatus} onChange={(event) => setRecipientStatus(event.target.value)}>
              <option value="">All statuses</option>
              {['pending', 'processing', 'sent', 'failed', 'cancelled'].map((item) => (
                <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        {recipientLoading ? (
          <Loading label="Loading recipients..." />
        ) : recipients.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Error</th>
                    <th>Sent at</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((recipient) => (
                    <tr key={recipient._id}>
                      <td>{recipient.name || '—'}</td>
                      <td>{recipient.email}</td>
                      <td>
                        <StatusBadge
                          status={recipient.status}
                          processingLabel={recipient.status === 'processing' ? '● Sending…' : undefined}
                        />
                      </td>
                      <td className="recipient-error-cell">{recipient.error || '—'}</td>
                      <td className="muted-cell">{formatDate(recipient.sentAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} onPageChange={(nextPage) => refreshRecipients(nextPage, recipientStatus)} />
          </>
        ) : (
          <EmptyState
            title="No recipients found"
            description={recipientStatus ? 'No recipients have this status.' : 'Upload a CSV to add recipients to this campaign.'}
            icon={FileSpreadsheet}
          />
        )}
      </section>

      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation === 'delete' ? 'Delete this campaign?' : 'Cancel this campaign?'}
        description={confirmation === 'delete' ? 'This draft and all recipient records will be permanently deleted.' : 'Remaining recipients will be cancelled. This action cannot be undone.'}
        confirmLabel={confirmation === 'delete' ? 'Delete campaign' : 'Cancel campaign'}
        danger
        busy={busy}
        onClose={() => setConfirmation('')}
        onConfirm={() => executeAction(confirmation)}
      />
    </div>
  )
}
