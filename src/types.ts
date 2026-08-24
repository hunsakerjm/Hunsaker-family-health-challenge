// The parallelism contract, part 1 of 2 (spec §14, CLAUDE.md "The parallelism contract").
//
// Every request and response shape for every endpoint in spec §9 lives here. Phase 2 and every
// Phase 3 track import from this file and never hand-roll a competing shape. If a track needs a
// shape change, it edits this file first and says so in its branch/PR — never a silent local copy.
//
// Naming convention (a real ambiguity §9 left open — resolved here, see Docs/PHASE1B_LOG.md):
// every field name matches the D1 column name it came from, snake_case, because that is already
// what `/api/bootstrap` returns in production and what the §9 CSV export column list uses
// (`display_name`, `log_date`, `max_points_for_date`, ...). One casing convention across DB, wire
// JSON, and CSV means zero translation layers and zero chances to translate one wrong. The single
// documented exception is `serverToday`, because spec §6 names that exact field literally.

// ---------------------------------------------------------------------------
// Rules (spec §4.3, §5)
// ---------------------------------------------------------------------------

export type RuleType = 'boolean' | 'counter' | 'threshold'
export type CompareOp = 'gte' | 'lte'

// `config` is JSON in the DB (spec §5: `config TEXT NOT NULL DEFAULT '{}'`) but every wire
// response in this contract carries it already-parsed, never a raw JSON string a consumer has to
// re-parse. Empty object for `boolean` rules, which take no configuration.
export type BooleanRuleConfig = Record<string, never>

export interface CounterRuleConfig {
  max: number
}

export interface ThresholdRuleConfig {
  unit: string
  threshold: number
  compare: CompareOp
}

export type RuleConfig = BooleanRuleConfig | CounterRuleConfig | ThresholdRuleConfig

export interface Rule {
  id: string
  key: string
  label: string
  short_label: string | null
  description: string | null
  icon: string | null
  category: string
  type: RuleType
  config: RuleConfig
  points: number
  sort_order: number
  effective_from: string | null // YYYY-MM-DD inclusive, null = since challenge start
  effective_to: string | null // YYYY-MM-DD inclusive, null = ongoing
  enabled: boolean
}

export interface CreateRuleRequest {
  key: string
  label: string
  short_label?: string | null
  description?: string | null
  icon?: string | null
  category: string
  type: RuleType
  config?: RuleConfig
  points: number
  sort_order?: number
  // Spec §4.4: new rules default to tomorrow server-side when omitted. Backdating is allowed but
  // the server expects the caller already confirmed the "opens N past days" warning.
  effective_from?: string | null
  effective_to?: string | null
  enabled?: boolean
}

export type UpdateRuleRequest = Partial<Omit<CreateRuleRequest, 'key'>>

// ---------------------------------------------------------------------------
// Users (spec §3.2, §5, §7)
// ---------------------------------------------------------------------------

export type UserStatus = 'active' | 'archived'

export interface User {
  id: string
  display_name: string
  color_key: string
  emoji: string | null
  sort_order: number
  in_points_challenge: boolean
  in_weight_challenge: boolean
  claimed_at: string | null // ISO instant, null = unclaimed
  active_from: string | null // YYYY-MM-DD, null = since challenge start
  active_to: string | null // YYYY-MM-DD, null = ongoing
  status: UserStatus
  created_at: string
  updated_at: string
}

export interface CreateUserRequest {
  display_name: string
  color_key: string
  emoji?: string | null
  in_points_challenge?: boolean
  in_weight_challenge?: boolean
  // Spec §8.7: adding mid-challenge sets active_from to that date, no backfilled history.
  // Omitted = since challenge start.
  active_from?: string | null
}

export type UpdateUserRequest = Partial<{
  display_name: string
  color_key: string
  emoji: string | null
  sort_order: number
  in_points_challenge: boolean
  in_weight_challenge: boolean
  active_from: string | null
  active_to: string | null // setting this is how archiving is expressed
  status: UserStatus
}>

// ---------------------------------------------------------------------------
// Log entries (spec §4.3, §5, §8.3)
// ---------------------------------------------------------------------------

export interface LogEntry {
  user_id: string
  log_date: string
  rule_key: string
  value: number
  points: number // server-computed snapshot, never client-supplied
  updated_at: string
}

// PUT /api/logs/:userId/:date request body — spec §9: "{values:{rule_key:number}}".
export interface PutLogRequest {
  values: Record<string, number> // rule_key -> raw value, one entry per rule being written
}

// Spec §9: "Returns canonical day state including that date's max." `values` and `points` are
// keyed by rule_key so the client never has to search an array to find one rule's row.
export interface DayLogState {
  user_id: string
  log_date: string
  values: Record<string, number> // rule_key -> server-clamped value actually stored
  points: Record<string, number> // rule_key -> points awarded for that rule on this date
  points_total: number
  max_points_for_date: number
}

// ---------------------------------------------------------------------------
// Weight entries (spec §5, §8.6, §9)
// ---------------------------------------------------------------------------

export interface WeightEntry {
  user_id: string
  log_date: string
  weight_lb: number
  is_baseline: boolean
  updated_at: string
}

export interface PutWeightRequest {
  weight_lb: number
}

// ---------------------------------------------------------------------------
// Stats (spec §8.5, §9)
// ---------------------------------------------------------------------------

export type StatsPeriod = 'month' | 'all'

// Spec §9: GET /api/stats/leaderboard?period=month|all&month=YYYY-MM
// `month` is required when period is 'month', ignored/omit-able when period is 'all'.
export interface LeaderboardQuery {
  period: StatsPeriod
  month?: string // YYYY-MM, required iff period === 'month'
}

export interface LeaderboardEntry {
  user_id: string
  display_name: string
  color_key: string
  emoji: string | null
  points_total: number
  rank: number
  tied: boolean // spec §8.5: ties share a position with a "T" prefix, never auto-broken
  // Powers the §8.5 "Consistency" widget (days logged, average points per logged day) without a
  // separate endpoint — it is the same per-person totals query for the same period.
  days_logged: number
  avg_points_per_logged_day: number
}

export interface LeaderboardResponse {
  period: StatsPeriod
  month: string | null
  entries: LeaderboardEntry[]
}

export interface RuleStatsQuery {
  period: StatsPeriod
  month?: string
}

// Spec §9 / §8.5: "per user × rule: hits, eligible days, completion rate. Powers the radar."
export interface RuleStatsEntry {
  user_id: string
  rule_key: string
  hits: number
  eligible_days: number // days that rule was effective and the user was active
  completion_rate: number // hits / eligible_days, 0..1, never raw points (spec §8.5)
}

export interface RuleStatsResponse {
  period: StatsPeriod
  month: string | null
  entries: RuleStatsEntry[]
}

export interface RibbonQuery {
  month: string // YYYY-MM
}

// One vertical bar per day, tap for a tooltip (spec §8.5) — `rules` carries the per-rule values
// backing that tooltip without a second round trip.
//
// `eligible` — added on phase-3b-standings (parallelism contract: shape changes land here first).
// False for a day outside the person's active window or the challenge window (e.g. they joined
// mid-challenge), so the client can render "wasn't part of the challenge yet" distinctly from
// "eligible but unlogged" (which is `rules: {}` with `eligible: true`) without a second call.
export interface RibbonDayCell {
  log_date: string
  points: number
  max_points_for_date: number
  rules: Record<string, number> // rule_key -> value logged that day
  eligible: boolean
}

export interface RibbonUserRow {
  user_id: string
  display_name: string
  color_key: string
  days: RibbonDayCell[]
}

export interface RibbonResponse {
  month: string
  users: RibbonUserRow[]
}

// Spec §9: "percentages only — pounds never appear in this response." No weight_lb field exists
// anywhere on this type, by design, so a leak here is a type error, not just a code review miss.
export interface WeightStatsEntry {
  user_id: string
  display_name: string
  color_key: string
  emoji: string | null
  percent_lost: number // positive = lost weight, negative = gained; ties/sort handled client-side
}

export interface WeightStatsResponse {
  entries: WeightStatsEntry[]
}

// ---------------------------------------------------------------------------
// Config (spec §4.1, §5, §9)
// ---------------------------------------------------------------------------

// Every app_config key except the two secret ones (family_password_hash, family_password_salt),
// which spec §9 says must never be returned — they are not represented in this type at all.
// Values are coerced server-side to their real JS type; app_config.value is TEXT in D1, but a
// contract that hands every consumer a Record<string,string> just moves the parsing bug
// downstream three times instead of fixing it once here.
export interface AppConfig {
  challenge_start: string // YYYY-MM-DD, inclusive
  challenge_end: string // YYYY-MM-DD, inclusive
  timezone: string // IANA zone, e.g. "America/Los_Angeles"
  session_version: number
  backfill_limit_days: number // 0 = unlimited past editing
  future_logging_days: number // how far ahead logging is allowed
  prize_monthly: string // display string only, spec §1
  prize_final: string // display string only, spec §1
  challenge_title: string
}

// Spec §8.7 "Password" section has no dedicated endpoint in the §9 table; resolved here (see
// Docs/PHASE1B_LOG.md) as two write-only fields on PATCH /api/config rather than inventing a new
// route. `new_password` is hashed server-side and never echoed back in any response.
export interface UpdateConfigRequest extends Partial<AppConfig> {
  new_password?: string
  // Spec §3.1: bumping session_version signs out every device. Exposed here as an explicit intent
  // flag rather than making callers guess-and-set the next integer themselves.
  sign_out_all_devices?: boolean
}

// ---------------------------------------------------------------------------
// Bootstrap (spec §6, §9, §14 Phase 1 demo)
// ---------------------------------------------------------------------------

// GET /api/bootstrap — spec §9: "one call on cold start: config, serverToday, rules effective
// now, users with claim state, and the current month's logs." `serverToday` keeps the spec's
// literal camelCase name (§6 names it exactly that); every other field follows this file's
// snake_case convention.
export interface BootstrapResponse {
  config: AppConfig
  serverToday: string // YYYY-MM-DD, computed server-side in the challenge timezone — spec §6
  rules: Rule[]
  users: User[]
  logs: LogEntry[] // current month's logs, spec §9
}

// ---------------------------------------------------------------------------
// Sync batch (spec §9, §10)
// ---------------------------------------------------------------------------

export interface SyncLogOp {
  op_type: 'log'
  client_op_id: string // caller-generated, for idempotent replay after a dropped response
  user_id: string
  log_date: string
  values: Record<string, number>
}

export interface SyncWeightOp {
  op_type: 'weight'
  client_op_id: string
  user_id: string
  log_date: string
  weight_lb: number
}

export type SyncOp = SyncLogOp | SyncWeightOp

export interface SyncBatchRequest {
  ops: SyncOp[]
}

export interface SyncBatchOpResult {
  client_op_id: string
  ok: boolean
  error?: ApiErrorBody['error']
}

export interface SyncBatchResponse {
  results: SyncBatchOpResult[]
}

// ---------------------------------------------------------------------------
// Admin (spec §4.3, §9)
// ---------------------------------------------------------------------------

export interface RecomputeResponse extends OkResponse {
  rows_updated: number
}

// ---------------------------------------------------------------------------
// Auth (spec §3.1, §9)
// ---------------------------------------------------------------------------

export interface OkResponse {
  ok: true
}

export interface LoginRequest {
  password: string
}

export type LoginResponse = OkResponse
export type LogoutResponse = OkResponse
export type DeleteWeightResponse = OkResponse

// ---------------------------------------------------------------------------
// Misc (spec §9)
// ---------------------------------------------------------------------------

// Matches the live `functions/api/health.ts` response exactly — `{status: 'ok'}`, not `{ok: true}`.
export interface HealthResponse {
  status: 'ok'
}

export type ClaimUserResponse = User

// Spec §9: "Return {error:{code,message}} with messages the UI can display directly." Matches the
// shape already live in `functions/api/auth/login.ts` and `functions/api/_middleware.ts`.
export interface ApiErrorBody {
  error: {
    code: number
    message: string
  }
}
