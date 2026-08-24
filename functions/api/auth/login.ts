import type { Env } from '../../_lib/env'
import { derivePbkdf2HashBase64, timingSafeEqualBase64 } from '../../_lib/crypto'
import { createSessionCookie } from '../../_lib/session'
import { getOrBootstrapPasswordRecord } from '../../_lib/passwordBootstrap'
import { isRateLimited, recordLoginAttempt } from '../../_lib/rateLimit'
import { getSessionVersion } from '../../_lib/config'

const RATE_LIMIT_MESSAGE = 'Too many attempts. Try again later.'
const INVALID_PASSWORD_MESSAGE = 'Invalid password.'
const SERVER_ERROR_MESSAGE = 'Something went wrong. Try again later.'
const CLIENT_IP_HEADER = 'CF-Connecting-IP'
const UNKNOWN_IP_FALLBACK = 'unknown'
const TOO_MANY_REQUESTS_STATUS = 429
const BAD_REQUEST_STATUS = 400
const UNAUTHORIZED_STATUS = 401
const SERVER_ERROR_STATUS = 500

interface LoginRequestBody {
  password?: unknown
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const clientIp = request.headers.get(CLIENT_IP_HEADER) ?? UNKNOWN_IP_FALLBACK

  if (await isRateLimited(env.DB, clientIp)) {
    return jsonError(TOO_MANY_REQUESTS_STATUS, RATE_LIMIT_MESSAGE)
  }

  const submittedPassword = await readSubmittedPassword(request)
  if (submittedPassword === null) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_PASSWORD_MESSAGE)
  }

  // Count this as a consumed attempt whether it ultimately succeeds or
  // fails — the 15-minute window is about total attempts against the gate.
  await recordLoginAttempt(env.DB, clientIp)

  if (!env.SESSION_SECRET) {
    return jsonError(SERVER_ERROR_STATUS, SERVER_ERROR_MESSAGE)
  }

  const passwordRecord = await getOrBootstrapPasswordRecord(env)
  if (!passwordRecord) {
    // No stored hash and no INITIAL_FAMILY_PASSWORD secret to bootstrap
    // from — fail safe rather than let anything through.
    return jsonError(SERVER_ERROR_STATUS, SERVER_ERROR_MESSAGE)
  }

  const submittedHash = await derivePbkdf2HashBase64(submittedPassword, passwordRecord.salt)
  const isValidPassword = timingSafeEqualBase64(submittedHash, passwordRecord.hash)
  if (!isValidPassword) {
    return jsonError(UNAUTHORIZED_STATUS, INVALID_PASSWORD_MESSAGE)
  }

  const sessionVersion = await getSessionVersion(env.DB)
  const cookieHeader = await createSessionCookie(env.SESSION_SECRET, sessionVersion)

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': cookieHeader,
    },
  })
}

async function readSubmittedPassword(request: Request): Promise<string | null> {
  try {
    const body = (await request.json()) as LoginRequestBody
    return typeof body.password === 'string' && body.password.length > 0 ? body.password : null
  } catch {
    return null
  }
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { code: status, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
