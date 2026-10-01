import { AlertCircle, RotateCw } from 'lucide-react'

export default function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && <button className="button button-quiet button-small" onClick={onRetry} type="button"><RotateCw size={14} /> Try again</button>}
    </div>
  )
}