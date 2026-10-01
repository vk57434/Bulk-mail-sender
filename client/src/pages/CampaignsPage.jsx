import { startTransition, useEffect, useMemo, useState } from 'react'
import { Ban, Check, Clock3, Edit3, MailPlus, Pause, Play, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getCampaigns, removeCampaign, runCampaignAction } from '../services/campaign.service'
import useToast from '../hooks/useToast'
import CampaignTable from '../components/CampaignTable'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import Pagination from '../components/Pagination'

const pageSize = 10
const statuses = ['all', 'draft', 'queued', 'sending', 'paused', 'completed', 'cancelled', 'failed']

export default function CampaignsPage() {
  const { notify } = useToast()
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState('')
  const [pendingAction, setPendingAction] = useState(null)

  async function loadCampaigns() {
    setLoading(true)
    setError('')
    try { setCampaigns(await getCampaigns()) } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }

  useEffect(() => { startTransition(() => { void loadCampaigns() }) }, [])

  const filtered = useMemo(() => campaigns.filter((campaign) => {
    const matchesStatus = status === 'all' || campaign.status === status
    const query = search.trim().toLowerCase()
    return matchesStatus && (!query || `${campaign.name} ${campaign.subject}`.toLowerCase().includes(query))
  }), [campaigns, search, status])
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)

  async function performAction(campaign, action) {
    setBusyId(campaign._id)
    try {
      if (action === 'delete') {
        await removeCampaign(campaign._id)
      } else {
        await runCampaignAction(campaign._id, action)
      }
      const messages = { start: 'Campaign started', pause: 'Campaign paused', resume: 'Campaign resumed', cancel: 'Campaign cancelled', delete: 'Campaign deleted' }
      notify(messages[action])
      setPendingAction(null)
      await loadCampaigns()
    } catch (requestError) {
      notify(requestError.message, 'error')
    } finally {
      setBusyId('')
    }
  }

  function actionButton(campaign, action, Icon, label, style = 'button-quiet') {
    const needsConfirm = ['delete', 'cancel'].includes(action)
    return <button key={action} className={`button ${style} button-small`} type="button" disabled={busyId === campaign._id || (action === 'start' && !campaign.totalRecipients)} title={action === 'start' && !campaign.totalRecipients ? 'Add recipients before starting' : undefined} onClick={() => needsConfirm ? setPendingAction({ campaign, action }) : performAction(campaign, action)}><Icon size={14} />{label}</button>
  }

  function actionsFor(campaign) {
    if (campaign.status === 'draft') return <><Link className="button button-secondary button-small" to={`/campaigns/${campaign._id}/edit`}><Edit3 size={14} />Edit</Link>{actionButton(campaign, 'start', Play, 'Start', 'button-secondary')}{actionButton(campaign, 'delete', Trash2, 'Delete', 'button-quiet button-destructive')}</>
    if (['queued', 'sending'].includes(campaign.status)) return <>{actionButton(campaign, 'pause', Pause, 'Pause', 'button-secondary')}{actionButton(campaign, 'cancel', Ban, 'Cancel', 'button-quiet button-destructive')}</>
    if (campaign.status === 'paused') return <>{actionButton(campaign, 'resume', Play, 'Resume', 'button-secondary')}{actionButton(campaign, 'cancel', Ban, 'Cancel', 'button-quiet button-destructive')}</>
    return <Link className="button button-secondary button-small" to={`/campaigns/${campaign._id}`}><Check size={14} />Results</Link>
  }

  return (
    <div className="page-stack">
      <section className="page-intro"><div><span className="eyebrow"><span className="eyebrow-line" /> WORKSPACE</span><h1>Campaigns</h1><p>Build, schedule, and keep an eye on every send.</p></div><Link className="button button-primary" to="/campaigns/new"><MailPlus size={17} /> Create campaign</Link></section>
      {error && <ErrorState message={error} onRetry={loadCampaigns} />}
      <section className="panel table-panel">
        <div className="campaign-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search campaigns" placeholder="Search campaigns..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></div><div className="toolbar-select"><Clock3 size={15} /><select className="campaign-status-filter" aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>{statuses.map((item) => <option key={item} value={item}>{item === 'all' ? 'All statuses' : item[0].toUpperCase() + item.slice(1)}</option>)}</select></div><span className="result-count">{filtered.length} {filtered.length === 1 ? 'campaign' : 'campaigns'}</span></div>
        {loading ? <Loading label="Loading campaigns..." /> : filtered.length ? <><CampaignTable campaigns={visible} actionFor={actionsFor} /><Pagination page={page} pages={Math.ceil(filtered.length / pageSize)} total={filtered.length} pageSize={pageSize} onPageChange={setPage} /></> : <EmptyState title={search || status !== 'all' ? 'No matching campaigns' : 'No campaigns yet'} description={search || status !== 'all' ? 'Try changing your search or filters.' : 'Create your first email campaign to get started.'} icon={MailPlus} action={!search && status === 'all' ? <Link className="button button-primary" to="/campaigns/new">Create campaign</Link> : null} />}
      </section>
      <ConfirmDialog open={Boolean(pendingAction)} title={pendingAction?.action === 'delete' ? 'Delete this draft?' : 'Cancel this campaign?'} description={pendingAction?.action === 'delete' ? 'The campaign and its recipient records will be permanently deleted.' : 'Queued recipients will be cancelled and this campaign cannot be resumed.'} confirmLabel={pendingAction?.action === 'delete' ? 'Delete campaign' : 'Cancel campaign'} danger busy={Boolean(busyId)} onClose={() => setPendingAction(null)} onConfirm={() => pendingAction && performAction(pendingAction.campaign, pendingAction.action)} />
    </div>
  )
}