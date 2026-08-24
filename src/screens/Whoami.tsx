// "Who's using this device?" — spec §3.2, §8.2. Shown once per device (App.tsx decides when,
// based on whether src/lib/identity.ts has an activeUserId yet) and reachable again later via the
// header avatar long-press or Settings "Switch person" (Settings itself is Phase 3C; the
// long-press affordance lives in Today.tsx and just navigates back here).
//
// This screen has no mockup reference — HealthChallengeMockup.jsx's person-switcher strip is
// explicitly commented "mockup chrome — not part of the app," so this is built from spec §3.2/
// §8.2 text and the shared design tokens/primitives only.
import { useState } from 'react'
import { claimUser } from '../api'
import { setActiveUserId } from '../lib/identity'
import { Sheet, SheetButton } from '../components/Sheet'
import {
  desat,
  paletteEntryFor,
  RADIUS,
  SPACING,
  THEME_DARK,
  TYPE_SCALE,
  type ThemeSurfaces,
} from '../theme'
import type { User } from '../types'

interface WhoamiScreenProps {
  theme: ThemeSurfaces
  users: User[]
  onIdentityClaimed: (userId: string) => void
}

const CARD_MIN_HEIGHT = 108
const CARD_GAP = 10
const CLAIMED_CARD_OPACITY = 0.7
const EMOJI_FALLBACK = '🙂'
const GENERIC_CLAIM_ERROR = 'Could not set up this device. Try again.'
const ERROR_COLOR = '#E5484D' // spec §7 `ruby`-family red; matches the auth gate's inline error

export function WhoamiScreen({ theme, users, onIdentityClaimed }: WhoamiScreenProps) {
  const [pendingClaim, setPendingClaim] = useState<User | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Archived people (spec §8.7) have left the challenge — they don't belong in a device picker.
  const activePeople = users.filter((user) => user.status === 'active')
  // Spec §3.2: "Unclaimed — full color, prominent, sorted first."
  const unclaimedPeople = activePeople.filter((user) => user.claimed_at === null)
  const claimedPeople = activePeople.filter((user) => user.claimed_at !== null)

  async function claim(user: User) {
    setErrorMessage(null)
    setIsSubmitting(true)
    try {
      await claimUser(user.id)
      // Spec §3.2/§3.3: the claim is a device-local soft signal — write it here, not just on the
      // server, so this device immediately treats itself as this person's from now on.
      setActiveUserId(user.id)
      onIdentityClaimed(user.id)
    } catch {
      setErrorMessage(GENERIC_CLAIM_ERROR)
    } finally {
      setIsSubmitting(false)
      setPendingClaim(null)
    }
  }

  function handleCardTap(user: User) {
    if (isSubmitting) return
    const isAlreadyClaimed = user.claimed_at !== null
    // Spec §3.2: unclaimed people claim on one tap; claimed people ask for confirmation first —
    // covers a new phone, an iPad, or a genuine mistake.
    if (isAlreadyClaimed) {
      setPendingClaim(user)
    } else {
      claim(user)
    }
  }

  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ background: theme.paper, padding: SPACING.screenGutter }}
    >
      <WhoamiHeader theme={theme} />

      {errorMessage && (
        <p role="alert" style={{ ...TYPE_SCALE.caption, color: ERROR_COLOR, marginTop: 8 }}>
          {errorMessage}
        </p>
      )}

      <div className="grid grid-cols-2" style={{ gap: CARD_GAP, marginTop: 18 }}>
        {unclaimedPeople.map((user) => (
          <PersonCard
            key={user.id}
            theme={theme}
            user={user}
            claimed={false}
            disabled={isSubmitting}
            onTap={() => handleCardTap(user)}
          />
        ))}
        {claimedPeople.map((user) => (
          <PersonCard
            key={user.id}
            theme={theme}
            user={user}
            claimed
            disabled={isSubmitting}
            onTap={() => handleCardTap(user)}
          />
        ))}
      </div>

      {activePeople.length === 0 && (
        <p
          style={{
            ...TYPE_SCALE.caption, color: theme.muted, marginTop: 24, textAlign: 'center',
          }}
        >
          No one has been added yet. Add family members from Settings before launch.
        </p>
      )}

      {pendingClaim && (
        <ConfirmClaimSheet
          theme={theme}
          user={pendingClaim}
          isSubmitting={isSubmitting}
          onConfirm={() => claim(pendingClaim)}
          onCancel={() => setPendingClaim(null)}
        />
      )}
    </div>
  )
}

function WhoamiHeader({ theme }: { theme: ThemeSurfaces }) {
  return (
    <div>
      <h1 style={{ ...TYPE_SCALE.screenTitle, color: theme.ink }}>
        Who&rsquo;s using this device?
      </h1>
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 4 }}>
        Tap your name. You can switch later from Settings.
      </p>
    </div>
  )
}

function PersonCard({
  theme,
  user,
  claimed,
  disabled,
  onTap,
}: {
  theme: ThemeSurfaces
  user: User
  claimed: boolean
  disabled: boolean
  onTap: () => void
}) {
  const palette = paletteEntryFor(user.color_key)
  const background = claimed ? desat(palette.hex, theme) : palette.hex
  // Same "on" formula Banner.tsx uses for its read-only treatment — white glyphs everywhere
  // except dark mode, where the theme's own ink reads better against a desaturated fill.
  const onReadOnly = theme === THEME_DARK ? THEME_DARK.ink : '#FFFFFF'
  const onColor = claimed ? onReadOnly : palette.on

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      aria-label={claimed ? `${user.display_name}, set up on another device` : user.display_name}
      className="flex flex-col items-center justify-center text-center"
      style={{
        minHeight: CARD_MIN_HEIGHT,
        borderRadius: RADIUS.card,
        background,
        opacity: claimed ? CLAIMED_CARD_OPACITY : 1,
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        padding: '16px 10px',
      }}
    >
      <span style={{ fontSize: 30, lineHeight: 1 }}>{user.emoji ?? EMOJI_FALLBACK}</span>
      <span style={{
        ...TYPE_SCALE.bodyCopy, color: onColor, marginTop: 8, fontWeight: 700,
      }}
      >
        {user.display_name}
      </span>
      {claimed && (
        <span style={{
          ...TYPE_SCALE.caption, color: onColor, opacity: 0.85, marginTop: 2,
        }}
        >
          Set up on another device
        </span>
      )}
    </button>
  )
}

function ConfirmClaimSheet({
  theme,
  user,
  isSubmitting,
  onConfirm,
  onCancel,
}: {
  theme: ThemeSurfaces
  user: User
  isSubmitting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet theme={theme} onDismiss={isSubmitting ? undefined : onCancel}>
      <h2 style={{ ...TYPE_SCALE.sectionTitle, color: theme.ink }}>
        Set up as {user.display_name}?
      </h2>
      <p style={{
        ...TYPE_SCALE.caption, color: theme.muted, marginTop: 6, lineHeight: 1.5,
      }}
      >
        {user.display_name} is already set up on another device. This only tells THIS device
        who&rsquo;s using it — it won&rsquo;t affect the other device.
      </p>
      <div className="flex" style={{ gap: 10, marginTop: 16 }}>
        <SheetButton
          theme={theme}
          label="Cancel"
          onClick={onCancel}
          primary={false}
          disabled={isSubmitting}
        />
        <SheetButton
          theme={theme}
          label={isSubmitting ? 'Setting up…' : 'Yes, this is me'}
          onClick={onConfirm}
          primary
          disabled={isSubmitting}
        />
      </div>
    </Sheet>
  )
}
