// Rules store their icon as a lucide icon name string (spec §5: "icon TEXT — lucide icon name"),
// kebab-case to match lucide's own naming convention (e.g. the seeded rules use "droplet",
// "moon", "utensils", "activity", "dumbbell" — see migrations/0002_seed.sql). lucide-react only
// exports icons as individually-typed named exports, not a typed name->component map, so this is
// an explicit allow-list rather than a dynamic lookup — safer under strict TypeScript and it
// tree-shakes to just the icons actually used. An icon name added in Settings (Phase 3C) that
// isn't listed here falls back to a generic circle rather than crashing the row.
import {
  Activity,
  Circle,
  Droplet,
  Dumbbell,
  Moon,
  Utensils,
  type LucideIcon,
} from 'lucide-react'

const RULE_ICONS: Record<string, LucideIcon> = {
  droplet: Droplet,
  moon: Moon,
  utensils: Utensils,
  activity: Activity,
  dumbbell: Dumbbell,
}

const FALLBACK_RULE_ICON: LucideIcon = Circle

export function iconForRule(iconKey: string | null): LucideIcon {
  if (!iconKey) return FALLBACK_RULE_ICON
  return RULE_ICONS[iconKey] ?? FALLBACK_RULE_ICON
}
