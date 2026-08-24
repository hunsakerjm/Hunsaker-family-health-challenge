import type { Env } from './_lib/env'

// SECURITY-CRITICAL: every Pages project also answers on a permanent
// <project>.pages.dev and a per-deployment <hash>.<project>.pages.dev.
// Those sit on Cloudflare's shared zone, outside the owner's zone-level WAF
// and rate-limiting rules, so this must reject anything not addressed to
// the canonical host — before any route, including /api/**. A bare 404,
// never a redirect, so a probe against the pages.dev host doesn't even
// learn the real hostname exists.
const DEFAULT_CANONICAL_HOST = 'hunsaker-family.com'
const LOCAL_DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1'])

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context
  const canonicalHost = (env.CANONICAL_HOST ?? DEFAULT_CANONICAL_HOST).toLowerCase()
  const requestHostname = extractHostname(request.headers.get('host'))

  const isCanonicalHost = requestHostname === canonicalHost
  const isLocalDevHost = LOCAL_DEV_HOSTNAMES.has(requestHostname)

  if (!isCanonicalHost && !isLocalDevHost) {
    return new Response(null, { status: 404 })
  }

  const response = await next()
  return withBaselineSecurityHeaders(response)
}

function extractHostname(hostHeader: string | null): string {
  if (!hostHeader) return ''
  return hostHeader.split(':')[0].toLowerCase()
}

// Non-functional baseline from spec §12. CSP is deliberately deferred — see
// Docs/DECISIONS.md — until Phase 0's design system settles whether dynamic
// per-user colors need inline style attributes, so a strict `default-src
// 'self'` here doesn't silently break Phase 2/3 work later.
function withBaselineSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Robots-Tag', 'noindex')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
