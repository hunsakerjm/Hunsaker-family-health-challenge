import { useEffect, useState } from 'react'
import { LoginScreen } from './screens/Login'
import { SplashScreen } from './screens/Splash'

// A session cookie is HttpOnly, so the client can't just read it to know
// whether the gate has already been passed. Instead we probe an
// authenticated endpoint once on load and let its status decide the view.
type AuthState = 'checking' | 'authenticated' | 'unauthenticated'

export function App() {
  const [authState, setAuthState] = useState<AuthState>('checking')

  useEffect(() => {
    checkExistingSession()
  }, [])

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
