import { AlertCircle, Check, X } from 'lucide-react'

export default function Toast({ id, message, type, onDismiss }) {
  const Icon = type === 'error' ? AlertCircle : Check
  return (
    <div className={`toast toast-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <Icon size={17} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" aria-label="Dismiss notification" className="toast-close" onClick={() => onDismiss(id)}><X size={15} /></button>
    </div>
  )
}