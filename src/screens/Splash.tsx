// Deliberately bare. Later phases (2+) own the real Today screen, identity
// picker, and standings — this is only the "you're past the gate" proof.
const CHALLENGE_TITLE = 'Family Health Challenge'

export function SplashScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-neutral-100 px-6 text-center">
      <h1 className="text-2xl font-bold text-neutral-900">{CHALLENGE_TITLE}</h1>
      <p className="text-base text-neutral-600">Coming soon.</p>
    </div>
  )
}
