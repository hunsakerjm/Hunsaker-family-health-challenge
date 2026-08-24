// HMAC-signed session cookie per spec §3.1. Payload {iat, exp, v} — `v` is
// checked against app_config.session_version by the caller so bumping that
// config value signs every device out at once.
import {
  base64UrlToBytes,
  bytesToBase64Url,
  signHmacBase64Url,
  timingSafeEqualBase64Url,
} from './crypto'

const SESSION_COOKIE_NAME = 'fhc_session'
const SESSION_MAX_AGE_SECONDS = 15_552_000 // 180 days, spec §3.1

export interface SessionPayload {
  iat: number
  exp: number
  v: number
}

export async function createSessionCookie(secret: string, sessionVersion: number): Promise<string> {
  const issuedAtSeconds = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = {
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + SESSION_MAX_AGE_SECONDS,
    v: sessionVersion,
  }
  const token = await signSessionToken(secret, payload)
  return buildCookieHeader(token, SESSION_MAX_AGE_SECONDS)
}

export function clearSessionCookieHeader(): string {
  return buildCookieHeader('', 0)
}

export async function verifySessionToken(
  secret: string,
  token: string,
  expectedVersion: number,
): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 2) return false

  const [payloadBase64Url, signature] = parts
  const expectedSignature = await signHmacBase64Url(secret, payloadBase64Url)
  if (!timingSafeEqualBase64Url(signature, expectedSignature)) return false

  const payload = parseSessionPayload(payloadBase64Url)
  if (!payload) return false

  const nowSeconds = Math.floor(Date.now() / 1000)
  const isExpired = payload.exp < nowSeconds
  const isWrongVersion = payload.v !== expectedVersion
  return !isExpired && !isWrongVersion
}

export function readSessionTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  const cookies = cookieHeader.split(';').map((part) => part.trim())
  const sessionCookie = cookies.find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
  return sessionCookie ? sessionCookie.slice(SESSION_COOKIE_NAME.length + 1) : null
}

async function signSessionToken(secret: string, payload: SessionPayload): Promise<string> {
  const payloadBase64Url = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await signHmacBase64Url(secret, payloadBase64Url)
  return `${payloadBase64Url}.${signature}`
}

function parseSessionPayload(payloadBase64Url: string): SessionPayload | null {
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(payloadBase64Url))
    const parsed = JSON.parse(json) as Partial<SessionPayload>
    const hasExpectedShape =
      typeof parsed.iat === 'number' && typeof parsed.exp === 'number' && typeof parsed.v === 'number'
    return hasExpectedShape ? (parsed as SessionPayload) : null
  } catch {
    return null
  }
}

function buildCookieHeader(token: string, maxAgeSeconds: number): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ]
  return attributes.join('; ')
}
