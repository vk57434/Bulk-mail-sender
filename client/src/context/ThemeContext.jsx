import { useEffect, useMemo, useState } from 'react'
import ThemeContext from './theme-context'

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('mailflow-theme') || 'system')

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      document.documentElement.dataset.theme = theme === 'system'
        ? (media.matches ? 'dark' : 'light')
        : theme
      localStorage.setItem('mailflow-theme', theme)
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
