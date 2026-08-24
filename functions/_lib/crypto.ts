// WebCrypto primitives for the password gate (spec §3.1). Kept dependency
// free — Workers ship WebCrypto natively, no need for nodejs_compat.

// Cloudflare Workers caps PBKDF2 at 100k iterations; spec §3.1 mandates
// 600k, but Workers throws NotSupportedError if exceeded. Approved platform ceiling.
export const PBKDF2_ITERATIONS = 100_000
const SALT_BYTES = 16
const HASH_BITS = 256

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToBytes(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (padded.length % 4)) % 4
  return base64ToBytes(padded + '='.repeat(padLength))
}

export function generateSaltBase64(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  return bytesToBase64(salt)
}

export async function derivePbkdf2HashBase64(password: string, saltBase64: string): Promise<string> {
  const salt = base64ToBytes(saltBase64)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    HASH_BITS,
  )
  return bytesToBase64(new Uint8Array(derivedBits))
}

// Runs a full-length comparison regardless of where bytes first differ, and
// regardless of length mismatch, so neither the password check nor the
// session-signature check leaks timing information.
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  const maxLength = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < maxLength; i++) {
    diff |= (i < a.length ? a[i] : 0) ^ (i < b.length ? b[i] : 0)
  }
  return diff === 0
}

export function timingSafeEqualBase64(a: string, b: string): boolean {
  return timingSafeEqualBytes(base64ToBytes(a), base64ToBytes(b))
}

export function timingSafeEqualBase64Url(a: string, b: string): boolean {
  return timingSafeEqualBytes(base64UrlToBytes(a), base64UrlToBytes(b))
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

export async function signHmacBase64Url(secret: string, data: string): Promise<string> {
  const key = await importHmacKey(secret)
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return bytesToBase64Url(new Uint8Array(signatureBytes))
}
