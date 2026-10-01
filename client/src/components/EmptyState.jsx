import { Inbox } from 'lucide-react'

export default function EmptyState({ title, description, action, icon: Icon = Inbox }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><Icon size={22} aria-hidden="true" /></span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}