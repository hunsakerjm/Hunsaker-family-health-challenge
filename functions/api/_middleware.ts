import type { Env } from '../_lib/env'
import { readSessionTokenFromCookie, verifySessionToken } from '../_lib/session'
import { getSessionVersion } from '../_lib/config'

// Spec §3.1: every /api/** route except /api/auth/login and /api/health
// requires a valid session. Centralized here so every future route group
// (logs, weights, stats, users, rules, ...) inherits the gate for free.
const PUBLIC_API_PATHS = new Set(['/api/auth/login', '/api/health'])

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context
  const url = new URL(request.url)

  if (PUBLIC_API_PATHS.has(url.pathname)) {
    return next()
  }

  if (!env.SESSION_SECRET) {
    return unauthorizedResponse()
  }

  const token = readSessionTokenFromCookie(request.headers.get('cookie'))
  if (!token) {
    return unauthorizedResponse()
  }

  const sessionVersion = await getSessionVersion(env.DB)
  const isValidSession = await verifySessionToken(env.SESSION_SECRET, token, sessionVersion)
  if (!isValidSession) {
    return unauthorizedResponse()
  }

  return next()
}

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: { code: 401, message: 'Unauthorized.' } }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
}
