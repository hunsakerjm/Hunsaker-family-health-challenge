import type { Env } from '../_lib/env'

// Unauthenticated liveness check (spec §9). Must not leak version info,
// config, or anything about the database — the body is a fixed constant,
// never derived from a query.
export const onRequestGet: PagesFunction<Env> = async () => {
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
