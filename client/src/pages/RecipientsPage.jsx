import { startTransition, useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Search, Users } from 'lucide-react'
import { getCampaigns } from '../services/campaign.service'
import { getCampaignRecipients } from '../services/recipient.service'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import Pagination from '../components/Pagination'
import StatusBadge from '../components/StatusBadge'
import { formatDate } from '../lib/format'

const filters = ['', 'pending', 'processing', 'sent', 'failed', 'cancelled']

export default function RecipientsPage() {
  const [campaigns, setCampaigns] = useState([])
  const [campaignId, setCampaignId] = useState('')
  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [loadingCampaigns, setLoadingCampaigns] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getCampaigns().then((result) => {
      setCampaigns(result)
      setCampaignId(result[0]?._id || '')
    }).catch((requestError) => setError(requestError.message)).finally(() => setLoadingCampaigns(false))
  }, [])

  useEffect(() => {
    if (!campaignId) return undefined
    let active = true
    startTransition(() => setLoading(true))
    getCampaignRecipients(campaignId, { page: 1, limit: 50, ...(status ? { status } : {}) }).then((result) => {
      if (!active) return
      setItems(result.items || [])
      setPagination(result.pagination || { page: 1, pages: 1, total: 0 })
      setError('')
    }).catch((requestError) => active && setError(requestError.message)).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [campaignId, status])

  async function changePage(page) {
    if (!campaignId) return
    setLoading(true)
    try {
      const result = await getCampaignRecipients(campaignId, { page, limit: 50, ...(status ? { status } : {}) })
      setItems(result.items || [])
      setPagination(result.pagination || { page: 1, pages: 1, total: 0 })
    } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => !query || `${item.name} ${item.email}`.toLowerCase().includes(query))
  }, [items, search])
  const selectedCampaign = campaigns.find((campaign) => campaign._id === campaignId)

  return (
    <div className="page-stack">
      <section className="page-intro"><div><span className="eyebrow"><span className="eyebrow-line" /> AUDIENCE</span><h1>Recipients</h1><p>Review delivery state and recipient records by campaign.</p></div></section>
      {error && <ErrorState message={error} />}
      {loadingCampaigns ? <Loading label="Loading campaigns..." /> : campaigns.length ? <section className="panel table-panel">
        <div className="recipient-toolbar"><div className="recipient-campaign-select"><label className="field-label" htmlFor="recipient-campaign">Campaign</label><select id="recipient-campaign" className="text-input" value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select></div><div className="search-field"><Search size={17} /><input aria-label="Search current recipient page" placeholder="Search name or email..." value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
        <div className="filter-tabs" role="group" aria-label="Filter recipients by status">{filters.map((item) => <button key={item || 'all'} className={status === item ? 'active' : ''} type="button" onClick={() => setStatus(item)}>{item ? item[0].toUpperCase() + item.slice(1) : 'All'}</button>)}</div>
        {selectedCampaign && <div className="audience-summary"><span><Users size={15} /> {selectedCampaign.name}</span><strong>{pagination.total.toLocaleString()} recipients</strong></div>}
        {loading ? <Loading label="Loading recipients..." /> : visible.length ? <><div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Campaign</th><th>Status</th><th>Error</th><th>Sent at</th></tr></thead><tbody>{visible.map((recipient) => <tr key={recipient._id}><td>{recipient.name || '—'}</td><td>{recipient.email}</td><td>{selectedCampaign?.name || '—'}</td><td><StatusBadge status={recipient.status} /></td><td className="recipient-error-cell">{recipient.error || '—'}</td><td className="muted-cell">{formatDate(recipient.sentAt)}</td></tr>)}</tbody></table></div><Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} onPageChange={changePage} /></> : <EmptyState title="No recipients found" description={search ? 'Try a different name or email on this page.' : 'This campaign has no recipients in the selected state.'} icon={FileSpreadsheet} />}
      </section> : <section className="panel"><EmptyState title="No recipients yet" description="Create a campaign and upload a CSV to see recipient records here." icon={Users} /></section>}
      {items.length > 0 && <p className="muted-note">Search applies to the currently loaded page. The backend returns 50 recipients at a time.</p>}
    </div>
  )
}