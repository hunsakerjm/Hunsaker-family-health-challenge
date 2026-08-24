// Server-side "today" in the challenge timezone (spec §6). Formats directly
// rather than constructing a Date from parts, so this never touches the
// `new Date('YYYY-MM-DD')` UTC-parsing trap the spec warns about.
export function computeServerTodayInTimezone(timezone: string, now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // en-CA formats as YYYY-MM-DD, exactly the log_date shape spec §6 requires.
  return formatter.format(now)
}
