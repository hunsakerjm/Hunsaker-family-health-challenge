// Tiny JSON response helpers shared by Phase 2a's new routes. Matches the `{error:{code,message}}`
// shape spec §9 requires and `src/types.ts`'s `ApiErrorBody` already documents — existing routes
// (`auth/login.ts`) predate this file and keep their own inline copy rather than being touched
// here, but every new route in this phase uses this one.
export function jsonResponse<T>(
  body: T,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  })
}

export function jsonError(status: number, message: string): Response {
  return jsonResponse({ error: { code: status, message } }, status)
}
