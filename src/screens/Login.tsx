import { useState } from 'react'
import type { FormEvent } from 'react'

// Provisional copy and styling — Phase 0 owns the real design system
// (src/theme.ts, src/components/). This screen exists only to prove the
// gate works end to end.
const CHALLENGE_TITLE = 'Family Health Challenge'
const GENERIC_ERROR_MESSAGE = 'Incorrect password.'
const RATE_LIMITED_MESSAGE = 'Too many attempts. Try again in a few minutes.'
const UNEXPECTED_ERROR_MESSAGE = 'Something went wrong. Try again.'
const TOO_MANY_REQUESTS_STATUS = 429

interface LoginScreenProps {
  onLoginSuccess: () => void
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      })

      if (response.ok) {
        onLoginSuccess()
        return
      }

      // Status code is the only signal that distinguishes "rate limited"
      // from "wrong password" — spec §3.1/§8.1. No other detail leaks.
      setErrorMessage(messageForFailedResponse(response.status))
    } catch {
      setErrorMessage(UNEXPECTED_ERROR_MESSAGE)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-neutral-100 px-6">
      <h1 className="text-2xl font-bold text-neutral-900">{CHALLENGE_TITLE}</h1>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Family password"
          className="h-14 w-full rounded-2xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 outline-none focus:border-neutral-500"
        />
        {errorMessage && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-14 w-full rounded-2xl bg-neutral-900 text-base font-semibold text-white disabled:opacity-60"
        >
          {isSubmitting ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  )
}

function messageForFailedResponse(status: number): string {
  return status === TOO_MANY_REQUESTS_STATUS ? RATE_LIMITED_MESSAGE : GENERIC_ERROR_MESSAGE
}
