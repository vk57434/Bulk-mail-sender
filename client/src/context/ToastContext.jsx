import { useCallback, useMemo, useState } from 'react'
import Toast from '../components/Toast'
import ToastContext from './toast-context'

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])
  const notify = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((current) => [...current, { id, message, type }])
    window.setTimeout(() => dismiss(id), 4200)
  }, [dismiss])
  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => <Toast key={toast.id} {...toast} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  )
}
