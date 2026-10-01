export default function CampaignProgress({ sent = 0, failed = 0, cancelled = 0, total = 0, compact = false }) {
  const completed = Number(sent) + Number(failed) + Number(cancelled)
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  return (
    <div className={`progress-wrap${compact ? ' progress-compact' : ''}`}>
      <div className="progress-meta"><span>{completed.toLocaleString()} of {Number(total).toLocaleString()} processed</span><strong>{percent}%</strong></div>
      <div className="progress-track" role="progressbar" aria-label="Campaign progress" aria-valuemin="0" aria-valuemax={total} aria-valuenow={Math.min(completed, total)}>
        <span className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}