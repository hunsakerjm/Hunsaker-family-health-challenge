# Phase 4A — PWA Shell

Track 4A delivers the installable app shell: icons, manifest, service worker, and platform integration for offline support.

## Completed

### 1. Icon generation: `scripts/generate-icons.py`
- Custom Python script using only standard library (`zlib`, `struct`) — no PIL dependency.
- Generates PNG binary format directly, avoiding architecture mismatch issues with user's PIL.
- Creates five icons:
  - `icon-192.png`, `icon-512.png` (standard, `purpose: any`, RGBA with transparency)
  - `icon-192-maskable.png`, `icon-512-maskable.png` (maskable, `purpose: maskable`, fully opaque RGB)
  - `apple-touch-icon-180.png` (iOS home-screen, fully opaque RGB, square corners)
- Design: dark ink (#16191C) rounded-square background with grass-green (#46A758) checkmark glyph.
- Standard icons: rounded-square background on transparent, glyph at normal scale.
- Maskable icons: full-bleed opaque background (entire canvas filled), glyph scaled to inner 80% safe zone.
- Apple icon: full-bleed opaque (iOS applies own mask), square corners, glyph at normal scale.
- All PNGs verified at correct pixel dimensions and opacity via `sips` (maskable and apple: `hasAlpha: no`).

### 2. Web manifest: `public/manifest.webmanifest`
- `name: "Family Health Challenge"`, `short_name: "Health"`
- `display: standalone`, `orientation: portrait`
- `start_url: /`, `scope: /`
- Theme colors: `#FFFFFF` (light), `#16191C` (ink)
- Icons: 192/512, both `purpose: any` and `purpose: maskable` entries per spec §10.

### 3. Service worker: `public/sw.js`
- Plain JavaScript, no build plugin, hand-written.
- **GET-only contract:** POST/PUT/PATCH/DELETE requests pass untouched (spec §10).
- Skips cross-origin and `/api/auth/*` requests entirely. Also skips `/api/export.csv` (never cached).
- Precaches app shell in two tiers:
  - Required: `/` and `/index.html` (install fails if either is missing)
  - Optional: manifest, icons, fonts (cached individually with per-URL error handling; non-fatal if missing)
- Cache writes tied to FetchEvent lifetime via `event.waitUntil()` to prevent premature SW termination.
- Runtime strategies:
  - `/api/**` (except `/api/export.csv`) → network-first, cache fallback (spec §10)
  - `/assets/**` and fonts → cache-first (content-hashed, immutable)
  - Navigation (/) → network-first, fallback to cached `/index.html` shell
- Single `CACHE_VERSION` constant; unused versions deleted on activate.
- Calls `skipWaiting()` and `clients.claim()` for immediate control.
- Comment blocks reserved for future push/notification handlers (spec §10).

### 4. Service worker registration: `src/lib/pwa/registerServiceWorker.ts`
- Exports `registerServiceWorker(): void`.
- Registers `/sw.js` at scope `/`, either immediately (if `document.readyState === 'complete'`) or on `load` event.
- Prevents missed registration if `load` has already fired before the function is called.
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
- Layout: normal flow element (not fixed), renders between scroll container and BottomNav per app layout.
- Design: matches app visual language (Card-like surface, SPACING/FONT_BODY tokens, shadow).
- Respects `env(safe-area-inset-left)` and `env(safe-area-inset-right)` for notches; BottomNav already owns bottom inset.
- Dismissal button (X icon, 16px lucide-react).
- **Integration needed:** Render in `src/App.tsx` between scroll container and BottomNav (orchestrator handles).

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

None — all PWA shell components complete. All six coordinator fixes applied:

1. InstallHint: removed fixed positioning, now flows normally between scroll and BottomNav ✓
2. Maskable icons: full-bleed opaque RGB background, glyph in 80% safe zone ✓
3. Apple touch icon: fully opaque RGB, square corners, 180x180 ✓
4. Service worker: cache writes tied to event lifetime via `event.waitUntil()` ✓
5. Service worker: split precache into required/optional with per-URL error handling ✓
6. Service worker: `/api/export.csv` excluded from caching; registration guards on `document.readyState` ✓

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

- Build: `npm run build` exit code **0** ✓
- Tests: `npm test` exit code **0** (152 tests pass) ✓
- Icons: All five PNGs present at correct dimensions (sips confirmed) ✓
  - Standard (`icon-192.png`, `icon-512.png`): `hasAlpha: yes` (RGBA) ✓
  - Maskable (`icon-192-maskable.png`, `icon-512-maskable.png`): `hasAlpha: no` (RGB) ✓
  - Apple (`apple-touch-icon-180.png`): `hasAlpha: no` (RGB) ✓
- Service worker: Plain JavaScript, no transpilation, event.waitUntil() wired, precache split ✓
- CSS: `-webkit-tap-highlight-color` and safe-area padding in place ✓
- InstallHint: Normal flow layout, respects left/right insets, removed fixed positioning ✓
- Manifest: Valid JSON, icons referenced, required fields present ✓
- CSP: Inline styles permitted, scripts restricted, auth and export.csv endpoints excluded ✓

## Notes

- The icon generator uses a pure-Python PNG implementation to avoid PIL architecture issues. It's readable and maintainable. PNG color types differ: standard icons are RGBA (type 6, has alpha), maskable and apple icons are RGB (type 2, no alpha).
- Service worker is intentionally simple: no queuing, no retry logic, no background sync (those are Track 4B's indexedDB queue). This layer just caches and fallbacks. Precache split into required/optional so a missing optional file (e.g., a renamed font) doesn't silently break offline support.
- Cache writes use `event.waitUntil()` to tie them to the FetchEvent lifetime, preventing the service worker from terminating mid-write.
- The install hint is a normal-flow element, not fixed, so it integrates cleanly with the flex-column app layout without overlaying BottomNav.
- All safe-area insets are applied to account for notches, home indicators, and dynamic island variants across iOS devices.
- Service worker registration guards on `document.readyState === 'complete'` to handle both early (preload) and late script injection.
