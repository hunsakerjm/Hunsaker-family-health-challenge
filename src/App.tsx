import { useEffect, useState } from 'react'
import { LoginScreen } from './screens/Login'
import { SplashScreen } from './screens/Splash'
import { DesignSystem } from './screens/DesignSystem'
import { ThemeProvider } from './components/ThemeProvider'

// Phase 0 demo route, reachable in local dev only via direct navigation.
// Checked before any auth-flow state so it never touches the Login/Splash
// boot path — the production site still always boots straight to the gate.
const DESIGN_SYSTEM_PATH = '/design-system'

// A session cookie is HttpOnly, so the client can't just read it to know
// whether the gate has already been passed. Instead we probe an
// authenticated endpoint once on load and let its status decide the view.
type AuthState = 'checking' | 'authenticated' | 'unauthenticated'

export function App() {
  const [authState, setAuthState] = useState<AuthState>('checking')
  const isDesignSystemRoute = window.location.pathname === DESIGN_SYSTEM_PATH

  useEffect(() => {
    // The demo route never calls the API and never needs a session probe.
    if (isDesignSystemRoute) {
      return
    }
    checkExistingSession()
  }, [isDesignSystemRoute])

  async function checkExistingSession() {
    try {
      const response = await fetch('/api/bootstrap', { credentials: 'include' })
      setAuthState(response.ok ? 'authenticated' : 'unauthenticated')
    } catch {
      setAuthState('unauthenticated')
    }
  }

  function handleLoginSuccess() {
    setAuthState('authenticated')
  }

  if (isDesignSystemRoute) {
    return (
      <ThemeProvider>
        <DesignSystem />
      </ThemeProvider>
    )
  }

  if (authState === 'checking') {
    return <BlankLoadingScreen />
  }

  return authState === 'authenticated' ? (
    <SplashScreen />
  ) : (
    <LoginScreen onLoginSuccess={handleLoginSuccess} />
  )
}

function BlankLoadingScreen() {
  return <div className="min-h-dvh bg-neutral-100" />
}
