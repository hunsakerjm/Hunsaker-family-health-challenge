import { useEffect, useState } from 'react'
import {
  Check, CalendarDays, Settings as SettingsIcon, Trophy,
} from 'lucide-react'
import { LoginScreen } from './screens/Login'
import { SplashScreen } from './screens/Splash'
import { DesignSystem } from './screens/DesignSystem'
import { WhoamiScreen } from './screens/Whoami'
import { TodayScreen } from './screens/Today'
import { ThemeProvider, useTheme } from './components/ThemeProvider'
import { BottomNav, type BottomNavItem } from './components/BottomNav'
import { getBootstrap } from './api'
import { getActiveUserId } from './lib/identity'
import { paletteEntryFor, TYPE_SCALE, type ThemeSurfaces } from './theme'
import type { BootstrapResponse } from './types'

// Phase 0 demo route, reachable in local dev only via direct navigation. Checked before any
// auth-flow state so it never touches the Login/Whoami/Today boot path.
const DESIGN_SYSTEM_PATH = '/design-system'

// A session cookie is HttpOnly, so the client can't just read it to know whether the gate has
// already been passed. Instead we probe /api/bootstrap once on load — and since that single call
// already returns everything the app needs (config, serverToday, rules, users, this month's
// logs), it also seeds every bit of app state in one round trip (spec §12: "one bootstrap
// request"), rather than probing auth and then fetching the same data again.
type AuthState = 'checking' | 'authenticated' | 'unauthenticated'

type AppTab = 'today' | 'calendar' | 'standings' | 'device'

const NAV_ITEMS: BottomNavItem[] = [
  { key: 'today', label: 'Today', Icon: Check },
  { key: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { key: 'standings', label: 'Standings', Icon: Trophy },
  { key: 'device', label: 'Device', Icon: SettingsIcon },
]

export function App() {
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null)
  const [activeUserId, setActiveUserId] = useState<string | null>(null)
  const [showWhoami, setShowWhoami] = useState(false)
  const [activeTab, setActiveTab] = useState<AppTab>('today')

  const isDesignSystemRoute = window.location.pathname === DESIGN_SYSTEM_PATH

  useEffect(() => {
    // The demo route never calls the API and never needs a session probe.
    if (isDesignSystemRoute) return
    loadSession()
  }, [isDesignSystemRoute])

  async function loadSession() {
    try {
      const data = await getBootstrap()
      applyBootstrap(data)
      setAuthState('authenticated')
    } catch {
      setAuthState('unauthenticated')
    }
  }

  function applyBootstrap(data: BootstrapResponse) {
    setBootstrap(data)
    const storedUserId = getActiveUserId()
    const isStoredUserStillActive = storedUserId !== null
      && data.users.some((user) => user.id === storedUserId && user.status === 'active')
    setActiveUserId(isStoredUserStillActive ? storedUserId : null)
    setShowWhoami(!isStoredUserStillActive)
  }

  async function handleLoginSuccess() {
    await loadSession()
  }

  function handleIdentityClaimed(userId: string) {
    setActiveUserId(userId)
    setShowWhoami(false)
    // Best-effort refresh so other people's claim state (dimmed/caption) is current if the
    // family is setting up multiple devices back to back. Not required for correctness — the
    // claim itself already succeeded server-side.
    getBootstrap().then(setBootstrap).catch(() => {})
  }

  function handleSwitchPerson() {
    setShowWhoami(true)
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

  if (authState === 'unauthenticated') {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />
  }

  if (!bootstrap) {
    return <SplashScreen />
  }

  return (
    <ThemeProvider>
      <AuthenticatedApp
        bootstrap={bootstrap}
        activeUserId={activeUserId}
        showWhoami={showWhoami}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onIdentityClaimed={handleIdentityClaimed}
        onSwitchPerson={handleSwitchPerson}
      />
    </ThemeProvider>
  )
}

function BlankLoadingScreen() {
  return <div className="min-h-dvh bg-neutral-100" />
}

interface AuthenticatedAppProps {
  bootstrap: BootstrapResponse
  activeUserId: string | null
  showWhoami: boolean
  activeTab: AppTab
  onSelectTab: (tab: AppTab) => void
  onIdentityClaimed: (userId: string) => void
  onSwitchPerson: () => void
}

// Deep-link only in this phase: Calendar/Standings (Phase 3) own the real in-app entry point for
// viewing someone else's page (spec §3.4). `/?u=<userId>` lets that treatment be exercised and
// tested now without adding chrome the mockup doesn't call for on the Today screen itself.
function readViewedUserIdParam(): string | null {
  return new URLSearchParams(window.location.search).get('u')
}

function AuthenticatedApp({
  bootstrap,
  activeUserId,
  showWhoami,
  activeTab,
  onSelectTab,
  onIdentityClaimed,
  onSwitchPerson,
}: AuthenticatedAppProps) {
  const { theme, reducedMotion } = useTheme()

  if (showWhoami || !activeUserId) {
    return (
      <WhoamiScreen
        theme={theme}
        users={bootstrap.users}
        onIdentityClaimed={onIdentityClaimed}
      />
    )
  }

  const ownUser = bootstrap.users.find((user) => user.id === activeUserId)
  const ownColor = paletteEntryFor(ownUser?.color_key ?? 'slate').hex
  const viewedUserIdParam = readViewedUserIdParam()
  const isViewedUserValid = viewedUserIdParam !== null
    && bootstrap.users.some((user) => user.id === viewedUserIdParam)
  const viewedUserId = isViewedUserValid ? (viewedUserIdParam as string) : activeUserId

  function handleSelectTab(key: string) {
    if (key === 'today' || key === 'calendar' || key === 'standings' || key === 'device') {
      onSelectTab(key)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: theme.paper }}>
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'today' ? (
          <TodayScreen
            theme={theme}
            reducedMotion={reducedMotion}
            config={bootstrap.config}
            serverToday={bootstrap.serverToday}
            rules={bootstrap.rules}
            users={bootstrap.users}
            ownUserId={activeUserId}
            viewedUserId={viewedUserId}
            initialLogs={bootstrap.logs}
            onSwitchPerson={onSwitchPerson}
          />
        ) : (
          <ComingSoonScreen theme={theme} tab={activeTab} />
        )}
      </div>
      <BottomNav
        theme={theme}
        items={NAV_ITEMS}
        activeKey={activeTab}
        onSelect={handleSelectTab}
        activeColor={ownColor}
      />
    </div>
  )
}

const TAB_LABELS: Record<Exclude<AppTab, 'today'>, string> = {
  calendar: 'Calendar',
  standings: 'Standings',
  device: 'Settings',
}

// Calendar (3A), Standings (3B), and Settings (3C, the "Device" tab) are later phases — the nav
// stays fully visible per §8.3's wireframe, but only Today is wired up in Phase 2a.
function ComingSoonScreen({ theme, tab }: { theme: ThemeSurfaces; tab: AppTab }) {
  if (tab === 'today') return null
  return (
    <div className="flex items-center justify-center px-6" style={{ minHeight: '60vh' }}>
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, textAlign: 'center' }}>
        {TAB_LABELS[tab]} arrives in a later phase.
      </p>
    </div>
  )
}
