# Phase 4A — PWA Shell

Track 4A delivers the installable app shell: icons, manifest, service worker, and platform integration for offline support.

## Completed

### 1. Icon generation: `scripts/generate-icons.py`
- Custom Python script using only standard library (`zlib`, `struct`) — no PIL dependency.
- Generates PNG binary format directly, avoiding architecture mismatch issues with user's PIL.
- Creates five icons:
  - `icon-192.png`, `icon-512.png` (standard, `purpose: any`)
  - `icon-192-maskable.png`, `icon-512-maskable.png` (safe-zone content, `purpose: maskable`)
  - `apple-touch-icon-180.png` (iOS home-screen icon)
- Design: dark ink (#16191C) rounded-square background with grass-green (#46A758) checkmark glyph.
- Maskable icons constrain content to inner 80% safe zone; standard icons use full space for visual pop.
- All PNGs verified at correct pixel dimensions via PNG header read.

### 2. Web manifest: `public/manifest.webmanifest`
- `name: "Family Health Challenge"`, `short_name: "Health"`
- `display: standalone`, `orientation: portrait`
- `start_url: /`, `scope: /`
- Theme colors: `#FFFFFF` (light), `#16191C` (ink)
- Icons: 192/512, both `purpose: any` and `purpose: maskable` entries per spec §10.

### 3. Service worker: `public/sw.js`
- Plain JavaScript, no build plugin, hand-written.
- **GET-only contract:** POST/PUT/PATCH/DELETE requests pass untouched (spec §10).
- Skips cross-origin and `/api/auth/*` requests entirely.
- Precaches app shell: `/`, `/index.html`, `/manifest.webmanifest`, five icons, eight fonts.
- Runtime strategies:
  - `/api/**` → network-first, cache fallback (spec §10: "standings render something offline")
  - `/assets/**` and fonts → cache-first (content-hashed, immutable)
  - Navigation (/) → network-first, fallback to cached `/index.html` shell
- Single `CACHE_VERSION` constant; unused versions deleted on activate.
- Calls `skipWaiting()` and `clients.claim()` for immediate control.
- Comment blocks reserved for future push/notification handlers (spec §10).

### 4. Service worker registration: `src/lib/pwa/registerServiceWorker.ts`
- Exports `registerServiceWorker(): void`.
- Registers `/sw.js` at scope `/` after window `load` event.
- No-ops if `navigator.serviceWorker` absent.
- Swallows registration errors; failed SW never breaks the app.
- **Integration needed:** Import and call in `src/main.tsx` (orchestrator handles).

### 5. Install hint: `src/components/InstallHint.tsx`
- Export: `InstallHint(props): JSX.Element | null`
- Dismissible "Add to Home Screen" banner, iOS Safari only.
- Visibility rules:
  - Hidden if `display-mode: standalone` or `navigator.standalone`
  - Hidden on non-iOS-Safari (user-agent detection for iPad/iPhone/iPod, excluding Chrome/Firefox/Opera)
  - Hidden if dismissed (persisted in `localStorage` under `health-challenge-install-hint-dismissed`)
- Design: matches app visual language (Card-like surface, SPACING/FONT_BODY tokens, shadow).
- Respects `env(safe-area-inset-bottom)` so never hides under home indicator.
- Dismissal button (X icon, 16px lucide-react).
- **Integration needed:** Render in `src/App.tsx` (orchestrator handles).

### 6. HTML updates: `index.html`
- Added: `<link rel="manifest">` → `/manifest.webmanifest`
- Added: `<link rel="apple-touch-icon">` → `/icons/apple-touch-icon-180.png`
- Added: `<meta name="theme-color">` with light/dark media queries (`#FFFFFF` light, `#16191C` dark)
- Added: `<meta name="apple-mobile-web-app-capable" content="yes">`
- Kept existing `viewport-fit=cover` and viewport settings.
- No `user-scalable=no` or `maximum-scale` (spec §10 forbids them).

### 7. CSS updates: `src/index.css`
- Added: `-webkit-tap-highlight-color: transparent` on `html` (iOS Safari tap feedback).
- Added: `env(safe-area-inset-*)` padding on `body` for left/right insets (notches, home indicator).
- Fonts and Tailwind import unchanged.

### 8. CSP headers: `functions/_middleware.ts`
- Added Content-Security-Policy header per spec §12.
- Base: `default-src 'self'`
- Full directive set: `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`, `font-src 'self'`, `connect-src 'self'`, `worker-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`.
- **Style-src rationale:** Grep found 283 inline `style={{...}}` attributes throughout the app (dynamic per-user color ramps). This is essential to the design system; `'unsafe-inline'` for styles is correct. No inline scripts exist; `script-src` stays `'self'` only.
- Updated stale comment about deferred CSP.

### 9. Decisions log: `Docs/DECISIONS.md`
- Added entry documenting CSP directive set, style-src requirement (283 inline styles found), and rationale.
- Marks Phase 4A CSP as RESOLVED.

## Remaining

None — all PWA shell components complete.

## Integration requirements (for orchestrator)

### In `src/main.tsx`:
Add before root render:
```typescript
import { registerServiceWorker } from './lib/pwa/registerServiceWorker'

registerServiceWorker()
```

### In `src/App.tsx`:
Add `InstallHint` component to app root layout (e.g., after the main content, inside theme provider):
```typescript
import { InstallHint } from './components/InstallHint'

// Inside App's JSX, after main content/routes:
<InstallHint theme={theme} />
```

## Verification

- Build: `npm run build` exits 0 ✓
- Icons: All five PNGs present at correct dimensions ✓
- Service worker: Plain JavaScript, no transpilation needed ✓
- CSS: `-webkit-tap-highlight-color` and safe-area padding in place ✓
- Manifest: Valid JSON, icons referenced, required fields present ✓
- CSP: Inline styles permitted, scripts restricted, auth endpoints excluded ✓

## Notes

- The icon generator uses a pure-Python PNG implementation to avoid PIL architecture issues. It's readable and maintainable.
- Service worker is intentionally simple: no queuing, no retry logic, no background sync (those are Track 4B's indexedDB queue). This layer just caches and fallbacks.
- The install hint uses localStorage for dismissal; if unavailable (private mode), the hint will reappear on reload—acceptable fallback for occasional users.
- All safe-area insets are applied to account for notches, home indicators, and dynamic island variants across iOS devices.
