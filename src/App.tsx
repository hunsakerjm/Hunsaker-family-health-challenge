import { useEffect, useState } from 'react'
import {
  Check, CalendarDays, Settings as SettingsIcon, Trophy,
} from 'lucide-react'
import { LoginScreen } from './screens/Login'
import { SplashScreen } from './screens/Splash'
import { DesignSystem } from './screens/DesignSystem'
// Phase 2b's route — see Docs/PHASE2A_LOG.md. This file does not exist in this worktree yet
// (phase-2b-celebration is a sibling branch/worktree); the orchestrator resolves it at merge.
// Until then this import breaks `tsc --noEmit` / `npm run build` in THIS worktree by design.
import { CelebrationDemo } from './screens/CelebrationDemo'
import { WhoamiScreen } from './screens/Whoami'
import { TodayScreen } from './screens/Today'
import { CalendarScreen } from './screens/Calendar'
import { WeightDetailScreen } from './screens/WeightDetail'
import { SettingsScreen } from './screens/Settings'
import { StandingsScreen } from './screens/Standings'
import { ThemeProvider, useTheme } from './components/ThemeProvider'
import { BottomNav, type BottomNavItem } from './components/BottomNav'
import { getBootstrap } from './api'
import { getActiveUserId } from './lib/identity'
import { paletteEntryFor, type ThemeSurfaces } from './theme'
import type { BootstrapResponse } from './types'

// Phase 0 demo route, reachable in local dev only via direct navigation. Checked before any
// auth-flow state so it never touches the Login/Whoami/Today boot path.
const DESIGN_SYSTEM_PATH = '/design-system'
// Phase 2b demo route, same pattern as DESIGN_SYSTEM_PATH — reachable in local dev only via
// direct navigation, never touches the auth-flow state.
const CELEBRATION_DEMO_PATH = '/celebration-demo'

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
  const isCelebrationDemoRoute = window.location.pathname === CELEBRATION_DEMO_PATH

  useEffect(() => {
    // Demo routes never call the API and never need a session probe.
    if (isDesignSystemRoute || isCelebrationDemoRoute) return
    loadSession()
  }, [isDesignSystemRoute, isCelebrationDemoRoute])

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

  // Settings → This device → "Sign out" (spec §8.7). DeviceSection already calls the shared
  // /api/auth/logout endpoint and clears the local identity claim before invoking this — App only
  // owns returning to the login gate.
  function handleSignOut() {
    setAuthState('unauthenticated')
  }

  // Settings can create people, edit rules, and edit challenge config (spec §8.7) — any of those
  // leaves bootstrap's cached copy stale for Today/Calendar. Best-effort, same pattern as the
  // post-claim refresh in handleIdentityClaimed: never blocks Settings' own local state, which is
  // already correct on its own.
  function handleDataChanged() {
    getBootstrap().then(setBootstrap).catch(() => {})
  }

  if (isDesignSystemRoute) {
    return (
      <ThemeProvider>
        <DesignSystem />
      </ThemeProvider>
    )
  }

  if (isCelebrationDemoRoute) {
    return (
      <ThemeProvider>
        <CelebrationDemo />
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
        onSignOut={handleSignOut}
        onDataChanged={handleDataChanged}
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
  onSignOut: () => void
  onDataChanged: () => void
}

// Deep-link only in this phase: Calendar/Standings (Phase 3) own the real in-app entry point for
// viewing someone else's page (spec §3.4). `/?u=<userId>` lets that treatment be exercised and
// tested now without adding chrome the mockup doesn't call for on the Today screen itself.
function readViewedUserIdParam(): string | null {
  return new URLSearchParams(window.location.search).get('u')
}

// Set by Calendar's onOpenDay (spec §8.4: "Tapping a day opens that day's log, respecting §3.4")
// and consumed once by TodayScreen's initial mount after the tab switch. One-shot: cleared as
// soon as the person leaves the Today tab, so a later plain tap on the Today nav item goes back
// to the normal "my page, today's date" landing rather than replaying a stale deep link.
interface PendingTodayTarget {
  date: string
  userId: string
}

function AuthenticatedApp({
  bootstrap,
  activeUserId,
  showWhoami,
  activeTab,
  onSelectTab,
  onIdentityClaimed,
  onSwitchPerson,
  onSignOut,
  onDataChanged,
}: AuthenticatedAppProps) {
  const { theme, reducedMotion } = useTheme()
  const [pendingTodayTarget, setPendingTodayTarget] = useState<PendingTodayTarget | null>(null)
  const [showWeightDetail, setShowWeightDetail] = useState(false)

  useEffect(() => {
    if (activeTab !== 'today' && pendingTodayTarget !== null) {
      setPendingTodayTarget(null)
    }
  }, [activeTab, pendingTodayTarget])

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
  const urlViewedUserId = isViewedUserValid ? (viewedUserIdParam as string) : activeUserId
  const viewedUserId = pendingTodayTarget?.userId ?? urlViewedUserId

  function handleSelectTab(key: string) {
    if (key === 'today' || key === 'calendar' || key === 'standings' || key === 'device') {
      onSelectTab(key)
    }
  }

  // Calendar doesn't own the Today tab, so it hands the (date, userId) pair here to switch tabs.
  function handleOpenDay(date: string, userId: string) {
    setPendingTodayTarget({ date, userId })
    onSelectTab('today')
  }

  function handleOpenWeightDetail() {
    setShowWeightDetail(true)
  }

  function handleCloseWeightDetail() {
    setShowWeightDetail(false)
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: theme.paper }}>
      <div className="flex-1 overflow-y-auto">
        {showWeightDetail && ownUser ? (
          <WeightDetailScreen
            theme={theme}
            config={bootstrap.config}
            serverToday={bootstrap.serverToday}
            ownUser={ownUser}
            onBack={handleCloseWeightDetail}
          />
        ) : (
          <TabContent
            theme={theme}
            reducedMotion={reducedMotion}
            bootstrap={bootstrap}
            activeTab={activeTab}
            activeUserId={activeUserId}
            viewedUserId={viewedUserId}
            pendingTodayTarget={pendingTodayTarget}
            onSwitchPerson={onSwitchPerson}
            onOpenDay={handleOpenDay}
            onOpenWeightDetail={handleOpenWeightDetail}
            onSignOut={onSignOut}
            onDataChanged={onDataChanged}
          />
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

interface TabContentProps {
  theme: ThemeSurfaces
  reducedMotion: boolean
  bootstrap: BootstrapResponse
  activeTab: AppTab
  activeUserId: string
  viewedUserId: string
  pendingTodayTarget: PendingTodayTarget | null
  onSwitchPerson: () => void
  onOpenDay: (date: string, userId: string) => void
  onOpenWeightDetail: () => void
  onSignOut: () => void
  onDataChanged: () => void
}

// Split out from AuthenticatedApp purely to keep the tab switch itself short enough to read
// without scrolling — no behavior here depends on anything AuthenticatedApp doesn't already pass.
function TabContent({
  theme,
  reducedMotion,
  bootstrap,
  activeTab,
  activeUserId,
  viewedUserId,
  pendingTodayTarget,
  onSwitchPerson,
  onOpenDay,
  onOpenWeightDetail,
  onSignOut,
  onDataChanged,
}: TabContentProps) {
  if (activeTab === 'today') {
    return (
      <TodayScreen
        theme={theme}
        reducedMotion={reducedMotion}
        config={bootstrap.config}
        serverToday={bootstrap.serverToday}
        initialDate={pendingTodayTarget?.date}
        rules={bootstrap.rules}
        users={bootstrap.users}
        ownUserId={activeUserId}
        viewedUserId={viewedUserId}
        initialLogs={bootstrap.logs}
        onSwitchPerson={onSwitchPerson}
      />
    )
  }

  if (activeTab === 'calendar') {
    return (
      <CalendarScreen
        theme={theme}
        config={bootstrap.config}
        serverToday={bootstrap.serverToday}
        rules={bootstrap.rules}
        users={bootstrap.users}
        ownUserId={activeUserId}
        initialLogs={bootstrap.logs}
        onOpenDay={onOpenDay}
        onOpenWeightDetail={onOpenWeightDetail}
      />
    )
  }

  if (activeTab === 'standings') {
    return (
      <StandingsScreen
        theme={theme}
        config={bootstrap.config}
        serverToday={bootstrap.serverToday}
        rules={bootstrap.rules}
        users={bootstrap.users}
        ownUserId={activeUserId}
      />
    )
  }

  if (activeTab === 'device') {
    return (
      <SettingsScreen
        theme={theme}
        reducedMotion={reducedMotion}
        config={bootstrap.config}
        serverToday={bootstrap.serverToday}
        rules={bootstrap.rules}
        users={bootstrap.users}
        ownUserId={activeUserId}
        onSwitchPerson={onSwitchPerson}
        onSignOut={onSignOut}
        onDataChanged={onDataChanged}
      />
    )
  }
}
