'use client'

import * as React from 'react'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'theme'

function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // ignore
  }
  return null
}

const ThemeContext = React.createContext<{
  theme: Theme
  setTheme: (t: Theme | ((prev: Theme) => Theme)) => void
  resolvedTheme: Theme
} | null>(null)

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  attribute = 'class',
}: {
  children: React.ReactNode
  defaultTheme?: Theme
  attribute?: string
}) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // 새로고침 시 저장된 테마 복원
  React.useEffect(() => {
    if (!mounted) return
    const stored = getStoredTheme()
    if (stored) setThemeState(stored)
  }, [mounted])

  React.useEffect(() => {
    if (typeof document === 'undefined' || !mounted) return
    const root = document.documentElement
    if (attribute === 'class') {
      root.classList.remove('light', 'dark')
      root.classList.add(theme)
      root.style.colorScheme = theme
    }
  }, [theme, mounted, attribute])

  const setTheme = React.useCallback((t: Theme | ((prev: Theme) => Theme)) => {
    setThemeState((prev) => {
      const next = typeof t === 'function' ? t(prev) : t
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const value = React.useMemo(
    () => ({ theme, setTheme, resolvedTheme: theme }),
    [theme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) {
    return {
      theme: 'dark',
      setTheme: () => {},
      resolvedTheme: 'dark' as Theme,
      themes: ['light', 'dark'],
      forcedTheme: undefined,
      systemTheme: undefined,
    }
  }
  return {
    ...ctx,
    themes: ['light', 'dark'],
    forcedTheme: undefined,
    systemTheme: undefined,
  }
}
