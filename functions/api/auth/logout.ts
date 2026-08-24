import type { Env } from '../../_lib/env'
import { clearSessionCookieHeader } from '../../_lib/session'

export const onRequestPost: PagesFunction<Env> = async () => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': clearSessionCookieHeader(),
    },
  })
}
