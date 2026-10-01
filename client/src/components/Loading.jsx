import { LoaderCircle } from 'lucide-react'

export default function Loading({ label = 'Loading...' }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle size={20} className="spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}