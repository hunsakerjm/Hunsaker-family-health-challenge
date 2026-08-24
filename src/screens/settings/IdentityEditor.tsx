// The identity editor — spec §7.1. "Same component, different target": Settings → People uses it
// per-person, Settings → This device uses it for the device's own person. Emoji and color are
// deliberately two separate blocks with a rule between them ("two different decisions") — never
// merged into one control.
import { useRef } from 'react'
import { Check } from 'lucide-react'
import {
  FONT_MONO, PALETTE, PALETTE_ORDER, SPACING,
  TINT_STEP_SELECTED_SWATCH_RING, tint, type ThemeSurfaces,
} from '../../theme'
import { fieldLabelStyle, SettingsHint } from './shared'

interface IdentityEditorProps {
  theme: ThemeSurfaces
  emoji: string
  colorKey: string
  onEmojiChange: (next: string) => void
  onColorChange: (next: string) => void
  /** color_key -> display_name of whoever else (active) already holds it. Excludes this person. */
  takenColors: Record<string, string>
}

const EMOJI_CIRCLE_SIZE = SPACING.avatarIdentityEditor
const EMOJI_INPUT_WIDTH = 40

export function IdentityEditor({
  theme, emoji, colorKey, onEmojiChange, onColorChange, takenColors,
}: IdentityEditorProps) {
  const emojiInputRef = useRef<HTMLInputElement>(null)
  const palette = PALETTE[colorKey as keyof typeof PALETTE] ?? PALETTE.slate

  function focusEmojiInput() {
    emojiInputRef.current?.focus()
  }

  function handleEmojiInput(event: React.ChangeEvent<HTMLInputElement>) {
    const grapheme = lastGrapheme(event.target.value)
    if (grapheme) onEmojiChange(grapheme)
  }

  function handleEmojiFocus(event: React.FocusEvent<HTMLInputElement>) {
    event.target.select()
  }

  return (
    <div>
      <div>
        <span style={fieldLabelStyle(theme)}>Emoji</span>
        <div className="flex items-center gap-3">
          <div
            onClick={focusEmojiInput}
            className="flex items-center justify-center rounded-full"
            style={{
              width: EMOJI_CIRCLE_SIZE, height: EMOJI_CIRCLE_SIZE, background: palette.hex,
              cursor: 'text', flexShrink: 0,
            }}
          >
            {/* A one-character text input. Focusing it opens the system keyboard; there is no web
               API to open the emoji panel directly, and a curated grid would only ever guess at
               what eight people want (§7.1). */}
            <input
              ref={emojiInputRef}
              value={emoji}
              onChange={handleEmojiInput}
              onFocus={handleEmojiFocus}
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Emoji"
              style={{
                width: EMOJI_INPUT_WIDTH, textAlign: 'center', fontSize: 24, lineHeight: 1,
                background: 'transparent', border: 'none', outline: 'none',
                caretColor: palette.on, padding: 0,
              }}
            />
          </div>
          <SettingsHint theme={theme}>
            Tap the circle, then hit the emoji key on your keyboard. This is how people spot you
            in the ribbon.
          </SettingsHint>
        </div>
      </div>

      <div style={{ height: 1, background: theme.hairline, margin: '14px 0' }} />

      <div>
        <div className="flex items-baseline justify-between" style={{ marginBottom: 10 }}>
          <span style={fieldLabelStyle(theme)}>Color</span>
          <span style={{
            fontFamily: FONT_MONO, fontSize: 10, color: palette.hex, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}
          >
            {colorKey}
          </span>
        </div>
        <div className="grid grid-cols-8 justify-items-center" style={{ gap: SPACING.colorSwatchGap }}>
          {PALETTE_ORDER.map((key) => (
            <ColorSwatch
              key={key}
              theme={theme}
              colorKey={key}
              isMine={colorKey === key}
              takenByName={takenColors[key]}
              onSelect={() => onColorChange(key)}
            />
          ))}
        </div>
        <SettingsHint theme={theme}>
          Struck-out colors are taken — hold to see by whom. Changing yours updates every screen
          at once: banner, calendar pips, ribbon, radar, and nav.
        </SettingsHint>
      </div>
    </div>
  )
}

function ColorSwatch({
  theme, colorKey, isMine, takenByName, onSelect,
}: {
  theme: ThemeSurfaces
  colorKey: string
  isMine: boolean
  takenByName: string | undefined
  onSelect: () => void
}) {
  const entry = PALETTE[colorKey as keyof typeof PALETTE]
  const isTaken = takenByName !== undefined && !isMine

  return (
    <button
      type="button"
      disabled={isTaken}
      onClick={onSelect}
      title={isTaken ? `Taken by ${takenByName}` : colorKey}
      aria-label={isTaken ? `${colorKey}, taken by ${takenByName}` : colorKey}
      className="relative flex items-center justify-center rounded-full"
      style={{
        width: SPACING.colorSwatchSize,
        height: SPACING.colorSwatchSize,
        cursor: isTaken ? 'not-allowed' : 'pointer',
        background: entry.hex,
        opacity: isTaken ? 0.3 : 1,
        border: isMine ? `2.5px solid ${theme.ink}` : `1px solid ${theme.hairline}`,
        boxShadow: isMine ? `0 0 0 3px ${tint(entry.hex, theme, TINT_STEP_SELECTED_SWATCH_RING)}` : 'none',
        transform: isMine ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 140ms ease',
        overflow: 'hidden',
      }}
    >
      {isMine && <Check size={15} strokeWidth={3.6} color={entry.on} />}
      {isTaken && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', width: '142%', height: 2,
            background: theme.ink, opacity: 0.55, transform: 'rotate(-45deg)',
          }}
        />
      )}
    </button>
  )
}

/** Take the LAST full grapheme (spec §7.1) so multi-codepoint emoji (ZWJ families, flags) survive
 *  intact — `Array.from` would shred them into 2-3 separate characters. */
function lastGrapheme(value: string): string {
  if (!value) return ''
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segments = [...new Intl.Segmenter().segment(value)]
    return segments.length > 0 ? segments[segments.length - 1].segment : ''
  }
  const chars = Array.from(value)
  return chars.length > 0 ? chars[chars.length - 1] : ''
}
