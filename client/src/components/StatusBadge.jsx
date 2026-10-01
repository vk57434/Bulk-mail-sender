const labels = {
  draft: 'Draft',
  queued: 'Queued',
  sending: 'Sending',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
  pending: 'Pending',
  processing: 'Processing',
  sent: 'Sent',
}

const visualLabels = {
  pending: 'Waiting',
  processing: 'Sending…',
  sent: '✓ Sent',
  failed: '✕ Failed',
  cancelled: 'Cancelled',
}

export default function StatusBadge({ status = 'draft', processingLabel }) {
  const normalized = String(status).toLowerCase()
  const label = normalized === 'processing' && processingLabel
    ? processingLabel
    : visualLabels[normalized] || labels[normalized] || status
  return <span className={`status-badge status-${normalized}`}><span className="status-dot" />{label}</span>
}