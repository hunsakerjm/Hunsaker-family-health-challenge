import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  THEMES,
  type ThemeMode,
  type ThemePreference,
  type ThemeSurfaces,
} from '../theme'

// Three-way control, live OS-follow, persisted per device. §11.1 "Theme resolution"
const STORAGE_KEY_THEME_PREFERENCE = 'hhc:theme-preference'
const MEDIA_QUERY_DARK = '(prefers-color-scheme: dark)'
const MEDIA_QUERY_REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

interface ThemeContextValue {
  /** The raw user choice: 'system' | 'light' | 'dark'. */
  themePreference: ThemePreference
  setThemePreference: (pref: ThemePreference) => void
  /** What 'system' currently resolves to, after applying the live OS query. */
  resolvedMode: ThemeMode
  /** The active surface token set for `resolvedMode`. */
  theme: ThemeSurfaces
  /** Live-tracked OS reduced-motion request. Same subscribe pattern as dark mode. */
  reducedMotion: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system'
  }
  const stored = window.localStorage.getItem(STORAGE_KEY_THEME_PREFERENCE)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }
  return 'system'
}

function readMediaMatches(query: string): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }
  return window.matchMedia(query).matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(
    readStoredPreference,
  )
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => readMediaMatches(MEDIA_QUERY_DARK),
  )
  const [reducedMotion, setReducedMotion] = useState(
    () => readMediaMatches(MEDIA_QUERY_REDUCED_MOTION),
  )

  // Live-follow the OS. A phone crossing into scheduled dark mode at sunset
  // should flip the app without a reload — same pattern for reduced motion.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return
    }
    const darkQuery = window.matchMedia(MEDIA_QUERY_DARK)
    const reducedQuery = window.matchMedia(MEDIA_QUERY_REDUCED_MOTION)
    const handleDarkChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches)
    const handleReducedChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    darkQuery.addEventListener('change', handleDarkChange)
    reducedQuery.addEventListener('change', handleReducedChange)
    return () => {
      darkQuery.removeEventListener('change', handleDarkChange)
      reducedQuery.removeEventListener('change', handleReducedChange)
    }
  }, [])

  const setThemePreference = useCallback((pref: ThemePreference) => {
    setThemePreferenceState(pref)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY_THEME_PREFERENCE, pref)
    }
  }, [])

  const resolvedMode: ThemeMode = useMemo(() => {
    if (themePreference === 'system') {
      return systemPrefersDark ? 'dark' : 'light'
    }
    return themePreference
  }, [themePreference, systemPrefersDark])

  const theme = THEMES[resolvedMode]

  const value = useMemo<ThemeContextValue>(() => ({
    themePreference,
    setThemePreference,
    resolvedMode,
    theme,
    reducedMotion,
  }), [themePreference, setThemePreference, resolvedMode, theme, reducedMotion])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
