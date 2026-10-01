import { ArrowUpRight, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge'
import CampaignProgress from './CampaignProgress'

export default function CampaignCard({ campaign, actions }) {
  return (
    <article className="campaign-card">
      <div className="campaign-card-top"><StatusBadge status={campaign.status} /><span className="campaign-date"><CalendarDays size={13} />Created {new Date(campaign.createdAt).toLocaleDateString()}</span></div>
      <Link to={`/campaigns/${campaign._id}`} className="campaign-card-title">{campaign.name}<ArrowUpRight size={16} /></Link>
      <p className="campaign-card-subject">{campaign.subject}</p>
      <div className="campaign-card-numbers">
        <span><strong>{Number(campaign.totalRecipients || 0).toLocaleString()}</strong>Total</span>
        <span><strong>{Number(campaign.sentCount || 0).toLocaleString()}</strong>Sent</span>
        <span><strong>{Number(campaign.processingCount || 0).toLocaleString()}</strong>Processing</span>
        <span><strong>{Number(campaign.pendingCount || 0).toLocaleString()}</strong>Pending</span>
        <span><strong>{Number(campaign.failedCount || 0).toLocaleString()}</strong>Failed</span>
        <span><strong>{Number(campaign.cancelledCount || 0).toLocaleString()}</strong>Cancelled</span>
      </div>
      <div className="campaign-card-dates">
        <span><strong>Started</strong>{campaign.startedAt ? new Date(campaign.startedAt).toLocaleDateString() : '—'}</span>
        <span><strong>Completed</strong>{campaign.completedAt ? new Date(campaign.completedAt).toLocaleDateString() : '—'}</span>
      </div>
      <CampaignProgress sent={campaign.sentCount} failed={campaign.failedCount} cancelled={campaign.cancelledCount} total={campaign.totalRecipients} compact />
      <div className="campaign-card-actions">{actions}<Link className="button button-secondary button-small" to={`/campaigns/${campaign._id}`}>View Details</Link></div>
    </article>
  )
}