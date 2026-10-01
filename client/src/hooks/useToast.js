import { useContext } from 'react'
import ToastContext from '../context/toast-context'

export default function useToast() {
  return useContext(ToastContext)
}