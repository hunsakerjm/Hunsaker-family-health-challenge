# Family Health Challenge PWA — Requirements & Build Spec

**Version:** 1.3 — audited, self-contained, ready to execute
**Author:** Josh
**Intended reader:** an implementation agent (Claude Code or equivalent) building this end to end
**Challenge window:** 2026-09-01 → 2027-02-28 (181 days), both dates editable in Settings

**Changes from v1.1 — all scope reductions except one addition:** the scoring model is settled as a
simple sum and is no longer an open question · the prizes table is removed; prize amounts are two
display-only config values · streak calculation is out of scope in-app and moves to offline analysis of
the CSV export, which is now a hard requirement rather than a convenience · **added** a celebration system
(§11.2) that escalates with each item logged within a day, topping out in fireworks at full points,
with a device-level Full/Subtle/Off control · **added** §7.1 identity editor, palette expanded from 12
to 16 colors, the cumulative line chart cut, and the category bars replaced by a per-rule completion
radar (§8.5) — all three validated against the accompanying mockup · **added** §11.1, a complete design
token spec (surfaces, tint ramp, type scale, radius, spacing, motion) replacing the four loose hex
values that were there before, and correcting a dark-mode value that contradicted the mockup.

**Changes from v1.2:** a full consistency audit — §11's subsections were reordered so tokens precede
the celebration system; the §7 tint ramp was corrected to mix against `surface` rather than `paper`;
the Today wireframe's row height and nav were aligned to the token table; banner height and
desaturation now reference §11.1 instead of inventing numbers; `/api/stats/series` and the
category-grouped breakdown endpoint were removed as dead after the line chart and stacked bars were
cut; `/api/logs/batch` became `/api/sync/batch` covering weights too; a server rule was added
requiring every aggregate to respect `active_from`/`active_to`; and §14 was rebuilt into six
agent-sized phases with explicit parallel tracks. §0 now opens with the four things an agent must
ask the owner before starting, and Appendix B adds full environment setup, so this document can be
handed to an implementer on its own.

**Scope discipline:** this spec is deliberately smaller than what the app *could* do. Do not add
features that seem like natural extensions — bonus scoring, streak awards, prize automation, reminders,
per-user auth. Every one of those was considered and cut on purpose.

---

## 0. How to use this document

This is a build spec, not a wishlist. Sections 1–13 are requirements. Section 14 is the phased build
order. Section 15 is the acceptance checklist you must be able to demo against before calling it done.
**Appendix B is environment setup — read it before running any command.**

**If you are orchestrating agents, start at §14.** Each phase there names its dependencies, its
deliverable, and the specific sections that phase's agent needs — so sub-agents can be handed a slice
of this document rather than all of it.

### What's in this handoff

| File | Status |
|---|---|
| This document | **Required.** Self-contained; everything needed to build is here. |
| `HealthChallengeMockup.jsx` | *Recommended.* An approved, running visual mockup. Not required — §11.1 carries the full token set — but if you have it, read its header comment and match it. |

### Before you write code, get four things from the owner

These are the only genuine unknowns. Ask for all four in one message, then proceed.

1. **The hostname.** Which domain in their Cloudflare account, and which subdomain. The spec uses
   `challenge.example.com` as a placeholder throughout.
2. **The shared family password**, or permission to generate one and hand it back.
3. **Where the repo lives** — a new GitHub repo, an existing one, or local only.
4. **Confirmation of the start date** — §13 proposes 2026-09-01. It is editable later without a deploy,
   but Phase 1's seed writes it.

**Do not ask about anything in §13.** Those fourteen questions are answered and closed. Do not ask
whether to add streaks, bonus scoring, reminders, or prize tracking — all four were considered and cut
on purpose (see the scope note at the top).

### Resolving ambiguity

1. This document wins over the earlier spreadsheet handoff, over the mockup on questions of
   **behavior**, and over your own instincts about what a habit tracker usually does.
2. The mockup wins over this document on questions of **visual detail**.
3. If neither answers it and the choice is reversible, pick the simpler option, write down what you
   picked, and keep going. Do not stall.
4. If neither answers it and the choice is expensive to reverse — a schema shape, an auth decision —
   stop and ask.

### Working in parallel

One branch per phase or track, named `phase-0-design`, `phase-3b-standings`, and so on. Merge to `main`
only when that phase's demo passes. Phase 1 publishes the shared contract described in §14 before any
Phase 3 track opens; tracks import from it and never from each other.

Where this conflicts with the earlier spreadsheet handoff, this document wins.

---

## 1. What this is

A shared, installable web app replacing a Google Sheet. Eight-ish family members each log a handful of
daily health habits with checkboxes. Points accumulate. There's a monthly cash prize for most points
and a one-time prize at the end for greatest percentage of body weight lost.

**The whole product succeeds or fails on one thing: daily logging has to take under ten seconds on a
phone.** Everything else — dashboards, charts, calendars — is secondary. If a design choice makes the
dashboard prettier but adds a tap to logging, choose logging.

### Scoring rules at launch (6 points/day)

| Key | Label | Points | Category |
|---|---|---|---|
| `water` | Water over 80 oz | 1 | Hydration |
| `sleep` | Slept 7+ hours | 1 | Sleep |
| `diet` | Stuck to my diet | 1 | Nutrition |
| `stretch` | Stretched 10+ minutes | 1 | Mobility |
| `exercise_1` | Exercise block 1 (20+ min) | 1 | Movement |
| `exercise_2` | Exercise block 2 (20+ min) | 1 | Movement |

Two separate exercise checkboxes rather than a 0–2 counter — every control on the logging page is the
same shape.

**Six is the launch value, not a constant.** The daily maximum is always derived from the rules in
effect on a given date (§4.3). Nothing in the codebase may hardcode 6, 181, or 1,086.

### Prizes at launch

- **$25/month** to whoever has the most points in that calendar month. Six payouts.
- **$50 once**, at the end, to the greatest percentage of starting body weight lost.
- Points participation and weight participation are independent opt-in flags.

Prizes are **display text only**. The app surfaces the amounts next to the leaderboard and weight table
and does nothing else with them — no payout tracking, no winner history, no prize records. Two config
values, `prize_monthly` and `prize_final`, editable in Settings. Anything more sophisticated is a
future code change, deliberately deferred.

---

## 2. Stack and infrastructure

Non-negotiable: Cloudflare, on a domain the owner controls, not gated behind a Cloudflare account login.

| Layer | Choice |
|---|---|
| Hosting | Cloudflare Pages |
| API | Pages Functions (`/functions/api/**`) — same project, one deploy, no separate Worker |
| Database | Cloudflare D1 (SQLite) |
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Celebration animations | `canvas-confetti` (§11.2) |
| Local cache / offline queue | IndexedDB via `idb` |
| Migrations | Plain `.sql` files in `/migrations`, applied with `wrangler d1 migrations apply` |

**Do not** use Cloudflare Access, Zero Trust, or any Cloudflare identity product for auth. Family
members must not need Cloudflare accounts. Auth is application-level (§3).

### Domain and DNS

Deploy to a subdomain of a domain already in the owner's Cloudflare account (e.g.
`challenge.example.com`) via Pages → Custom domains. This creates a proxied CNAME and does not touch
MX, TXT, or any existing records. **Do not modify or delete existing DNS records.** Confirm the exact
hostname with the owner before configuring.

### Environments

- `preview` — Pages preview deployments, bound to D1 database `health-challenge-preview`
- `production` — bound to `health-challenge`

Seed data must never be auto-inserted into production after the first migration.

---

## 3. Auth and identity

Two separate concepts. Conflating them is the main way this build goes wrong.

### 3.1 Gate: one shared family password

The password proves "someone here is family." That is all it does. It does not identify anyone — the
cookie is byte-identical on every device.

- Stored as **PBKDF2-SHA256** (600k iterations, 16-byte random salt) in `app_config`. Use WebCrypto.
  Never store plaintext.
- Seeded on first migration from secret `INITIAL_FAMILY_PASSWORD`. Changeable from Settings without a
  redeploy.
- On success, issue a session cookie:
  - HMAC-SHA256 signed token (secret `SESSION_SECRET`), payload `{iat, exp, v}`
  - `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=15552000` — 180 days, nobody re-auths mid-challenge
  - `v` is checked against `app_config.session_version`. Bumping it in Settings signs out every device.
- **Rate limit login:** 10 attempts per IP per 15 minutes via KV or a D1 table. Return 429 with a
  generic message.
- Every `/api/**` route except `/api/auth/login` and `/api/health` requires a valid session. Return 401
  and let the client redirect to the gate.

### 3.2 Identity: which person this device belongs to

After the gate, first run shows **"Who's using this device?"** — a grid of person cards.

- All family members are created in Settings ahead of launch, so the picker shows real names from day
  one. There are no placeholder rows to clean up.
- Cards render in two states:
  - **Unclaimed** — full color, prominent, sorted first. These are the people who haven't set up a
    device yet.
  - **Claimed** — dimmed, with a small caption reading `Set up on another device`. Still tappable;
    tapping asks for confirmation. This covers a new phone, an iPad, or a genuine mistake.
- Tapping writes `activeUserId` to that device's `localStorage` and sets `users.claimed_at` server-side
  so other devices see the updated state. It is a **soft signal, not a lock** — the server never uses
  it for authorization.
- Changing later: Settings → "Switch person," or long-press the header avatar.

### 3.3 What lives where

| | Cloud (D1) | Device (localStorage / IndexedDB) |
|---|---|---|
| Every person's log entries, weights, rules, config | ✅ | — |
| Which person this device claims to be | — | ✅ |
| Celebration/animation level (§11.2) | — | ✅ |
| Writes queued while offline | — | ✅ (flushed and cleared on reconnect) |

Consequence: clearing Safari data or getting a new phone costs a password entry and one tap. All
history is intact, because none of it was ever stored locally as the source of truth.

### 3.4 Making "whose page is this" unmistakable

Everyone can read everything, live. Writes are soft-locked to the device's own person.

**Your own log:**
- Full-bleed banner across the top in **your claimed color**, edge to edge, ≈110px including the
  day-navigation row
- `Wednesday, Sep 9` / `Your log`, with avatar, name, and running day total
- Checkboxes live, large, tappable; haptic feedback where supported (`navigator.vibrate(10)`)

**Someone else's log:**
- Same banner, desaturated via `desat()` (§11.1), with a 45° repeating-stripe overlay
- Reads `Viewing Marie's log` with a small lock glyph
- **All controls read-only by default** — rendered as static filled/empty marks, not inputs
- One button: `Log for Marie`. Tapping opens a confirm sheet — *"You're about to change Marie's log,
  not yours. This device is set up as Josh."* — after which the page is editable **for that day only**,
  with a persistent amber bar reading `Editing as Marie — not your log`
- Any write this way is recorded in `audit_log` with the acting user

This is deliberately a speed bump, not a wall. A kid logging on a parent's phone is a supported flow.

Never rely on color alone. Always pair it with the text label and the stripe texture.

---

## 4. Config over code — the governing principle

The owner's stated intent: **the family should be able to change how the challenge works, from inside
the app, for six months, without a developer.** Build toward that, and be honest in the UI about the
boundary.

### 4.1 Editable at runtime, by anyone with the password

Rules (add, edit, reorder, disable, set effective dates) · people (add, rename, recolor, re-emoji,
archive, toggle either participation flag) · weights · challenge start and end dates · timezone ·
prize amount text · challenge title · the shared password.

No admin tier. Destructive actions confirm and state their blast radius. Nothing hard-deletes log data.

### 4.2 Still requires a deploy — say so plainly

- **New rule *types*** beyond `boolean`, `counter`, and `threshold` (a timer, a photo upload, a
  free-text note)
- **New chart types** on the dashboard
- **The scoring model.** Settled and closed: **day total = sum of each rule's awarded points.** Streak
  bonuses, multipliers, weekly caps, and "best 5 days of 7" are explicitly out of scope. Do not build
  an abstraction to accommodate them. If the family wants one later, it's a code change, accepted.
- Streak and consistency *awards* — computed offline from the export (§9), not in the app
- Prize payout tracking, winner history, or automated prize assignment
- Auth model, multiple concurrent challenges, per-user permissions

### 4.3 Rules as data

- Rules live in the `rules` table. The logging screen renders whatever enabled rules the API returns
  for that date, in `sort_order`. Adding one takes effect on every person's page immediately.
- Types (implement all three; launch uses `boolean` only):
  - `boolean` — checkbox. `value` ∈ {0,1}. Points = `points` if 1.
  - `counter` — stepper, 0..`config.max`. Points = `value × points`.
  - `threshold` — numeric input with a unit. `config: {unit, threshold, compare}`, compare ∈
    {`gte`,`lte`}. Points = `points` if the comparison holds.
- `effective_from` / `effective_to` (nullable `YYYY-MM-DD`) scope a rule to part of the challenge. **A
  given date only offers the rules effective on that date.**
- **`maxPointsForDate(date)`** is a first-class server function: the sum of maximum achievable points
  across rules effective that date. Every "out of N" label, every calendar pip meter denominator, and
  every completion-percentage calculation calls it. Nothing assumes 6.
- **Points are snapshotted at write time** into `log_entries.points`. Changing a rule's value in
  November does not silently rewrite October. An explicit `POST /api/admin/recompute` re-derives
  history from current rules when that's actually wanted.

### 4.4 Adding a rule mid-challenge — fairness handling

Forward-dated rules are fair: everyone gets the same opportunity from the same date. Backdated rules
are not, because backfill is unlimited — whoever notices first fills in three weeks of a new checkbox
and everyone else is behind.

So:
- New rules default to **`effective_from` = tomorrow**.
- Backdating is allowed but requires confirming a warning that names the date and states how many past
  days it opens for every participant.
- When a rule's effective window starts, every device shows a one-time dismissible notice on the Today
  screen: `New: Stretched 10+ minutes — starts today.`
- Historical days keep their original denominator. A November day out of 7 and an October day out of 6
  both display honestly; charts that compare across that boundary use completion percentage, not raw
  points.

---

## 5. Data model (D1 / SQLite)

```sql
-- ---------- users ----------
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,           -- crypto.randomUUID()
  display_name          TEXT NOT NULL,
  color_key             TEXT NOT NULL,              -- palette key, §7
  emoji                 TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  in_points_challenge   INTEGER NOT NULL DEFAULT 1,
  in_weight_challenge   INTEGER NOT NULL DEFAULT 0,
  claimed_at            TEXT,                       -- first device setup; soft signal only
  active_from           TEXT,                       -- NULL = since challenge start
  active_to             TEXT,                       -- NULL = ongoing; set on archive
  status                TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'archived'
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_users_color_active
  ON users(color_key) WHERE status = 'active';

-- ---------- rules ----------
CREATE TABLE rules (
  id              TEXT PRIMARY KEY,
  key             TEXT NOT NULL UNIQUE,        -- stable slug; never reuse a retired key
  label           TEXT NOT NULL,
  short_label     TEXT,                        -- for charts and tight spaces
  description     TEXT,
  icon            TEXT,                        -- lucide icon name
  category        TEXT NOT NULL,           -- reserved: no view groups by this today
  type            TEXT NOT NULL,               -- 'boolean' | 'counter' | 'threshold'
  config          TEXT NOT NULL DEFAULT '{}',  -- JSON
  points          INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL,
  effective_from  TEXT,
  effective_to    TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1
);

-- ---------- daily habit log ----------
CREATE TABLE log_entries (
  user_id     TEXT NOT NULL REFERENCES users(id),
  log_date    TEXT NOT NULL,          -- 'YYYY-MM-DD' in challenge-local time
  rule_key    TEXT NOT NULL,
  value       REAL NOT NULL,
  points      INTEGER NOT NULL,       -- server-computed snapshot; never client-supplied
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, log_date, rule_key)
);
CREATE INDEX ix_log_date      ON log_entries(log_date);
CREATE INDEX ix_log_user_date ON log_entries(user_id, log_date);

-- ---------- weight, as a dated series ----------
CREATE TABLE weight_entries (
  user_id     TEXT NOT NULL REFERENCES users(id),
  log_date    TEXT NOT NULL,
  weight_lb   REAL NOT NULL,
  is_baseline INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, log_date)
);
CREATE UNIQUE INDEX ux_weight_baseline
  ON weight_entries(user_id) WHERE is_baseline = 1;

-- ---------- audit ----------
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  acting_user TEXT,            -- client-declared; advisory only
  action      TEXT NOT NULL,   -- 'log.upsert' | 'weight.upsert' | 'rule.create' | ...
  target_user TEXT,
  detail      TEXT             -- JSON
);

-- ---------- config ----------
CREATE TABLE app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### `app_config` seed keys

| Key | Default | Meaning |
|---|---|---|
| `challenge_start` | `2026-09-01` | inclusive, editable in Settings |
| `challenge_end` | `2027-02-28` | inclusive, editable in Settings |
| `timezone` | `America/Los_Angeles` | §6 |
| `family_password_hash` | *(from secret)* | PBKDF2 |
| `family_password_salt` | *(generated)* | |
| `session_version` | `1` | bump to sign everyone out |
| `backfill_limit_days` | `0` | 0 = unlimited past editing |
| `future_logging_days` | `7` | how far ahead logging is allowed |
| `prize_monthly` | `$25` | display string beside the monthly leaderboard |
| `prize_final` | `$50` | display string beside the weight table |
| `challenge_title` | `Family Health Challenge` | header + PWA manifest |

### Seeding

Migration `0002_seed.sql` inserts the six launch rules and the `app_config` defaults. **It creates no
users.** The owner adds every family member by name, color, and emoji from Settings before launch, so
the device picker shows real people from the first run.

---

## 6. Dates and time — read before writing any date code

Every date bug in an app like this comes from the same place.

- One timezone for the whole challenge, from `app_config.timezone`. No per-user timezones.
- `log_date` is a **calendar date string**, `YYYY-MM-DD`. Never a timestamp, never a serialized `Date`,
  never UTC-shifted.
- "Today" is computed on the **server**, in the challenge timezone, and returned by `/api/bootstrap` as
  `serverToday`. The client uses that rather than `new Date()`, so a wrong phone clock or a traveling
  family member still logs to the right day.
- Never `new Date('2026-09-01')` — that parses as UTC midnight and shifts backward in the Americas. Use
  explicit component construction or a date-only library.
- Month boundaries for the monthly prize follow calendar months in the challenge timezone.
- Editable range: `[challenge_start, min(challenge_end, serverToday + future_logging_days)]`, further
  constrained by `backfill_limit_days` when nonzero. Out-of-range dates are rejected server-side with a
  clear message, never silently clamped.
- Changing `challenge_start` or `challenge_end` in Settings never deletes entries that fall outside the
  new window. It hides them from standings and warns how many are affected.

---

## 7. Color identity system

Sixteen claimable colors, unique among active users, enforced by the partial unique index and surfaced
in the UI as struck-out swatches in the picker.

Ordered around the hue wheel, with two neutrals at the end for people who don't want a loud color.

| key | hex | text on color |
|---|---|---|
| `tomato` | `#E54D2E` | `#FFFFFF` |
| `orange` | `#F76B15` | `#FFFFFF` |
| `amber` | `#FFB224` | `#1A1A1A` |
| `lime` | `#A8C81A` | `#1A1A1A` |
| `grass` | `#46A758` | `#FFFFFF` |
| `forest` | `#2A6A45` | `#FFFFFF` |
| `teal` | `#12A594` | `#FFFFFF` |
| `cyan` | `#00A2C7` | `#FFFFFF` |
| `blue` | `#0090FF` | `#FFFFFF` |
| `indigo` | `#3E63DD` | `#FFFFFF` |
| `violet` | `#6E56CF` | `#FFFFFF` |
| `plum` | `#AB4ABA` | `#FFFFFF` |
| `pink` | `#D6409F` | `#FFFFFF` |
| `ruby` | `#E03A5C` | `#FFFFFF` |
| `brown` | `#AD7F58` | `#FFFFFF` |
| `slate` | `#7B8794` | `#FFFFFF` |

The `text on color` column is not advisory — use it. `amber` and `lime` need dark glyphs; everything
else takes white. Getting this wrong fails AA on two of sixteen swatches and it will not be obvious.

Generate a 5-step tint ramp per color by mixing against **`surface`**, not `paper` (see `tint()` in
§11.1), exposed as CSS custom properties `--u-color`, `--u-on`, `--u-100`…`--u-500`. A person's color appears consistently everywhere:
banner, calendar pips, their line on every chart, their leaderboard accent. **Color is how you recognize
yourself in a chart without reading the legend.** Never reassign colors mid-challenge; archiving frees a
color for someone new.

Pair color with emoji and name wherever it carries meaning. Sixteen hues far exceed what some people
can reliably distinguish, and only eight are claimed at any time — the emoji is doing real work, not
decoration.

### 7.1 Identity editor

Reached two ways: **Settings → This device** for your own identity, and **Settings → People** for
anyone's. Same component, different target.

**Emoji and color are separate blocks with a rule between them.** They are two different decisions and
must not read as one control.

- **Emoji** — a single-grapheme text input rendered inside the avatar circle. Focusing it opens the
  system keyboard; the person taps the emoji key. There is no web API to open the emoji panel
  directly, and a curated grid is only ever a guess at what eight people want.
  - Take the **last full grapheme**, via `Intl.Segmenter`. `Array.from` shreds ZWJ sequences
    (👨‍👩‍👧 becomes three characters) and regional-indicator flags (two). This is a real bug, not a
    theoretical one.
- **Color** — a grid of all sixteen swatches, eight per row.
  - Available: the color at full strength.
  - **Taken: the color at ~30% opacity with a diagonal strike through it.** Not a faded swatch bearing
    the owner's emoji — that turns the color grid into an emoji grid and defeats the separation above.
  - Yours: full strength, ink border, ring, slight scale up, check glyph in the `on` color.
  - Attribution for taken colors goes in the `title`/`aria-label` and in the Settings → People list,
    not in the swatch.

Changing either propagates immediately and everywhere: banner, calendar pips, ribbon, radar, nav.

---

## 8. Screens

Mobile-first. Design at 390px and scale up; larger screens get a wider dashboard grid, no new features.

### 8.1 Gate (`/login`)

One password field, one button, the challenge title. Autofocus, `type="password"`,
`autocomplete="current-password"` so iOS Keychain saves it once and never asks again. Wrong password
shows an inline message, not a toast.

### 8.2 Who's using this device (`/whoami`)

Shown once per device. Unclaimed people first in full color; claimed people dimmed with
`Set up on another device` and a confirmation on tap. One tap sets identity and lands on Today.

### 8.3 Today (`/`) — the primary screen

Default landing for anyone who has already picked their identity. This screen has to be fast.

```
┌────────────────────────────────────────┐
│ ███ SOLID USER-COLOR BANNER ███████████│
│ ███  Wed, Sep 9        [J] Josh   ███ │
│ ███  Your log            4 / 6    ███ │
├────────────────────────────────────────┤
│  ‹  Today  ›            [ Calendar ]   │
├────────────────────────────────────────┤
│  ┌──────────────────────────────────┐  │
│  │ ✓  Water over 80 oz          +1  │  │  ← 62px tall,
│  ├──────────────────────────────────┤  │    whole row is
│  │ ✓  Slept 7+ hours            +1  │  │    the tap target
│  ├──────────────────────────────────┤  │
│  │ ○  Stuck to my diet           —  │  │
│  ├──────────────────────────────────┤  │
│  │ ✓  Stretched 10+ minutes     +1  │  │
│  ├──────────────────────────────────┤  │
│  │ ✓  Exercise block 1          +1  │  │
│  ├──────────────────────────────────┤  │
│  │ ○  Exercise block 2           —  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ⚖  Log today's weight          →     │  ← own page only
│                                        │
│   9 days logged in September           │
├────────────────────────────────────────┤
│ [Today] [Calendar] [Standings] [Device]│
└────────────────────────────────────────┘
```

- Opens on today's date for the device's own person. **Zero taps to reach what you came to do.**
- Tapping a row toggles instantly (optimistic), writes in the background, animates the fill in the
  user's color, and fires a celebration sized to the day's progress so far (§11.2) from the tap point.
  Filling the whole day triggers the top tier. No save button, no confirmation.
- `‹ ›` step one day; the common backfill case is "I forgot yesterday."
- The `4 / 6` denominator comes from `maxPointsForDate`.
- A day counts as *logged* once any rule is touched — distinct from an all-zero day (§8.4).
- **Weight row** appears only for people with `in_weight_challenge = 1`, only on their own page. Opens
  a numeric sheet; shows today's value if already logged. Never appears on someone else's page in any
  form, not even read-only. **No celebration of any kind fires on a weight entry** (§11.2).
- **Future dates** get a distinct treatment: a dashed banner border and a `Logging ahead` chip, so
  nobody fat-fingers into next week without noticing.
- Offline: the toggle still works, queues, and shows a subtle `Saved on this device` marker that clears
  on sync.

### 8.4 Calendar (`/calendar/:userId?`)

Month grid. Each cell shows the day number plus a **pip meter** — segments equal to that date's max
points, filled in the person's color. Untouched days show a hairline outline only; a logged-but-zero
day shows the full set of empty-but-present pips. That distinction is the difference between "I didn't
log" and "I had a rough day."

- A small `⚖` glyph in the cell corner marks days with a weight entry. On your own calendar, tapping
  that day lets you add or edit the weight for that date — this is the primary way to correct a
  mistyped or missed weigh-in. On someone else's calendar the glyph does not render at all.
- Tapping a day opens that day's log, respecting §3.4.
- Header shows month total, days logged, and best day.
- Swipe left/right between months. Person switcher at top — which is exactly when the someone-else's-
  page treatment engages.

### 8.5 Standings (`/standings`)

The social screen. Colorful, interactive, honest.

Top control: a three-way segmented toggle — `<current month>` | `All time` | `Weight`. The month label
is the actual month name, and tapping it opens a picker for earlier months. Widgets 1–4 below respond
to the first two; `Weight` swaps the whole panel for widget 5. The month view is the default during the
challenge, because that's where the $25 lives.

1. **Leaderboard.** Position, emoji, name, points, proportional bar in each person's color. Leader's row
   elevated, with `prize_monthly` shown as plain text. **Ties display as a shared position with a `T` prefix and are never
   auto-broken** — a footnote reads `Tied — settle it as a family.`
2. **The ribbon** *(signature element — build this well).* One horizontal strip per person for the
   selected month; each day a narrow vertical bar of segments filled in their color. Stacked, they make
   consistency and collapse instantly readable — who logs 4 points every day versus who spikes to 6 and
   vanishes for a week. Tap any day-bar for a tooltip. Spend the visual ambition here and keep
   everything around it quiet.
3. **Habit shape** — a radar chart, one spoke per **rule** (not per category), so the two exercise
   blocks stay separate and the shape maps 1:1 to the checkboxes people tap. Spokes are derived from
   `RULES`, so adding a seventh rule yields a seventh spoke with no code change.
   - **Each axis is a completion rate — percent of that person's logged days the rule was hit — scaled
     0–100%.** Never raw points. Movement is worth two points a day and everything else one, so a
     raw-points radar would show Movement dominating regardless of behavior. This was tried as stacked
     bars first and was genuinely confusing; don't go back to it.
   - Below the chart, a row of person toggles, each a chip in that person's color with their emoji.
     **The device's own person is on by default and nobody else is.**
   - Fill opacity thins as more people are layered (roughly 0.32 → 0.20 → 0.10) so three overlapping
     shapes stay readable. Strokes stay at full color and weight.
4. **Consistency.** Days logged and average points per logged day, per person. **No streak
   calculation** — consecutive-day logic is out of scope in-app. Any end-of-challenge streak awards are
   worked out offline from the CSV export.
5. **Weight.** Its own tab. Ranked table, greatest percentage lost first, showing **name and percentage
   only** — never pounds, never starting weight, for anyone. Someone who has gained shows a negative
   percentage and sorts to the bottom. Percentages update live as people log, so this is a running
   view, not an end-of-challenge reveal. Only people with `in_weight_challenge = 1` appear.

There is deliberately **no cumulative points-over-time line chart.** It was specified, built, and cut —
the ribbon already answers the same question better, and eight overlapping lines on a 390px screen is
noise.

Charts must be readable at 390px. Prefer fewer, larger charts over a dense grid. Legends tappable, not
hover-dependent.

### 8.6 Weight detail (own page only)

Reached from the Today weight row or a calendar day. Shows the person's own numbers: a sparkline of all
entries, the current percentage change, and a list of dated entries, each editable or deletable.

- **Baseline** defaults to the earliest entry. A `Set as starting weight` control on any entry moves it,
  enforced unique by `ux_weight_baseline`. If someone joins the challenge two weeks late, they set their
  real starting weight rather than having the first casual weigh-in become the denominator.
- Percentage lost = `(baseline − most recent) ÷ baseline × 100`.
- Nothing on this screen is reachable from another person's profile.

### 8.7 Settings (`/settings`)

Plain, utilitarian, one long scroll:

- **People** — drag to reorder. Add, rename, recolor, re-emoji (§7.1), toggle points and weight
  participation independently, archive. This list is also where you see at a glance who holds which
  color. Archiving preserves all history, removes them from standings from that date forward, and
  frees their color. Adding mid-challenge sets `active_from` to that date — no backfilled history,
  present from there forward.
- **Rules** — add, edit, reorder, enable/disable, set effective dates. New rules default to effective
  tomorrow; backdating warns per §4.4. Confirm dialogs state how many entries are affected.
- **Challenge** — title, start and end dates, timezone, backfill limit, future-logging window, and the
  two prize display strings.
- **This device** — switch person, edit your own emoji and color (§7.1), celebration level
  (Full / Subtle / Off, §11.2), sign out.
- **Password** — change the shared password, optionally signing out every device.
- **Export** — download all entries as CSV.

No admin role. Everyone with the password reaches Settings. Destructive actions confirm; archiving is
reversible; nothing hard-deletes log data.

---

## 9. API

JSON, under `/api`, session cookie required except where noted. Client sends `X-Acting-User: <userId>`
on writes for the audit log — advisory, never used for authorization.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/login` | `{password}` → sets cookie. Rate limited. Public. |
| `POST` | `/api/auth/logout` | clears cookie |
| `GET` | `/api/bootstrap` | **one call on cold start**: config, `serverToday`, rules effective now, users with claim state, and the current month's logs |
| `GET` | `/api/logs?user_id=&from=&to=` | inclusive range |
| `PUT` | `/api/logs/:userId/:date` | `{values:{rule_key:number}}` upsert. **Server computes points.** Returns canonical day state including that date's max. |
| `GET` `PUT` `DELETE` | `/api/weights/:userId`, `/api/weights/:userId/:date` | full series, upsert, delete |
| `POST` | `/api/weights/:userId/:date/baseline` | designate baseline |
| `GET` | `/api/stats/leaderboard?period=month\|all&month=YYYY-MM` | totals, ranks, ties flagged |
| `GET` | `/api/stats/rules?period=&month=` | per user × rule: hits, eligible days, completion rate. Powers the radar and the consistency widget. |
| `GET` | `/api/stats/ribbon?month=YYYY-MM` | per user, per day, per rule |
| `GET` | `/api/stats/weight` | **percentages only** — pounds never appear in this response |
| `GET` `POST` `PATCH` | `/api/users`, `/api/users/:id` | |
| `POST` | `/api/users/:id/claim` | sets `claimed_at` |
| `GET` `POST` `PATCH` | `/api/rules`, `/api/rules/:id` | |
| `GET` `PATCH` | `/api/config` | password hash never returned |
| `POST` | `/api/sync/batch` | mixed log + weight operations, for offline flush. Idempotent. |
| `POST` | `/api/admin/recompute` | re-derive historical points from current rules |
| `GET` | `/api/export.csv` | full raw export — see below |
| `GET` | `/api/health` | public |

There is no `/api/stats/series` and no category-grouped breakdown endpoint. Both existed to feed the
cumulative line chart and the stacked category bars, and both of those were cut (§8.5).

### The export is load-bearing

Streaks, consistency awards, and any analysis the family invents later are all done **offline, from this
file.** It is not a convenience feature. It must contain everything needed to reconstruct the challenge
without database access.

- Long format, one row per `(user, date, rule)`, including days and rules with a zero value, so gaps are
  distinguishable from unlogged days.
- Columns: `display_name`, `user_id`, `log_date`, `rule_key`, `rule_label`, `value`, `points`,
  `max_points_for_date`, `in_points_challenge`, `updated_at`.
- A second file or sheet for weights: `display_name`, `log_date`, `weight_lb`, `is_baseline`.
- Reachable from Settings as a one-tap download, and workable in Excel or Sheets without cleanup.

Server rules:

- **Never trust client-supplied point values.** Recompute from the rule definition on every write.
- Validate `log_date` against the challenge window, backfill policy, and future-logging window.
- Validate `value` against rule type — boolean → 0|1, counter → 0..max.
- **Weight pounds are only ever returned for a single requested `userId`.** No aggregate endpoint
  returns raw weights. This is enforced at the query layer, not by the client hiding a field.
- **Every aggregate respects `status`, `active_from`, and `active_to`.** Archived people keep their
  history but drop out of standings from `active_to` forward; people added mid-challenge have no
  history before `active_from`. Getting this wrong is invisible until someone is archived.
- Aggregate in SQL, not JavaScript.
- Return `{error:{code,message}}` with messages the UI can display directly.

---

## 10. PWA and offline

- `manifest.webmanifest`: `display: standalone`, name from `challenge_title`, theme color matching app
  chrome, maskable icons at 192/512, `apple-touch-icon` link tag, `start_url: "/"`, portrait.
- Service worker: app shell precached, network-first for `/api/**` with cache fallback so standings
  render something offline.
- **Offline writes required.** Toggles and weight entries enqueue to IndexedDB and flush via
  `/api/sync/batch` on reconnect — one endpoint accepting both log and weight operations, so a queue
  holding a mix of the two flushes in a single round trip. Optimistic UI throughout — the checkbox fills immediately, always.
  Pending indicator, never a blocking spinner.
- Conflict resolution: last write wins per `(user, date, rule)`. Anything more elaborate is wasted
  effort for a family logging their own habits.
- iOS: `viewport-fit=cover` with `env(safe-area-inset-*)` on the fixed bottom nav and color banner;
  `-webkit-tap-highlight-color: transparent`; `user-scalable=no` is **not** permitted. Dismissible
  "Add to Home Screen" hint on first Safari visit.
- No push notifications. No reminders. Leave the service worker structured so it isn't precluded later.

---

## 11. Visual direction

**An approved visual mockup accompanies this spec: `HealthChallengeMockup.jsx`.** If you have it, it is
the source of truth for pip treatment, the ribbon, the radar, the read-only banner, and the celebration
feel — read its header comment first, which lists the three places it deliberately departs from
production (no localStorage, no API, hand-rolled confetti). Where it and this document disagree on a
*visual* detail, the mockup wins; on *behavior*, this document wins.

**If you do not have the mockup, build from §11.1 alone** — the token set there is complete and exact.
Do not treat the missing file as a blocker.

If a frontend-design skill or house style guide is available in your environment, read it. Treat what
follows as the brief, not as finished tokens.

**The subject's world:** wall calendars, chore charts, gold-star sticker sheets, league standings. Not a
fitness app, not a medical dashboard. Tone is *family competition* — warm, a little loud, legible at
arm's length, never clinical and never gamified into condescension.

**The neutral must recede so sixteen saturated user colors can be the palette.** Avoid the warm-cream-
plus-terracotta look entirely; with these hues it fights everything. The base is a cool neutral paper,
and a dark variant ships alongside it — half of all logging happens in bed at night. Exact values in
§11.1; do not eyeball them.

**Type:** a characterful display face paired with a strictly tabular numeral face. Scores and dates are
data and must align in columns. Bricolage Grotesque for display, Public Sans for body, IBM Plex Mono for
every numeral. Three faces, three jobs, no overlap. Exact scale in §11.1.

**Signature element:** the ribbon (§8.5). That's what gets screenshotted into the group chat.

**Motion:** see the celebration system in §11.2. Outside of it, the page stays still. Respect
`prefers-reduced-motion`.

**Quality floor, unannounced:** 44px minimum tap targets, visible keyboard focus, WCAG AA for every
text-on-color pairing (`amber` and `lime` need dark glyphs), real `<button>` and
`<input type="checkbox">` elements, screen-reader labels stating both the rule and whose log it is.

### 11.1 Design tokens

These are exact. They are lifted from the approved mockup and are not suggestions.

**Theme surfaces**

| token | light | dark | used for |
|---|---|---|---|
| `paper` | `#F1F2F0` | `#101214` | app background behind cards |
| `surface` | `#FFFFFF` | `#1A1D20` | cards, nav bar, sheets |
| `surfaceAlt` | `#F7F8F6` | `#212528` | inset wells, inactive segmented track, icon tiles |
| `ink` | `#16191C` | `#E8EBEC` | primary text |
| `muted` | `#6C7278` | `#8A9196` | secondary text, axis labels, captions |
| `hairline` | `#DEE1DD` | `#2C3135` | 1px borders and dividers |
| `scrim` | `rgba(16,18,20,0.45)` | `rgba(0,0,0,0.6)` | behind bottom sheets |

Dark mode is **not an inversion.** Surfaces lift *above* the paper rather than dropping below it, and
`hairline` is lighter than `paper` in dark and darker than `paper` in light. Cards read as raised in
both themes. Do not derive one theme from the other programmatically.

**Derived color**

Two helpers do all the work. Implement them once.

```
mix(a, b, t)      → linear RGB interpolation; t=0 returns a, t=1 returns b
tint(color, T, s) → mix(T.surface, color, s)   // a user color's tint against the current surface
desat(color, T)   → mix(color, T.muted, 0.72)  // the read-only banner treatment, §3.4
```

Because `tint` mixes against `T.surface`, every tint automatically adapts to the theme. Expose the ramp
as CSS custom properties `--u-color`, `--u-on`, `--u-100`…`--u-500`.

Tint steps in use — match these:

| context | step |
|---|---|
| checked row background | `0.10` |
| calendar day cell fill | `0.045 + (points ÷ max) × 0.12` |
| ribbon empty segment on a logged day | `0.09` |
| leaderboard leader row | `0.09` |
| perfect-day banner fill / border | `0.16` / `0.35` |
| selected radar chip, emoji swatch | `0.16`–`0.18` |
| selected color-swatch ring | `0.28` |

**Type scale**

| role | face | size | weight | notes |
|---|---|---|---|---|
| Screen title | display | 24 | 700 | `letter-spacing: -0.02em` |
| Banner date | display | 25 | 700 | `-0.02em`, `line-height: 1.15` |
| Section title | display | 17 | 700 | `-0.01em` |
| Recap hero number | display | 76 | 800 | `-0.04em` |
| Rule row label | body | 14.5 | 500 / 600 when checked | |
| Body copy, buttons | body | 13–14.5 | 500–700 | |
| Caption / helper | body | 11.5 | 400 | `line-height: 1.5`, `muted` |
| Banner score, all data | mono | 20 / 15 / 12.5 | 600 | tabular |
| Kicker / eyebrow | mono | 10–11 | 600 | uppercase, `letter-spacing: 0.06em` |
| Chart axis labels | mono | 8.5–10.5 | 400 | |

Every number the user reads as data — scores, dates, percentages, day cells, axis ticks — is set in the
mono face. Set `font-variant-numeric: tabular-nums` regardless; column alignment is the whole point.

Self-host these weights: Bricolage Grotesque variable 400–800, Public Sans 400/500/600/700, IBM Plex
Mono 400/500/600. No runtime font requests to a third party (§12).

**Radius**

| element | radius |
|---|---|
| Cards, sheets (top corners), primary buttons | 16 |
| Rule-row icon tile | 9 |
| Checkbox | 8 |
| Calendar day cell | 8 |
| Chips, segmented control, swatches, avatars | full |
| Ribbon segment | 1 |

**Spacing and sizing**

- Screen gutter: 16
- Card interior padding: 14
- Rule row height: **62** — the whole row is the tap target, not the checkbox
- Checkbox: 25 with a 2px border · icon tile: 30 · avatar: 34 in headers, 52 in the identity editor
- Color swatch: 32, eight per row, 6 gap
- Calendar cell: 44 tall, 3 gap · pip: 3.5 diameter, 1.5 gap
- Ribbon row: 26 tall, 1.5 gap between days, 1 between segments
- Bottom nav: 18 icon, 10 label, safe-area padding beneath

**Motion**

| what | value |
|---|---|
| Checkbox fill, icon tile scale | `180ms cubic-bezier(.34,1.56,.64,1)` — overshoot spring |
| Theme change | `240ms ease` on background |
| Leaderboard bar growth | `600ms ease` on width |
| Celebration | §11.2 |

All of it collapses to instant state changes under `prefers-reduced-motion: reduce`.

**Theme resolution**

Three-way control: `system` (default) · `light` · `dark`, stored in `localStorage`. When set to
`system`, subscribe to `matchMedia('(prefers-color-scheme: dark)')` and **react to changes live** — a
phone crossing into its scheduled dark mode at sunset should flip the app without a reload. Same
pattern for `prefers-reduced-motion`.

### 11.2 Celebration system

Light gamification. The point is to make logging feel good enough that people keep doing it in month
five, which means **rationing the reward, not maximizing it.**

**The model: escalation within the day.** Every logged item raises the celebration a step, so the sixth
check of the day is a fireworks display and the first is a flick of confetti. The reward grows as the
day fills in.

**Tier is derived from points, never from box count.** Compute
`tier = pointsEarnedForDate / maxPointsForDate(date)` — a 0→1 ratio — and interpolate intensity across
it. Box-counting breaks the moment a seventh rule is added or a `counter` rule worth 2 points exists.
The ratio does not. Six rules yields six steps, seven yields seven, with no code change.

**The intensity curve is convex, not linear.** The bottom tiers fire every day for six months and must
be nearly nothing; the budget is spent at the top.

| Ratio | Feel | Rough shape |
|---|---|---|
| ~0.17 | barely there | 6–8 particles, tight spread, from the tap point |
| ~0.33 | barely there | 10 particles, slightly wider |
| ~0.50 | small | 16 particles, a little lift |
| ~0.67 | noticeable | 24 particles, upward velocity, wider arc |
| ~0.83 | generous | 40 particles, two staggered bursts |
| **1.0** | **fireworks** | multi-burst launch from the tap point, 1.2s, user's color with white and gold accents, plus a banner reading `{max} / {max} — perfect day` |

All bursts originate at the tap coordinates (`canvas-confetti` accepts a normalized `origin {x, y}`).
The top tier launches upward and outward from that point rather than falling from the top.

**Each tier fires at most once per logged date.** Track the highest tier reached for that `log_date` in
`localStorage`. Unchecking and re-checking gives the fill animation and nothing more — otherwise the
fireworks become a toy to farm and stop meaning anything. Backfilling a past day plays the full
sequence; it's the same accomplishment.

**Cap the top tier at ~1.2s and never block.** The celebration is decoration over a write that already
succeeded. A failed write must still surface its error over the top of it.

**Never celebrate:**

- **Weight.** No animation, no acknowledgment beyond the value appearing. Not at any tier, not on any
  page, regardless of which direction the number moved.
- **Unchecking.** No reverse animation, no particles retracting, no sad state — just an unhurried fade
  back to empty. Correcting a mistake must not feel like a penalty, and the day's tier tracking does
  not decrease.
- **A first log, or any onboarding moment.** The escalation ladder is the whole reward system.
- **Someone else's page.** Logging for Marie fires nothing beyond the checkbox fill. It isn't your
  accomplishment and the page is already marked as not yours.
- **Leaderboard position changes.** No "you took the lead." It needs polling and it lands badly on
  whoever just got passed.

**Month recap.** On first open of a new calendar month, a full-screen decorative panel showing the
person's **previous month total as the hero number**, in their color, with a burst behind it. Dismissed
by tap. Shown once per person per device — record `lastRecapShown: 'YYYY-MM'` in `localStorage`.

- Suppressed in the challenge's first month; there is no prior month to report.
- If the person logged nothing last month, state that plainly — `No entries logged in September` — and
  do not fire the burst. Celebrating a zero reads as sarcasm.
- Still fires on the first of the month *after* the challenge ends, so the final month gets its recap.
- *Optional, owner's call:* a secondary line with their finishing rank for the month.

**Ambient motion** (governed by the same setting, no particles): calendar pips stagger in on month
load, leaderboard bars grow from zero, ribbon strips wipe in left to right. **Build this last.** It is
the one piece here that could read as fussy rather than alive, and it should be removable by deleting a
single hook without touching anything else.

**The setting.** A three-way control, **stored in `localStorage`, not the database**:

- `full` — default
- `subtle` — bottom-tier flicks and ambient motion only; no top-tier fireworks, no month recap burst
- `off` — fills and state changes only

It is a rendering preference belonging to the device doing the rendering. Server-side per-user it
becomes ambiguous the moment your setting differs from the person whose page you're viewing. Exposed in
two places: Settings → This device, and a one-tap `Turn off celebrations` control inside the
day-complete banner — the moment someone is most likely to want it.

**`prefers-reduced-motion: reduce` forces the initial value to `off`,** overriding the default. The
person can still opt in explicitly. Spring fills degrade to instant state changes.

**Implementation.** `canvas-confetti` (~4KB gzipped, no dependencies). One reused canvas,
`pointer-events: none`, `z-index` above content and below modals. Cancel all animation when
`document.hidden`. Particle counts as tabled above and no higher — these run on old phones.

**No sound.** Not muted-by-default, not present. Half of all logging happens in bed at night.

Keep celebration animations visually distinct from system toasts. Toasts carry information — `Saved on
this device`, `Rule added`, errors. Confetti carries none. Do not let one look like the other.

---

## 12. Non-functional

- Cold start to interactive Today screen **under 1.5s on 4G**, from one bootstrap request.
- Total JS under 250KB gzipped. **Lazy-load the charts route** — Recharts is the heavy dependency and
  the logging screen must not pay for it.
- No third-party analytics, no runtime-loaded external fonts (self-host), no CDN scripts. This app holds
  family health data; it should talk to nobody but its own origin.
- CSP restricted to `'self'`. `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- Not indexable: `robots.txt` disallow all, `X-Robots-Tag: noindex`.
- **Backups.** Scheduled weekly D1 export to R2, or at minimum a documented manual
  `wrangler d1 export` procedure in the README. Six months of daily logs with no backup is a bad plan.

---

## 13. Resolved decisions

| # | Question | Decision |
|---|---|---|
| 1 | Daily maximum | 6 at launch, always derived from rules in effect on the date. Never hardcoded. |
| 2 | Monthly prize tie | Display as a tie (`T1`), never auto-broken. Family settles it. |
| 3 | Weight ranking | Rank by greatest percentage lost, shown as a positive number. Gains show negative and sort last. |
| 4 | Backfill | Unlimited. Honor system. |
| 5 | Future logging | Allowed, capped at 7 days ahead, with distinct visual treatment to prevent accidents. |
| 6 | Who can change rules | Anyone with the password. New rules auto-appear on every page from their effective date; default effective tomorrow, backdating allowed with a warning. |
| 7 | Reminders | None. |
| 8 | Sheet import | None. Start fresh. |
| 9 | Weight privacy | Percentages public and live; pounds visible only to the person themselves, on their own page. Editable per date from their own calendar. |
| 10 | Adding/archiving people | Archive preserves history, removes from standings forward, frees the color. Adding sets `active_from` to that date — no backfilled history. |
| 11 | Start date | 2026-09-01 proposed, editable in Settings without a deploy. |
| 12 | Scoring model | Simple sum of per-rule points. No bonuses, multipliers, or caps. Closed — build no abstraction for them. |
| 13 | Prizes | Display text only. No table, no tracking, no automation. |
| 14 | Streaks | Not in the app. Back-calculated from the CSV export if the family wants an award at the end. |

**No open decisions remain.** Anything not specified here is out of scope for v1.

---

## 14. Build order

Six phases. Each is a self-contained unit of work sized for one agent, with a stated dependency, a
demoable deliverable, and the sections that agent needs to read — so a sub-agent can be given a narrow
slice of this document rather than all of it.

**Parallelism is marked explicitly.** Phases 0 and 1 run side by side. Phase 3 is three independent
tracks. Everything else is sequential.

```
    ┌── Phase 0  Design system ──┐
    │                            ├──► Phase 2  Logging ──┬─► 3A Calendar + weight ─┐
    └── Phase 1  Foundation ─────┘   (critical path)     ├─► 3B Standings          ├─► Phase 4 ─► Phase 5
                                                          ├─► 3C Settings           │   Offline    Launch
                                                          └─► (4 may start here) ───┘
```

### The contract that makes parallelism safe

Before Phase 2 opens, Phase 1 must publish, in the repo:

- `src/types.ts` — every API request and response shape
- `src/api.ts` — a typed client with one function per endpoint in §9, stubbed if not yet implemented
- `src/theme.ts` — the tokens, palette, and `mix`/`tint`/`desat` from Phase 0

Track agents code against these and never against each other. If a track needs a shape change, it
changes `types.ts` first and says so. Without this, three parallel tracks produce three incompatible
API clients and the merge costs more than the parallelism saved.

---

### Phase 0 — Design system
**Depends on:** nothing. **Runs parallel with Phase 1.** **Read:** §7, §7.1, §11, §11.1, plus the mockup.

Vite + React + TS + Tailwind scaffold. Self-hosted fonts. Theme provider implementing every token in
§11.1, the three-way System/Light/Dark control with live `matchMedia`, the 16-color palette module, and
`mix`/`tint`/`desat`. Shared primitives: `Card`, `Segmented`, `SectionTitle`, `Pips`, `Banner`, person
chip, bottom nav.

**Demo:** a single route rendering every primitive and all 16 colors in both themes, toggling live.
**Done when:** sampled colors match §11.1 exactly.

### Phase 1 — Foundation
**Depends on:** nothing. **Runs parallel with Phase 0.** **Read:** §2, §3, §4.3, §5, §6, §9, §12.

Pages project, both D1 bindings, `0001_schema.sql` and `0002_seed.sql` (six rules, config defaults, no
users). Auth gate: PBKDF2 verify, HMAC session cookie, rate limiting, session-version check. Date
utilities: `serverToday`, challenge-timezone date math, `maxPointsForDate`. `/api/bootstrap`,
`/api/health`. Custom domain live. Then publish the contract above.

**Demo:** the real URL asks for the password on a phone over cellular, and `/api/bootstrap` returns
seeded rules and a correct `serverToday`.
**Done when:** date helpers pass tests at month boundaries and across a DST change.

> DST is the trap. `America/Los_Angeles` shifts on 2026-11-01 and 2027-03-08. Test both.

### Phase 2 — Logging · the critical path
**Depends on:** 0 + 1. **Read:** §3.2, §3.4, §4.3, §4.4, §6, §8.2, §8.3, §11.2.

Identity picker with claimed/unclaimed states. Today screen, day navigation, `PUT /api/logs/:userId/:date`
with server-side scoring and full date validation. Own-vs-other-page treatment including the
`Log for [name]` unlock. Future-date treatment.

**Splittable into two sub-agents** working against the same `types.ts`:
- **2a** — screens, identity, ownership treatment
- **2b** — the celebration engine (§11.2): canvas layer, escalation curve, once-per-tier-per-date
  tracking, the Full/Subtle/Off setting, reduced-motion default. Self-contained; takes a
  `(x, y, ratio, color)` call and owns everything downstream of it.

**This is the MVP.** Ship it, then have the family log for several real days before building anything
else. Feedback from actual use should reach Phase 3 before Phase 3 finishes.

### Phase 3 — Three parallel tracks
**Depends on:** 2. **The three tracks do not depend on each other.**

**3A · Calendar and weight** — **Read:** §8.4, §8.6, §9 weights.
Month grid with per-date pip meters, the unlogged-versus-zero distinction, weight glyph, per-date weight
entry and correction, baseline designation, own-weight detail screen.

**3B · Standings** — **Read:** §8.5, §9 stats.
Leaderboard with tie handling, the ribbon, the radar with person toggles, consistency, weight-percentage
tab, month filter. Lazy-load this route; Recharts must not load on the Today screen.
*Highest visual risk — the ribbon is the signature element. Give this track the most review.*

**3C · Settings** — **Read:** §4.1, §4.4, §7.1, §8.7, §9 export.
People management, identity editor, rule editor with effective dates and backdating warnings, challenge
config, password change, CSV export.
*Do this track early if the family needs to enter all eight people before launch.*

### Phase 4 — Offline and PWA
**Depends on:** 2. **May start alongside Phase 3** once the write path is stable. **Read:** §10, §12.

Manifest, icons, service worker, IndexedDB queue, `/api/sync/batch`, optimistic UI with pending
indicators, iOS safe areas and install hint, CSP and headers.

**Done when:** a full day logged in airplane mode syncs correctly on reconnect.

### Phase 5 — Launch readiness
**Depends on:** 3 + 4. **Read:** §11.2 ambient motion, §12 backups, §15.

Ambient motion (built last, removable by deleting one hook). Month recap panel. Scheduled D1 backup to
R2 and a written restore procedure. README. Then walk the entire §15 checklist on a real phone.

---

**Hard deadline:** Phases 0–2 live and tested **before the challenge start date**. Everything from
Phase 3 onward can land while the challenge is already running — people will be logging into an app
whose standings page doesn't exist yet, and that is fine.

---

## 15. Acceptance checklist

- [ ] A family member with only the shared password, on iPhone Safari, installs to their home screen and logs a full day in under 10 seconds without typing anything.
- [ ] Session survives a force-quit and a week of not opening the app.
- [ ] Opening the app lands directly on today's log for the device's own person, zero intermediate taps.
- [ ] The device picker shows unclaimed people first and marks claimed ones, and a second device can still claim an already-claimed person after confirming.
- [ ] Clearing browser data and re-entering the password restores full history after one identity tap.
- [ ] Viewing another person's log is unmistakable at a glance, and their controls are inert until deliberately unlocked.
- [ ] Adding a person from Settings makes them appear in standings, the calendar switcher, and every chart with no code change and no redeploy — with no history before their join date.
- [ ] Archiving a person preserves their past entries and removes them from standings going forward.
- [ ] Adding a rule from Settings makes it appear on every person's page from its effective date, and past totals are unchanged.
- [ ] A day before a new rule's effective date still shows its original denominator, and completion-rate charts remain correct across the boundary.
- [ ] Disabling a rule mid-challenge does not alter historical totals.
- [ ] Changing the challenge start date in Settings takes effect without a deploy and without deleting entries.
- [ ] Weight percentages appear on the standings tab; no raw weight appears anywhere except the owner's own weight screen. Verified by inspecting the `/api/stats/weight` response.
- [ ] A weight entry can be added, corrected, and re-dated from the person's own calendar.
- [ ] Moving the baseline weight recalculates the percentage correctly.
- [ ] Toggling a checkbox in airplane mode persists and syncs on reconnect.
- [ ] A day logged at 11:55pm lands on that day, not the next, regardless of device timezone.
- [ ] Logging 8 days ahead is refused with a clear message; 3 days ahead works and is visually marked.
- [ ] The monthly leaderboard for October shows only October points, and ties render as ties.
- [ ] Someone with `in_weight_challenge = 0` appears in points standings and nowhere in weight views.
- [ ] Each successive check within a day produces a visibly larger celebration, with the final one clearly the biggest.
- [ ] Adding a seventh rule produces seven escalation steps instead of six, with no code change.
- [ ] Unchecking the last box and re-checking it does not replay the top-tier celebration.
- [ ] Unchecking fires nothing, and logging a weight fires nothing.
- [ ] The month recap appears once on the first of a new month, does not appear in the challenge's first month, and does not fire a burst for a month with no entries.
- [ ] Setting celebrations to Off silences everything including ambient motion, and the choice survives a force-quit.
- [ ] With OS reduce-motion enabled, the app starts at Off without the person changing anything.
- [ ] A failed write still surfaces its error clearly even when a celebration is playing over it.
- [ ] The radar opens with only the device's own person selected, and adding two more keeps all three shapes readable.
- [ ] A person who hit water every day and exercise rarely shows a visibly lopsided radar, and adding a seventh rule adds a seventh spoke with no code change.
- [ ] The color picker shows all sixteen swatches; taken ones are struck out and unpickable, and no emoji appears anywhere in that grid.
- [ ] The emoji field accepts a multi-codepoint emoji such as 👨‍👩‍👧 or a flag without splitting it.
- [ ] Changing color or emoji updates the banner, calendar pips, ribbon, radar, and nav without a reload.
- [ ] Light and dark themes match the §11.1 token table exactly, sampled with a color picker rather than by eye.
- [ ] With the theme set to System, changing the phone's appearance flips the app live without a reload.
- [ ] Cards read as raised above the background in both themes — dark mode is not an inversion of light.
- [ ] Every text-on-color combination passes WCAG AA.
- [ ] The full dashboard is readable and usable at 390px wide.
- [ ] The CSV export opens cleanly in Sheets and contains enough to compute every person's longest consecutive-day streak without touching the database.
- [ ] `wrangler d1 export` produces a restorable backup and the procedure is in the README.

---

## Appendix A — Deliverables

- Working Pages deployment on the owner's domain
- Repo with `/migrations`, `/functions`, `/src`, and a README covering local dev, migration commands,
  secret setup, backup and restore, and how to add a rule or a person
- Seed migration producing the six launch rules and config defaults, and no users
- No secrets committed. `INITIAL_FAMILY_PASSWORD` and `SESSION_SECRET` set via `wrangler pages secret put`.

---

## Appendix B — Environment setup

**Verify command syntax against current Cloudflare docs before running anything.** Wrangler's CLI and
its Pages/D1 integration change often, and this appendix was written from a snapshot. The *shape* of
what's needed is stable; the exact flags may not be. If a command below fails, check the docs rather
than working around it.

### Prerequisites

- Node 20 LTS or newer, npm
- A Cloudflare account with the target domain already added (the owner has this)
- `npx wrangler login` completed against that account

### Repository layout

```
/
├─ migrations/
│   ├─ 0001_schema.sql          # §5, verbatim
│   └─ 0002_seed.sql            # six rules + app_config defaults, NO users
├─ functions/
│   └─ api/                     # Pages Functions, one file per §9 route group
│       ├─ auth/[[route]].ts
│       ├─ logs/[[route]].ts
│       ├─ weights/[[route]].ts
│       ├─ stats/[[route]].ts
│       ├─ users/[[route]].ts
│       ├─ rules/[[route]].ts
│       ├─ sync/batch.ts
│       ├─ bootstrap.ts
│       ├─ config.ts
│       ├─ export.csv.ts
│       └─ health.ts
├─ src/
│   ├─ theme.ts                 # tokens, palette, mix/tint/desat   (Phase 0)
│   ├─ types.ts                 # API request/response shapes       (Phase 1)
│   ├─ api.ts                   # typed client, one fn per endpoint (Phase 1)
│   ├─ lib/dates.ts             # serverToday, date math, maxPointsForDate
│   ├─ components/              # shared primitives
│   └─ screens/                 # one per §8 screen
├─ public/                      # manifest, icons, fonts (self-hosted)
├─ wrangler.toml
└─ README.md
```

### Dependencies

Runtime: `react`, `react-dom`, `recharts`, `lucide-react`, `canvas-confetti`, `idb`.
Build: `vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `postcss`, `autoprefixer`,
`wrangler`.

Install current stable versions rather than pinning to anything named here. **Recharts is the heavy
one** — it must be dynamically imported by the Standings route only (§12).

### One-time infrastructure

```bash
# Two databases: production and preview
npx wrangler d1 create health-challenge
npx wrangler d1 create health-challenge-preview
# Record both database_id values into wrangler.toml

# Apply migrations — local first, then remote
npx wrangler d1 migrations apply health-challenge --local
npx wrangler d1 migrations apply health-challenge --remote

# Secrets. Never commit these; never echo them into logs.
npx wrangler pages secret put INITIAL_FAMILY_PASSWORD
npx wrangler pages secret put SESSION_SECRET   # 32+ random bytes, base64
```

`wrangler.toml` needs, at minimum: the Pages project name, `pages_build_output_dir`, a `[[d1_databases]]`
binding named `DB` for production, and a preview-environment override pointing at the preview database.
If rate limiting uses KV rather than a D1 table (§3.1), add that namespace binding too.

### Local development

```bash
npm run build && npx wrangler pages dev   # serves the SPA + Functions with D1 bound
```

The Vite dev server alone will not work for anything touching `/api` — Functions need the Wrangler
runtime. Expect to build before serving, or wire a proxy.

### Deploy

Connect the repo to Cloudflare Pages for automatic deploys, or `npx wrangler pages deploy`. Add the
custom domain through Pages → Custom domains. **This creates one proxied CNAME and must not touch MX,
TXT, or any existing record** — the owner runs email on that domain.

### What to test

Not a full test suite. Three things earn automated tests because they fail silently:

1. **`src/lib/dates.ts`** — month boundaries, the challenge start and end dates, and both DST
   transitions (`2026-11-01`, `2027-03-08`). §6 exists because this is where the bugs live.
2. **Server-side scoring** — given a rule set and a raw `values` payload, the points computed must match
   expectation for all three rule types, including a date where a rule is outside its effective window.
3. **`maxPointsForDate`** — correct denominators before, during, and after a rule's effective window.

Everything else is verified by walking §15 on a real phone.

### Definition of done

A phase is done when its §14 demo passes and every §15 item touching that phase is checked on a
physical iPhone — not a desktop browser at 390px. Safe areas, the emoji keyboard, haptics, and the
install flow only behave correctly on the real device.
