// The one `YYYY-MM-DD` shape check shared by every Phase 2a route that reads a date from a URL
// segment or query string, before it's safe to hand to `src/lib/dates.ts`'s parsing (which throws
// a `RangeError` on anything else — a route must turn that into a clean 400, not a 500).
const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isValidDateString(value: string): boolean {
  return DATE_STRING_PATTERN.test(value)
}
