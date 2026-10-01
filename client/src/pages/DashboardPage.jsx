import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, MailCheck, MailPlus, Send, UserRoundCheck } from 'lucide-react'
import useAuth from '../hooks/useAuth'
import { accounts, history } from '../services/mailflow.service'
import { getDashboardStats, getRecentActivity } from '../services/dashboard.service'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { formatDate } from '../lib/format'

export default function DashboardPage() {
  const { user } = useAuth();
  const [emails, setEmails] = useState([]);
  const [accountList, setAccountList] = useState([]);
  const [stats, setStats] = useState({
    emailsSent: 0,
    emailsToday: 0,
    connectedAccounts: 0,
    failed: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        // Load all data in parallel
        const [historyData, accountsData, statsData, activityData] = await Promise.all([
          history(),
          accounts(),
          getDashboardStats().catch(() => ({ emailsSent: 0, emailsToday: 0, connectedAccounts: 0, failed: 0 })),
          getRecentActivity().catch(() => []),
        ]);

        if (cancelled) return;

        setEmails(historyData);
        setAccountList(accountsData);
        setStats(statsData);
        setRecentActivity(activityData);
      } catch {
        if (!cancelled) setError('Unable to connect to MailFlow. Please try again.');
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date().toDateString();
  const firstName = user?.name || user?.email?.split('@')[0] || 'there';

  const statusMap = {
    'SENT': 'sent',
    'FAILED': 'failed',
    'PENDING': 'queued',
    'PROCESSING': 'queued',
  }

  const normalizedStatus = (s) => statusMap[s] || s

  return (
    <div className="page-stack">
      <section className="page-intro dashboard-intro">
        <div>
          <span className="eyebrow"><span className="eyebrow-line" /> MAILFLOW</span>
          <h1>Good morning, {firstName}</h1>
          <p>Send emails quickly using your connected email accounts.</p>
        </div>
        <Link className="button button-primary" to="/send">
          <MailPlus size={17} /> Send Email
        </Link>
      </section>

      {error && <p className="login-error">{error}</p>}

      <section className="stats-grid">
        <StatCard
          label="Emails Sent"
          value={stats.emailsSent}
          detail="All time"
          icon={MailCheck}
          tone="green"
        />
        <StatCard
          label="Emails Today"
          value={stats.emailsToday}
          detail="Sent today"
          icon={Send}
          tone="blue"
        />
        <StatCard
          label="Connected Accounts"
          value={stats.connectedAccounts}
          detail="Ready to send"
          icon={UserRoundCheck}
          tone="amber"
        />
        <StatCard
          label="Failed"
          value={stats.failed}
          detail="Needs attention"
          icon={AlertCircle}
          tone="rose"
        />
      </section>

      <section className="panel table-panel">
        <div className="panel-heading panel-heading-inline">
          <div>
            <span className="section-kicker">RECENT ACTIVITY</span>
            <h2>Your latest emails</h2>
            <p>Every message, in one simple view.</p>
          </div>
          <Link className="text-link" to="/history">View history</Link>
        </div>

        {emails.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {emails.slice(0, 5).map((email) => (
                  <tr key={email._id}>
                    <td>{email.to?.join(', ')}</td>
                    <td>{email.subject}</td>
                    <td>
                      <StatusBadge status={normalizedStatus(email.status)} />
                    </td>
                    <td className="muted-cell">{formatDate(email.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <MailPlus size={25} />
            <h3>Ready when you are</h3>
            <p>Connect an email account and send your first message.</p>
            <Link className="button button-primary" to="/send">Send Email</Link>
          </div>
        )}
      </section>
    </div>
  )
}
