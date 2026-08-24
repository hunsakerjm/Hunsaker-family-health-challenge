import type { LucideIcon } from 'lucide-react'
import { FONT_BODY, SPACING, type ThemeSurfaces } from '../theme'

export interface BottomNavItem {
  key: string
  label: string
  Icon: LucideIcon
}

interface BottomNavProps {
  theme: ThemeSurfaces
  items: BottomNavItem[]
  activeKey: string
  onSelect: (key: string) => void
  /** The device's own person's claimed color — active tab is tinted with it. */
  activeColor: string
}

const ACTIVE_STROKE_WIDTH = 2.5
const INACTIVE_STROKE_WIDTH = 2
const ITEM_PADDING = '9px 0 5px'
const LABEL_MARGIN_TOP = 3
// The primary device is a physical iPhone; the home-indicator gesture area
// sits under the nav bar, so padding must never collapse to a fixed value.
const SAFE_AREA_BOTTOM_PADDING = 'max(6px, env(safe-area-inset-bottom))'

/** The four-tab bottom bar: Today / Calendar / Standings / Device (Settings). */
export function BottomNav({ theme, items, activeKey, onSelect, activeColor }: BottomNavProps) {
  return (
    <nav
      aria-label="Primary"
      className="flex"
      style={{
        background: theme.surface,
        borderTop: `1px solid ${theme.hairline}`,
        paddingBottom: SAFE_AREA_BOTTOM_PADDING,
      }}
    >
      {items.map((item) => (
        <BottomNavButton
          key={item.key}
          item={item}
          active={item.key === activeKey}
          activeColor={activeColor}
          muted={theme.muted}
          onSelect={onSelect}
        />
      ))}
    </nav>
  )
}

function BottomNavButton({
  item,
  active,
  activeColor,
  muted,
  onSelect,
}: {
  item: BottomNavItem
  active: boolean
  activeColor: string
  muted: string
  onSelect: (key: string) => void
}) {
  const { Icon } = item
  const color = active ? activeColor : muted

  function handleClick() {
    onSelect(item.key)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-current={active ? 'page' : undefined}
      className="flex-1 flex flex-col items-center"
      style={{
        padding: ITEM_PADDING,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color,
      }}
    >
      <Icon
        size={SPACING.bottomNavIconSize}
        strokeWidth={active ? ACTIVE_STROKE_WIDTH : INACTIVE_STROKE_WIDTH}
      />
      <span
        style={{
          fontFamily: FONT_BODY, fontSize: SPACING.bottomNavLabelSize,
          fontWeight: active ? 700 : 500, marginTop: LABEL_MARGIN_TOP,
        }}
      >
        {item.label}
      </span>
    </button>
  )
}
