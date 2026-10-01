import { CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge'
import CampaignCard from './CampaignCard'

export default function CampaignTable({ campaigns, actionFor }) {
  if (!campaigns.length) return null
  return (
    <>
      <div className="table-scroll campaign-table-desktop">
        <table>
          <thead><tr><th>Campaign</th><th>Status</th><th>Total</th><th>Sent</th><th>Processing</th><th>Pending</th><th>Failed</th><th>Cancelled</th><th>Created</th><th>Started</th><th>Completed</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{campaigns.map((campaign) => (
            <tr key={campaign._id}>
              <td><Link to={`/campaigns/${campaign._id}`} className="table-campaign-link"><span className="campaign-mini-icon"><CalendarDays size={15} /></span><span><strong>{campaign.name}</strong><small>{campaign.subject}</small></span></Link></td>
              <td><StatusBadge status={campaign.status} /></td>
              <td>{Number(campaign.totalRecipients || 0).toLocaleString()}</td>
              <td>{Number(campaign.sentCount || 0).toLocaleString()}</td>
              <td>{Number(campaign.processingCount || 0).toLocaleString()}</td>
              <td>{Number(campaign.pendingCount || 0).toLocaleString()}</td>
              <td>{Number(campaign.failedCount || 0).toLocaleString()}</td>
              <td>{Number(campaign.cancelledCount || 0).toLocaleString()}</td>
              <td className="muted-cell">{new Date(campaign.createdAt).toLocaleDateString()}</td>
              <td className="muted-cell">{campaign.startedAt ? new Date(campaign.startedAt).toLocaleDateString() : '—'}</td>
              <td className="muted-cell">{campaign.completedAt ? new Date(campaign.completedAt).toLocaleDateString() : '—'}</td>
              <td><div className="row-actions">{actionFor(campaign)}<Link className="button button-secondary button-small" to={`/campaigns/${campaign._id}`}>View Details</Link></div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="campaign-card-list">{campaigns.map((campaign) => <CampaignCard key={campaign._id} campaign={campaign} actions={actionFor(campaign)} />)}</div>
    </>
  )
}