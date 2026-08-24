/**
 * Service Worker — offline support and app shell caching.
 *
 * Contract (spec §10):
 * - GET requests only — all non-GET requests bypass the service worker untouched.
 * - App shell (precached): /, /index.html, /manifest.webmanifest, icons, fonts.
 * - /api/** — network-first with cache fallback.
 * - /assets/** and static files — cache-first (content-hashed, immutable).
 * - Navigation requests — network-first, fallback to cached /index.html.
 * - Cross-origin and /api/auth/* requests — never cached, never intercepted.
 *
 * Do not intercept POST/PUT/PATCH/DELETE. Offline writes are handled by
 * in-page IndexedDB queue and Track 4B's sync endpoint (spec §10).
 */

const CACHE_VERSION = 'v1'
const CACHE_NAME = `health-challenge-${CACHE_VERSION}`

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon-180.png',
  '/fonts/bricolage-grotesque-variable.woff2',
  '/fonts/public-sans-400.woff2',
  '/fonts/public-sans-500.woff2',
  '/fonts/public-sans-600.woff2',
  '/fonts/public-sans-700.woff2',
  '/fonts/ibm-plex-mono-400.woff2',
  '/fonts/ibm-plex-mono-500.woff2',
  '/fonts/ibm-plex-mono-600.woff2',
]

// === Installation: precache app shell ===
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).then(() => {
        self.skipWaiting()
      })
    })
  )
})

// === Activation: clean up old caches ===
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      ).then(() => {
        self.clients.claim()
      })
    })
  )
})

// === Fetch: handle requests ===
self.addEventListener('fetch', (event) => {
  const { request } = event
  const { method, url } = request

  // Only intercept GET requests
  if (method !== 'GET') {
    return
  }

  // Skip cross-origin requests
  if (!url.startsWith(self.location.origin)) {
    return
  }

  // Skip auth endpoints — never cache, never retry
  if (url.includes('/api/auth/')) {
    return
  }

  const urlObj = new URL(url)

  // Determine strategy based on request type
  if (urlObj.pathname.startsWith('/api/')) {
    // API endpoints — network-first with cache fallback
    event.respondWith(networkFirstStrategy(request))
  } else if (
    urlObj.pathname.startsWith('/assets/') ||
    urlObj.pathname.match(/\.(woff2|woff|ttf|otf)$/)
  ) {
    // Static/hashed assets and fonts — cache-first
    event.respondWith(cacheFirstStrategy(request))
  } else {
    // Navigation requests (/) — network-first, fallback to shell
    event.respondWith(navigationStrategy(request))
  }
})

/**
 * Network-first strategy: try network, fall back to cache.
 * Used for /api/** to render something offline when possible.
 */
function networkFirstStrategy(request) {
  return fetch(request).then((response) => {
    // Only cache successful responses
    if (response.ok) {
      const clone = response.clone()
      caches.open(CACHE_NAME).then((cache) => {
        cache.put(request, clone)
      })
    }
    return response
  }).catch(() => {
    // Network failed, try cache
    return caches.match(request).then((response) => {
      return response || new Response('Offline', { status: 503 })
    })
  })
}

/**
 * Cache-first strategy: use cached version if available, network as fallback.
 * Used for hashed assets (immutable by definition).
 */
function cacheFirstStrategy(request) {
  return caches.match(request).then((response) => {
    if (response) {
      return response
    }
    return fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clone)
        })
      }
      return response
    }).catch(() => {
      return new Response('Not found (offline)', { status: 404 })
    })
  })
}

/**
 * Navigation strategy: network-first for SPA, fallback to shell.
 * Ensures the app shell (/) always loads, even offline.
 */
function navigationStrategy(request) {
  return fetch(request).then((response) => {
    if (response.ok) {
      const clone = response.clone()
      caches.open(CACHE_NAME).then((cache) => {
        cache.put(request, clone)
      })
    }
    return response
  }).catch(() => {
    // Network failed, serve the app shell
    return caches.match('/index.html').then((response) => {
      return response || caches.match('/').then((shellResp) => {
        return shellResp || new Response('Offline', { status: 503 })
      })
    })
  })
}

// === Future hooks (not implemented, but space reserved) ===
// self.addEventListener('push', (event) => { ... })
// self.addEventListener('notificationclick', (event) => { ... })
