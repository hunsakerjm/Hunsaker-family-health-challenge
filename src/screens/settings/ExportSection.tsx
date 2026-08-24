// Export — spec §8.7, §9. "The export is load-bearing" (§9): streak calculation and any other
// after-the-fact analysis were deliberately moved out of the app and into offline analysis of
// this CSV. One tap, no confirmation needed — reading data is never destructive.
import { Download } from 'lucide-react'
import { EXPORT_CSV_PATH } from '../../api'
import type { ThemeSurfaces } from '../../theme'
import { SettingsHint, SettingsSection } from './shared'

export function ExportSection({ theme }: { theme: ThemeSurfaces }) {
  return (
    <SettingsSection theme={theme} title="Export">
      <a
        href={EXPORT_CSV_PATH}
        className="w-full flex items-center justify-center gap-2"
        style={{
          padding: '11px', borderRadius: 12, border: 'none',
          background: theme.ink, color: theme.surface, textDecoration: 'none',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
        }}
      >
        <Download size={16} /> Download CSV
      </a>
      <SettingsHint theme={theme}>
        Every log entry and weight entry, long format — one row per person, date, and rule, with
        zero-value rows kept so a rough day is distinguishable from an unlogged one. Opens
        directly in Excel or Sheets.
      </SettingsHint>
    </SettingsSection>
  )
}
