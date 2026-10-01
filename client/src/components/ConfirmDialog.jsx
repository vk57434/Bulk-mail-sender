import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', busy = false, danger = false, onConfirm, onClose }) {
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    cancelRef.current?.focus()
    const handleKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, busy, onClose])

  if (!open) return null
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
        <span className={`dialog-icon${danger ? ' dialog-icon-danger' : ''}`}><AlertTriangle size={21} /></span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description">{description}</p>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="button button-secondary" disabled={busy} onClick={onClose}>Keep it</button>
          <button type="button" className={`button ${danger ? 'button-danger' : 'button-primary'}`} disabled={busy} onClick={onConfirm}>{busy ? 'Working...' : confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}