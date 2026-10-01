import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, signUp } from '../services/auth.service'
import AuthContext from './auth-context'

function userFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return { id: payload.id, email: payload.email }
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [token, setToken] = useState(() => localStorage.getItem('mailflow-token'))
  const [user, setUser] = useState(() => userFromToken(localStorage.getItem('mailflow-token') || ''))

  const logout = useCallback((redirect = true) => {
    localStorage.removeItem('mailflow-token')
    setToken(null)
    setUser(null)
    if (redirect) navigate('/login', { replace: true })
  }, [navigate])

  useEffect(() => {
    const handleUnauthorized = () => logout()
    window.addEventListener('mailflow:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('mailflow:unauthorized', handleUnauthorized)
  }, [logout])

  const login = useCallback(async (credentials) => {
    const result = await signIn(credentials)
    localStorage.setItem('mailflow-token', result.token)
    setToken(result.token)
    setUser(result.user)
    return result.user
  }, [])

  const register = useCallback(async (credentials) => {
    const result = await signUp(credentials)
    localStorage.setItem('mailflow-token', result.token)
    setToken(result.token)
    setUser(result.user)
    return result.user
  }, [])

  const value = useMemo(() => ({
    login, register,
    logout,
    user,
    token,
    isAuthenticated: Boolean(token && user),
    loading: false,
  }), [login, register, logout, user, token])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
