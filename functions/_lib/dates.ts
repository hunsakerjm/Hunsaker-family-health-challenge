// The canonical implementation now lives in `src/lib/dates.ts` (spec §14's "parallelism
// contract" — one date-math module shared by client and server, so "today," month boundaries,
// and maxPointsForDate can never drift between the two). Re-exported here so every existing
// `functions/**` import of this module keeps working unchanged.
export {
  computeServerTodayInTimezone,
  maxPointsForDate,
  getEditableDateRange,
  isDateEditable,
  addDays,
  compareDates,
  daysBetween,
  isDateInRange,
  getMonthKey,
  getMonthBoundaries,
} from '../../src/lib/dates'
export type { RuleForMaxPoints, EditableRangeConfig, MonthBoundaries } from '../../src/lib/dates'
