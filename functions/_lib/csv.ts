// Minimal RFC-4180-ish CSV encoding for `functions/api/export.csv.ts` (spec §9: "the export is
// load-bearing"). No library — the quoting rule is one branch, and pulling in a dependency for it
// would cost more than it saves.

const FIELDS_NEEDING_QUOTES = /[",\n\r]/

/** Quote a field only when it contains a comma, quote, or newline; double any embedded quotes. */
export function csvField(value: string | number | boolean | null): string {
  const raw = value === null ? '' : String(value)
  if (!FIELDS_NEEDING_QUOTES.test(raw)) return raw
  return `"${raw.replace(/"/g, '""')}"`
}

export function csvRow(values: ReadonlyArray<string | number | boolean | null>): string {
  return values.map(csvField).join(',')
}
