/**
 * Service worker registration — offline support.
 * Registers /sw.js at scope / after window load.
 */

export function registerServiceWorker(): void {
  if (!navigator.serviceWorker) {
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Swallow registration errors — failed SW must never break the app
    })
  })
}
