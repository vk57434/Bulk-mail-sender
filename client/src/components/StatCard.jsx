export default function StatCard({ label, value, detail, icon: Icon, tone = 'green' }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon stat-icon-${tone}`}><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></div>
      <div className="stat-copy">
        <span className="stat-label">{label}</span>
        <strong>{Number(value || 0).toLocaleString()}</strong>
        {detail && <span className="stat-detail">{detail}</span>}
      </div>
    </article>
  )
}