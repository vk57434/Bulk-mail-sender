import axios from 'axios'

const configuredApiOrigin = import.meta.env.VITE_API_URL?.trim()

if (!configuredApiOrigin) {
  throw new Error('VITE_API_URL must be configured for this frontend build')
}

const normalizedApiOrigin = configuredApiOrigin
  .replace(/\/+$/, '')
  .replace(/\/api$/i, '')

export const API_BASE_URL = `${normalizedApiOrigin}/api`

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mailflow-token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('mailflow-token')
      window.dispatchEvent(new Event('mailflow:unauthorized'))
    }

    const status = error.response?.status
    const messages = {
      400: error.response?.data?.message || 'Check the information and try again.',
      401: 'Your session has expired. Please sign in again.',
      403: 'You do not have permission to do that.',
      404: 'The requested item could not be found.',
      409: error.response?.data?.message || 'This action conflicts with the current state.',
      429: 'Too many requests. Please wait a moment and try again.',
      500: 'The server could not complete your request. Try again shortly.',
    }
    const message = error.code === 'ERR_NETWORK'
      ? 'Unable to connect to MailFlow. Please try again.'
      : status === 401
        ? messages[status]
        : error.response?.data?.message || messages[status] || 'Something went wrong. Please try again.'
    return Promise.reject(Object.assign(new Error(message), {
      status,
      code: error.response?.data?.code || error.code,
      data: error.response?.data?.data,
    }))
  },
)

export default api
