/**
 * Service worker registration — offline support.
 * Registers /sw.js at scope /, immediately if document is already loaded,
 * otherwise after the window load event.
 */

export function registerServiceWorker(): void {
  if (!navigator.serviceWorker) {
    return
  }

  function register() {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Swallow registration errors — failed SW must never break the app
    })
  }

  // If document is already loaded, register immediately
  if (document.readyState === 'complete') {
    register()
  } else {
    // Otherwise wait for the load event
    window.addEventListener('load', register)
  }
}
