// Rules editor — spec §4.3, §4.4, §8.7. Add, edit, reorder, enable/disable, set effective dates.
// New rules default to effective tomorrow; backdating warns, naming the date and how many past
// days it opens for every participant (§4.4). Points are snapshotted at write time (CLAUDE.md hard
// rule) — editing a rule here never rewrites history, it only changes what future days score.
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { createRule, updateRule, ApiError } from '../../api'
import { daysRuleWouldOpen, defaultRuleEffectiveFrom, isRuleBackdated } from '../../lib/settingsHelpers'
import { RADIUS, TYPE_SCALE, type ThemeSurfaces } from '../../theme'
import { ReorderableList } from './ReorderableList'
import {
  ConfirmSheet, fieldLabelStyle, SettingsErrorText, SettingsHint, SettingsSection, textInputStyle,
  Toggle,
} from './shared'
import type { CompareOp, CreateRuleRequest, Rule, RuleType, UpdateRuleRequest } from '../../types'

interface RulesSectionProps {
  theme: ThemeSurfaces
  rules: Rule[]
  serverToday: string
  onRuleCreated: (rule: Rule) => void
  onRuleUpdated: (rule: Rule) => void
}

const ROW_HEIGHT = 52
const GENERIC_ERROR = 'Could not save. Check your connection and try again.'
const RULE_TYPE_LABELS: Record<RuleType, string> = {
  boolean: 'Checkbox', counter: 'Counter', threshold: 'Threshold',
}

export function RulesSection({
  theme, rules, serverToday, onRuleCreated, onRuleUpdated,
}: RulesSectionProps) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const sortedRules = [...rules].sort((a, b) => a.sort_order - b.sort_order)
  const editingRule = editingId && editingId !== 'new'
    ? rules.find((r) => r.id === editingId) ?? null
    : null

  function handleReorder(orderedIds: string[]) {
    orderedIds.forEach((id, index) => {
      const rule = sortedRules.find((r) => r.id === id)
      if (rule && rule.sort_order !== index) {
        updateRule(id, { sort_order: index }).then(onRuleUpdated).catch(() => {})
      }
    })
  }

  return (
    <SettingsSection theme={theme} title="Rules" kicker={`${sortedRules.length} total`}>
      <ReorderableList
        theme={theme}
        items={sortedRules}
        rowHeight={ROW_HEIGHT}
        onReorder={handleReorder}
        renderItem={(rule) => (
          <RuleRow
            theme={theme}
            rule={rule}
            onTap={() => setEditingId(rule.id)}
            onToggleEnabled={(enabled) => updateRule(rule.id, { enabled }).then(onRuleUpdated).catch(() => {})}
          />
        )}
      />

      <AddRuleButton theme={theme} onTap={() => setEditingId('new')} />

      {editingId === 'new' && (
        <RuleEditSheet
          theme={theme}
          serverToday={serverToday}
          onClose={() => setEditingId(null)}
          onCreated={(rule) => { onRuleCreated(rule); setEditingId(null) }}
          onUpdated={() => {}}
        />
      )}
      {editingRule && (
        <RuleEditSheet
          theme={theme}
          serverToday={serverToday}
          existing={editingRule}
          onClose={() => setEditingId(null)}
          onCreated={() => {}}
          onUpdated={(rule) => { onRuleUpdated(rule); setEditingId(null) }}
        />
      )}
    </SettingsSection>
  )
}

function RuleRow({
  theme, rule, onTap, onToggleEnabled,
}: {
  theme: ThemeSurfaces
  rule: Rule
  onTap: () => void
  onToggleEnabled: (next: boolean) => void
}) {
  function handleToggleClick(event: React.MouseEvent) {
    event.stopPropagation()
    onToggleEnabled(!rule.enabled)
  }

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full flex items-center gap-2.5 text-left"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}
    >
      <div className="flex-1 min-w-0">
        <div
          className="truncate"
          style={{ ...TYPE_SCALE.bodyCopy, color: rule.enabled ? theme.ink : theme.muted }}
        >
          {rule.label}
        </div>
        <div style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 1 }}>
          {RULE_TYPE_LABELS[rule.type]} · +{rule.points} · {effectiveWindowLabel(rule)}
        </div>
      </div>
      <div onClick={handleToggleClick}>
        <Toggle theme={theme} checked={rule.enabled} onChange={onToggleEnabled} label={`Enable ${rule.label}`} />
      </div>
    </button>
  )
}

function effectiveWindowLabel(rule: Rule): string {
  if (rule.effective_from === null && rule.effective_to === null) return 'always'
  if (rule.effective_to === null) return `from ${rule.effective_from}`
  if (rule.effective_from === null) return `until ${rule.effective_to}`
  return `${rule.effective_from} → ${rule.effective_to}`
}

function AddRuleButton({ theme, onTap }: { theme: ThemeSurfaces; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full flex items-center justify-center gap-1.5"
      style={{
        marginTop: 8, padding: '10px', borderRadius: RADIUS.calendarCell,
        border: `1px dashed ${theme.hairline}`, background: 'none', cursor: 'pointer',
        color: theme.muted, fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
      }}
    >
      <Plus size={15} /> Add rule
    </button>
  )
}

// ---------------------------------------------------------------------------
// Add / edit sheet
// ---------------------------------------------------------------------------

interface RuleEditSheetProps {
  theme: ThemeSurfaces
  serverToday: string
  existing?: Rule
  onClose: () => void
  onCreated: (rule: Rule) => void
  onUpdated: (rule: Rule) => void
}

function RuleEditSheet({ theme, serverToday, existing, onClose, onCreated, onUpdated }: RuleEditSheetProps) {
  const defaultEffectiveFrom = defaultRuleEffectiveFrom(serverToday)
  const [label, setLabel] = useState(existing?.label ?? '')
  const [category, setCategory] = useState(existing?.category ?? 'General')
  const [type, setType] = useState<RuleType>(existing?.type ?? 'boolean')
  const [points, setPoints] = useState(existing?.points ?? 1)
  const [counterMax, setCounterMax] = useState(configNumber(existing, 'max', 5))
  const [thresholdUnit, setThresholdUnit] = useState(configString(existing, 'unit', ''))
  const [thresholdValue, setThresholdValue] = useState(configNumber(existing, 'threshold', 0))
  const [thresholdCompare, setThresholdCompare] = useState<CompareOp>(configCompare(existing))
  const [effectiveFrom, setEffectiveFrom] = useState(existing?.effective_from ?? defaultEffectiveFrom)
  const [effectiveTo, setEffectiveTo] = useState(existing?.effective_to ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBackdateConfirm, setShowBackdateConfirm] = useState(false)

  const isBackdated = effectiveFrom.length > 0 && isRuleBackdated(effectiveFrom, serverToday)
  const daysOpened = isBackdated ? daysRuleWouldOpen(effectiveFrom, serverToday) : 0

  function requestSave() {
    if (label.trim().length === 0) {
      setError('Label is required.')
      return
    }
    if (isBackdated) {
      setShowBackdateConfirm(true)
      return
    }
    void doSave()
  }

  async function doSave() {
    setShowBackdateConfirm(false)
    setIsSubmitting(true)
    setError(null)
    try {
      const config = configForType(type, counterMax, thresholdUnit, thresholdValue, thresholdCompare)
      const shared = {
        label: label.trim(),
        category: category.trim() || 'General',
        type,
        config,
        points,
        effective_from: effectiveFrom.length > 0 ? effectiveFrom : null,
        effective_to: effectiveTo.length > 0 ? effectiveTo : null,
      }
      if (existing) {
        onUpdated(await updateRule(existing.id, shared as UpdateRuleRequest))
      } else {
        onCreated(await createRule({ key: slugifyLabel(label), ...shared } as CreateRuleRequest))
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ConfirmSheet
      theme={theme}
      title={existing ? 'Edit rule' : 'Add rule'}
      confirmLabel={isSubmitting ? 'Saving…' : 'Save'}
      isSubmitting={isSubmitting}
      onConfirm={requestSave}
      onCancel={onClose}
      message={(
        <div>
          <TextField theme={theme} label="Label" value={label} onChange={setLabel} />
          <TextField theme={theme} label="Category" value={category} onChange={setCategory} />
          <RuleTypeField theme={theme} value={type} onChange={setType} />
          <NumberField theme={theme} label="Points" value={points} onChange={setPoints} />

          {type === 'counter' && (
            <NumberField theme={theme} label="Max count" value={counterMax} onChange={setCounterMax} />
          )}
          {type === 'threshold' && (
            <ThresholdFields
              theme={theme}
              unit={thresholdUnit}
              onUnitChange={setThresholdUnit}
              threshold={thresholdValue}
              onThresholdChange={setThresholdValue}
              compare={thresholdCompare}
              onCompareChange={setThresholdCompare}
            />
          )}

          <DateField theme={theme} label="Effective from" value={effectiveFrom} onChange={setEffectiveFrom} />
          <DateField theme={theme} label="Effective to (optional)" value={effectiveTo} onChange={setEffectiveTo} />
          <SettingsHint theme={theme}>
            Leave "Effective to" blank for an open-ended rule. New rules default to tomorrow.
          </SettingsHint>

          {error && <SettingsErrorText message={error} />}

          {showBackdateConfirm && (
            <ConfirmSheet
              theme={theme}
              title="Backdate this rule?"
              confirmLabel="Yes, backdate"
              isSubmitting={isSubmitting}
              onConfirm={doSave}
              onCancel={() => setShowBackdateConfirm(false)}
              message={`Setting the effective date to ${effectiveFrom} opens ${daysOpened} past `
                + `day${daysOpened === 1 ? '' : 's'} of logging for every participant, starting `
                + 'now. Everyone can immediately backfill that window.'}
            />
          )}
        </div>
      )}
    />
  )
}

function TextField({
  theme, label, value, onChange,
}: {
  theme: ThemeSurfaces
  label: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <label style={fieldLabelStyle(theme)}>{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={textInputStyle(theme)}
      />
    </div>
  )
}

function NumberField({
  theme, label, value, onChange,
}: {
  theme: ThemeSurfaces
  label: string
  value: number
  onChange: (next: number) => void
}) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const parsed = Number.parseFloat(event.target.value)
    onChange(Number.isFinite(parsed) ? parsed : 0)
  }

  return (
    <div style={{ marginTop: 10 }}>
      <label style={fieldLabelStyle(theme)}>{label}</label>
      <input type="number" value={value} onChange={handleChange} style={textInputStyle(theme)} />
    </div>
  )
}

function DateField({
  theme, label, value, onChange,
}: {
  theme: ThemeSurfaces
  label: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <label style={fieldLabelStyle(theme)}>{label}</label>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={textInputStyle(theme)}
      />
    </div>
  )
}

function RuleTypeField({
  theme, value, onChange,
}: {
  theme: ThemeSurfaces
  value: RuleType
  onChange: (next: RuleType) => void
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <label style={fieldLabelStyle(theme)}>Type</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as RuleType)}
        style={textInputStyle(theme)}
      >
        <option value="boolean">Checkbox</option>
        <option value="counter">Counter</option>
        <option value="threshold">Threshold</option>
      </select>
    </div>
  )
}

function ThresholdFields({
  theme, unit, onUnitChange, threshold, onThresholdChange, compare, onCompareChange,
}: {
  theme: ThemeSurfaces
  unit: string
  onUnitChange: (next: string) => void
  threshold: number
  onThresholdChange: (next: number) => void
  compare: CompareOp
  onCompareChange: (next: CompareOp) => void
}) {
  return (
    <>
      <TextField theme={theme} label="Unit" value={unit} onChange={onUnitChange} />
      <NumberField theme={theme} label="Threshold value" value={threshold} onChange={onThresholdChange} />
      <div style={{ marginTop: 10 }}>
        <label style={fieldLabelStyle(theme)}>Comparison</label>
        <select
          value={compare}
          onChange={(event) => onCompareChange(event.target.value as CompareOp)}
          style={textInputStyle(theme)}
        >
          <option value="gte">At least (≥)</option>
          <option value="lte">At most (≤)</option>
        </select>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function configNumber(rule: Rule | undefined, key: 'max' | 'threshold', fallback: number): number {
  if (!rule) return fallback
  const value = (rule.config as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : fallback
}

function configString(rule: Rule | undefined, key: 'unit', fallback: string): string {
  if (!rule) return fallback
  const value = (rule.config as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : fallback
}

function configCompare(rule: Rule | undefined): CompareOp {
  if (!rule) return 'gte'
  const value = (rule.config as Record<string, unknown>).compare
  return value === 'lte' ? 'lte' : 'gte'
}

function configForType(
  type: RuleType,
  counterMax: number,
  thresholdUnit: string,
  thresholdValue: number,
  thresholdCompare: CompareOp,
) {
  if (type === 'counter') return { max: counterMax }
  if (type === 'threshold') return { unit: thresholdUnit, threshold: thresholdValue, compare: thresholdCompare }
  return {}
}

const SLUG_DISALLOWED_CHARS = /[^a-z0-9_]+/g

function slugifyLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '_').replace(SLUG_DISALLOWED_CHARS, '')
}
