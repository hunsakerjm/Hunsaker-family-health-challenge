// The parallelism contract, part 2 of 2 (spec §14, CLAUDE.md "The parallelism contract").
//
// One function per §9 endpoint, typed against `./types.ts`. Every later track (Phase 2, every
// Phase 3 track) imports functions from here and never hand-rolls its own `fetch` call — that is
// the whole point of publishing this before Phase 2 opens.
//
// Server routes not yet built (everything except `/api/auth/*`, `/api/bootstrap`, `/api/health`
// as of this pass) still get a real function here with its final signature — calling one today
// just 404s until the corresponding Phase 2/3 route lands. The signature, not the server-side
// implementation, is the contract.

import type {
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  BootstrapResponse,
  LogEntry,
  PutLogRequest,
  DayLogState,
  WeightEntry,
  PutWeightRequest,
  DeleteWeightResponse,
  LeaderboardQuery,
  LeaderboardResponse,
  RuleStatsQuery,
  RuleStatsResponse,
  RibbonQuery,
  RibbonResponse,
  WeightStatsResponse,
  User,
  CreateUserRequest,
  UpdateUserRequest,
  ClaimUserResponse,
  Rule,
  CreateRuleRequest,
  UpdateRuleRequest,
  AppConfig,
  UpdateConfigRequest,
  SyncBatchRequest,
  SyncBatchResponse,
  RecomputeResponse,
  HealthResponse,
  ApiErrorBody,
} from './types'

// Thrown for any non-2xx response. `code` mirrors the HTTP status unless the server's
// `{error:{code,message}}` body (spec §9) says otherwise. Callers that need special handling for a
// specific failure (401 -> redirect to the gate, 429 -> rate-limited) branch on `code`.
export class ApiError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Try again.'
const ACTING_USER_HEADER = 'X-Acting-User' // spec §9: advisory, for the audit log only

type QueryValue = string | number | undefined

interface RequestOptions {
  method?: string
  body?: unknown
  query?: Record<string, QueryValue>
  // Spec §9: "Client sends X-Acting-User: <userId> on writes for the audit log." Every mutating
  // function below accepts this; read-only functions don't take the parameter at all.
  actingUserId?: string
}

async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(buildUrl(path, options.query), buildRequestInit(options))
  return parseJsonResponse<T>(response)
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}

function buildRequestInit(options: RequestOptions): RequestInit {
  const headers: Record<string, string> = {}
  if (options.actingUserId) {
    headers[ACTING_USER_HEADER] = options.actingUserId
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    // HttpOnly session cookie (spec §3.1) — every request must carry it.
    credentials: 'include',
    headers,
  }

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }

  return init
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  const data = text.length > 0 ? JSON.parse(text) : undefined

  if (!response.ok) {
    throw errorFromResponse(response, data)
  }
  return data as T
}

function errorFromResponse(response: Response, data: unknown): ApiError {
  const errorBody = data as Partial<ApiErrorBody> | undefined
  const code = errorBody?.error?.code ?? response.status
  const message = errorBody?.error?.message ?? DEFAULT_ERROR_MESSAGE
  return new ApiError(code, message)
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value)
}

// ---------------------------------------------------------------------------
// Auth — spec §3.1, §9
// ---------------------------------------------------------------------------

export function login(password: string): Promise<LoginResponse> {
  const body: LoginRequest = { password }
  return apiFetch<LoginResponse>('/api/auth/login', { method: 'POST', body })
}

export function logout(): Promise<LogoutResponse> {
  return apiFetch<LogoutResponse>('/api/auth/logout', { method: 'POST' })
}

// ---------------------------------------------------------------------------
// Bootstrap — spec §6, §9
// ---------------------------------------------------------------------------

export function getBootstrap(): Promise<BootstrapResponse> {
  return apiFetch<BootstrapResponse>('/api/bootstrap')
}

// ---------------------------------------------------------------------------
// Logs — spec §4.3, §8.3, §9
// ---------------------------------------------------------------------------

export interface GetLogsParams {
  userId: string
  from: string // YYYY-MM-DD, inclusive
  to: string // YYYY-MM-DD, inclusive
}

export function getLogs(params: GetLogsParams): Promise<LogEntry[]> {
  return apiFetch<LogEntry[]>('/api/logs', {
    query: { user_id: params.userId, from: params.from, to: params.to },
  })
}

export function putLog(
  userId: string,
  date: string,
  values: Record<string, number>,
  actingUserId?: string,
): Promise<DayLogState> {
  const body: PutLogRequest = { values }
  const path = `/api/logs/${encodePathSegment(userId)}/${date}`
  return apiFetch<DayLogState>(path, { method: 'PUT', body, actingUserId })
}

// ---------------------------------------------------------------------------
// Weights — spec §5, §8.6, §9
// ---------------------------------------------------------------------------

export function getWeights(userId: string): Promise<WeightEntry[]> {
  return apiFetch<WeightEntry[]>(`/api/weights/${encodePathSegment(userId)}`)
}

export function putWeight(
  userId: string,
  date: string,
  weightLb: number,
  actingUserId?: string,
): Promise<WeightEntry> {
  const body: PutWeightRequest = { weight_lb: weightLb }
  const path = `/api/weights/${encodePathSegment(userId)}/${date}`
  return apiFetch<WeightEntry>(path, { method: 'PUT', body, actingUserId })
}

export function deleteWeight(
  userId: string,
  date: string,
  actingUserId?: string,
): Promise<DeleteWeightResponse> {
  const path = `/api/weights/${encodePathSegment(userId)}/${date}`
  return apiFetch<DeleteWeightResponse>(path, { method: 'DELETE', actingUserId })
}

export function setWeightBaseline(
  userId: string,
  date: string,
  actingUserId?: string,
): Promise<WeightEntry> {
  const path = `/api/weights/${encodePathSegment(userId)}/${date}/baseline`
  return apiFetch<WeightEntry>(path, { method: 'POST', actingUserId })
}

// ---------------------------------------------------------------------------
// Stats — spec §8.5, §9
// ---------------------------------------------------------------------------

export function getLeaderboard(query: LeaderboardQuery): Promise<LeaderboardResponse> {
  return apiFetch<LeaderboardResponse>('/api/stats/leaderboard', {
    query: { period: query.period, month: query.month },
  })
}

export function getRuleStats(query: RuleStatsQuery): Promise<RuleStatsResponse> {
  return apiFetch<RuleStatsResponse>('/api/stats/rules', {
    query: { period: query.period, month: query.month },
  })
}

export function getRibbon(query: RibbonQuery): Promise<RibbonResponse> {
  return apiFetch<RibbonResponse>('/api/stats/ribbon', { query: { month: query.month } })
}

export function getWeightStats(): Promise<WeightStatsResponse> {
  return apiFetch<WeightStatsResponse>('/api/stats/weight')
}

// ---------------------------------------------------------------------------
// Users — spec §3.2, §7.1, §8.7, §9
// ---------------------------------------------------------------------------

export function listUsers(): Promise<User[]> {
  return apiFetch<User[]>('/api/users')
}

export function createUser(input: CreateUserRequest, actingUserId?: string): Promise<User> {
  return apiFetch<User>('/api/users', { method: 'POST', body: input, actingUserId })
}

export function updateUser(
  id: string,
  patch: UpdateUserRequest,
  actingUserId?: string,
): Promise<User> {
  const path = `/api/users/${encodePathSegment(id)}`
  return apiFetch<User>(path, { method: 'PATCH', body: patch, actingUserId })
}

// Spec §3.2: sets claimed_at. No request body — the userId in the path is the only input.
export function claimUser(id: string, actingUserId?: string): Promise<ClaimUserResponse> {
  const path = `/api/users/${encodePathSegment(id)}/claim`
  return apiFetch<ClaimUserResponse>(path, { method: 'POST', actingUserId })
}

// ---------------------------------------------------------------------------
// Rules — spec §4.3, §4.4, §9
// ---------------------------------------------------------------------------

export function listRules(): Promise<Rule[]> {
  return apiFetch<Rule[]>('/api/rules')
}

export function createRule(input: CreateRuleRequest, actingUserId?: string): Promise<Rule> {
  return apiFetch<Rule>('/api/rules', { method: 'POST', body: input, actingUserId })
}

export function updateRule(
  id: string,
  patch: UpdateRuleRequest,
  actingUserId?: string,
): Promise<Rule> {
  const path = `/api/rules/${encodePathSegment(id)}`
  return apiFetch<Rule>(path, { method: 'PATCH', body: patch, actingUserId })
}

// ---------------------------------------------------------------------------
// Config — spec §4.1, §8.7, §9
// ---------------------------------------------------------------------------

export function getConfig(): Promise<AppConfig> {
  return apiFetch<AppConfig>('/api/config')
}

export function updateConfig(
  patch: UpdateConfigRequest,
  actingUserId?: string,
): Promise<AppConfig> {
  return apiFetch<AppConfig>('/api/config', { method: 'PATCH', body: patch, actingUserId })
}

// ---------------------------------------------------------------------------
// Sync — spec §9, §10
// ---------------------------------------------------------------------------

export function syncBatch(
  request: SyncBatchRequest,
  actingUserId?: string,
): Promise<SyncBatchResponse> {
  return apiFetch<SyncBatchResponse>('/api/sync/batch', { method: 'POST', body: request, actingUserId })
}

// ---------------------------------------------------------------------------
// Admin — spec §4.3, §9
// ---------------------------------------------------------------------------

export function recompute(actingUserId?: string): Promise<RecomputeResponse> {
  return apiFetch<RecomputeResponse>('/api/admin/recompute', { method: 'POST', actingUserId })
}

// ---------------------------------------------------------------------------
// Export — spec §9
// ---------------------------------------------------------------------------

// A CSV download, not JSON — spec §8.7 wants this as a one-tap link, so the client owns just the
// path, not a fetch wrapper. Use directly as an `<a href>`, e.g. `<a href={EXPORT_CSV_PATH}>`.
export const EXPORT_CSV_PATH = '/api/export.csv'

// ---------------------------------------------------------------------------
// Health — spec §9
// ---------------------------------------------------------------------------

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/api/health')
}
