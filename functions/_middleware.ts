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

// Non-functional requirements from spec §12 — security headers and CSP.
// CSP tracks Phase 4A PWA shell. The design system uses 283 inline style
// attributes throughout (verified via grep) to dynamically apply per-user
// colors at runtime, so style-src requires 'unsafe-inline'. No inline scripts
// are used; script-src stays 'self' only. (See Docs/DECISIONS.md Phase 4A entry.)
function withBaselineSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Robots-Tag', 'noindex')
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  )
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
