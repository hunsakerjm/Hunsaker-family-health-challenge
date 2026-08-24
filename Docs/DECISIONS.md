# Decision Log

Append-only. Per spec §0 ("Resolving ambiguity"): when neither the spec nor the mockup answers a
question and the choice is reversible, pick the simpler option, write it down here, and keep
going. Do not stall on reversible ambiguity. Irreversible ambiguity (schema shape, auth decision)
does not belong here as a self-served entry — it stops and asks the owner instead.

Add new entries at the bottom, newest last. Never edit or delete a past entry; if a decision is
later reversed, add a new entry that supersedes it and say so.

## Format

Each entry:

```
### YYYY-MM-DD — Short title

**Decision:** what was picked.
**Rationale:** why, in one or two sentences.
**Spec ref:** the section this relates to (e.g. §4.3), or "N/A" if none.
**Status:** RESOLVED, or PENDING OWNER INPUT.
```

---

### 2026-08-23 — Four owner inputs pending before Phase 1's seed migration

**Decision:** none yet — this entry records that four required inputs from the owner have not
been collected. Per spec §0, these are the only genuine unknowns and must be asked for in one
message before implementation work starts:

1. **Hostname/subdomain** — which domain in the owner's Cloudflare account, and which subdomain.
   The spec uses `challenge.example.com` as a placeholder throughout.
2. **Shared family password** — the actual value, or explicit permission for an agent to generate
   one and hand it back.
3. **Repo location** — new GitHub repo, an existing one, or local only.
4. **Start-date confirmation** — spec §13 proposes `2026-09-01`. It is editable later without a
   deploy, but Phase 1's seed migration writes the initial value, so it needs a yes/no before that
   migration is authored.

**Rationale:** spec §0 explicitly forbids guessing at these four; everything else in the spec
(§13) is closed and must not be re-litigated.

**Spec ref:** §0 ("Before you write code, get four things from the owner"), §5 (seed migration),
§13 #11 (start date).

**Status:** **PENDING OWNER INPUT** — the orchestrating agent is collecting these. All four must
be filled in, in this file, before Phase 1's `0002_seed.sql` is written or applied to any
environment.

---

### 2026-08-23 — Three of four owner inputs answered

**Decision:** Three of the four required inputs have been collected; one remains pending.

1. **Repo location — RESOLVED.** A new GitHub repo will be created by the owner and connected
   to this local repo. Cloudflare Pages will be wired to it for automatic deploys (spec Appendix B,
   "Deploy"). Git is already initialized locally on `main` with no remote yet.

2. **Shared family password — RESOLVED (value not recorded in this repo).** The owner authorized
   generating one; it was generated and handed to the owner directly in conversation,
   deliberately NOT written into this repo or any file in it. It is set at deploy time via
   `npx wrangler pages secret put INITIAL_FAMILY_PASSWORD`. **CRITICAL NOTE: the password value
   must never be committed to this repo or written into any file in it.**

3. **Challenge start date — RESOLVED.** `2026-09-01` confirmed by the owner. End date
   `2027-02-28`, 181 days total. This is what Phase 1's `0002_seed.sql` seeds into `app_config`.
   Note that the start and end dates stay editable in Settings (Phase 3C) without a redeploy,
   and that nothing in the codebase may hardcode `181` (spec §1, §4.3) — it is derived from the
   configured dates.

4. **Hostname/subdomain — STILL PENDING OWNER INPUT.** The owner is providing this; it has not
   been given yet. It does not block Phase 0 or most of Phase 1 — it is only needed when the
   custom domain goes live at the end of Phase 1. When the owner provides it, adding it via
   Cloudflare Pages → Custom domains creates one proxied CNAME and must not touch MX, TXT,
   or any existing DNS record, because the owner runs email on this domain (spec §2).

**Rationale:** Three inputs are now confirmed. The hostname is the only remaining pending item;
it is not a blocker for Phase 0/1 development.

**Spec ref:** §0 ("Before you write code, get four things from the owner"), §2 ("Domain and DNS"),
§5 (seed migration), §13 #11 (start date), Appendix B ("Deploy").

**Status:** PARTIALLY RESOLVED — hostname still **PENDING OWNER INPUT**.

---

### 2026-08-23 — Remaining owner inputs resolved; apex domain confirmed

**Decision:** All four required owner inputs from spec §0 have now been collected and resolved.

1. **Shared family password — RESOLVED (value not recorded in this repo).** The owner chose a value and handed it to me directly in conversation. This proves "someone here is family" but does not identify anyone (spec §3.1). The value is set at deploy time via `npx wrangler pages secret put INITIAL_FAMILY_PASSWORD` and is **deliberately not recorded in this repo, SETUP_LOG.md, or any other file in it — it lives only in the Cloudflare secret**. Rationale: the gate is protected by PBKDF2-SHA256 at 600k iterations plus rate limiting (spec §3.1), so short is acceptable; the password only proves family membership, not identity.

2. **Hostname — RESOLVED as an apex domain.** `hunsaker-family.com`, the root domain, **no subdomain**. This is a deliberate deviation from spec §2, which uses the placeholder `challenge.example.com` and assumes a subdomain. Rationale: this is a brand-new domain in the owner's Cloudflare account with no other services on it, so the apex is available and appropriate.

3. **DNS safety concern — RETIRED.** Earlier entries carried a warning that the owner runs email on this domain. The owner has now confirmed that **there is no email configured on `hunsaker-family.com`** and the domain is entirely new with no existing records. The MX/TXT/DNS preservation rule from spec §2 therefore does not apply here. We retain the general hard rule: "do not delete or modify records you did not create" — it remains good practice — but the specific email-service risk is resolved.

4. **Cloudflare Access / Zero Trust — CONFIRMED EXCLUDED.** The owner's explicit requirement is that family members must never hit a Cloudflare login page. This matches spec §2 and §3 exactly; auth is application-level only. This was the owner's own stated concern and requirement, not an interpretation of spec rules.

5. **Repo remote — RESOLVED.** `origin` is set to `https://github.com/hunsakerjm/Hunsaker-family-health-challenge.git` on branch `main`. No commits or pushes yet; the owner handles `git add` and `git commit` themselves.

6. **Terminal access — RESOLVED.** The owner works from a phone via Claude Code Remote Control, which executes against their Mac. `wrangler` commands and a real shell are therefore available throughout the build. One exception: `npx wrangler login` is interactive and browser-based, so the owner must complete it themselves in the browser before deployment.

**Rationale:** All four spec §0 owner inputs are now answered and recorded. No more owner questions are needed before proceeding to Phase 0 development.

**Spec ref:** §0 ("Before you write code, get four things from the owner"), §2 ("Domain and DNS"), §3, §3.1, §13 #11 (start date), Appendix B ("Deploy").

**Status:** **FULLY RESOLVED** — all four spec §0 owner inputs answered and no further owner input required to start Phase 0.

---

### 2026-08-23 — Password hash seeding: bootstrap-on-first-request instead of migration seed

**Decision:** Spec §3.1 says the PBKDF2 password hash is "seeded on first migration from secret
`INITIAL_FAMILY_PASSWORD`." A static `.sql` migration file cannot read a Cloudflare secret at
apply time, so `migrations/0002_seed.sql` deliberately leaves `app_config.family_password_hash`
and `app_config.family_password_salt` unset — every other seed key from spec §5's table is
inserted, those two are not. Instead, `functions/_lib/passwordBootstrap.ts` derives the PBKDF2
hash (600k iterations, 16-byte random salt, WebCrypto) from `env.INITIAL_FAMILY_PASSWORD` the
first time `/api/auth/login` needs a password record and no `app_config` row exists yet, then
writes both keys with `INSERT OR IGNORE` inside a single D1 batch (transactional), and re-reads
afterward. This makes two cold requests racing on the very first login converge on one salt/hash
pair rather than each trusting its own locally derived values. If `app_config` has no hash and
`INITIAL_FAMILY_PASSWORD` is also absent (secret not yet set), login fails safe with a generic 500
and no detail leaked, rather than falling back to any default.

**Rationale:** This is the only way to honor "seeded from the secret" given Cloudflare's
constraints — migrations are plain SQL with no secret access, while Pages Functions can read
secrets via `env`. Bootstrapping in the Function layer, gated on "does a hash already exist,"
keeps the behavior effectively identical to a migration-time seed (happens once, before any real
login) without requiring a secret at migration time. This is a reversible, mechanical resolution
of an implementation-detail ambiguity — the schema, hashing algorithm, and cookie design are
unchanged from spec — so it's recorded here per the reversible-ambiguity path rather than treated
as a stop-and-ask.

**Spec ref:** §3.1 ("Gate: one shared family password"), §5 (`app_config` seed keys table).

**Status:** RESOLVED.

---

### 2026-08-23 — PBKDF2 iterations reduced to 100,000 (Workers platform cap)

**Decision:** PBKDF2 iterations reduced from spec §3.1's 600,000 to Cloudflare Workers' hard cap of 100,000.

**Rationale:** Production logs showed `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported (requested 600000)`. Workers enforces a hard platform ceiling at 100k iterations. The considered alternative was chaining 6×100k rounds to reach equivalent computational work, but PBKDF2 is CPU-bound and Workers enforce strict CPU-time limits, so this would trade a clean error for intermittent timeouts at peak load. Scrypt and Argon2 are unavailable in Workers WebCrypto. The compensating control is the existing per-IP rate limit of 10 attempts per 15 minutes (spec §3.1) plus the shared-password threat model — the password proves family membership, it does not identify anyone or protect high-value data. The owner explicitly approved this deviation.

**Spec ref:** §3.1 ("Gate: one shared family password").

**Status:** RESOLVED.

---

### 2026-08-23 — Celebration system: subtle-tier ratio cap, and additive optional fields on `CelebrationTrigger`

**Decision (1 of 2):** Under the `subtle` device setting, `playCelebration` caps the effective
ratio at `0.33` — the top edge of the escalation table's two "barely there" rows — rather than the
approved mockup's illustrative cap of `0.5` (which reaches the "small" tier).

**Rationale:** Spec §11.2 describes `subtle` as "bottom-tier flicks... only; no top-tier
fireworks." Read literally against the escalation table, "bottom-tier" names the two ~0.17/~0.33
"barely there" rows specifically, not the ~0.5 "small" row. The mockup's own header comment marks
only the escalation curve in `TIERS()` as binding — the app-shell `celebrate()` wrapper that
applies the subtle cap is explicitly illustrative, so its `0.5` value carries no special weight
here. This is reversible (a single constant, `SUBTLE_RATIO_CAP` in `src/lib/celebration.ts`) and
cheap to change if the owner or a later reviewer prefers the mockup's looser reading.

**Decision (2 of 2):** `CelebrationTrigger` (the pinned Phase 2a/2b contract) gains two **optional**
fields not in the original two-field signature: `color?: string` and
`origin?: { x: number; y: number }`. Both required fields (`pointsAfter`, `maxPointsForDay`) are
unchanged, so any call already written against the original signature still compiles and runs
(falling back to a neutral default color and a center-ish origin).

**Rationale:** Spec §11.2 requires bursts in "the user's color" and originating from "the tap
coordinates," but the pinned two-field contract has no way to express either. Adding required
fields would break Phase 2a's already-written calls; adding them as optional preserves backward
compatibility while making full spec fidelity reachable for whoever wires up the real Today-screen
call site. Flagged prominently in the Phase 2b final report per the task's instruction to call out
any signature change, even though this one is additive/non-breaking.

**Spec ref:** §11.2 ("The setting", "All bursts originate at the tap coordinates", the escalation
table).

**Status:** RESOLVED.

---

### 2026-08-24 — Phase 3C Settings: six reversible scope decisions

**Decision:** Six small implementation-detail choices, all reversible, all documented in
`Docs/PHASE3C_LOG.md` in full — summarized here:

1. Drag-reorder (people, rules) is repeated `PATCH .../:id {sort_order}` calls computed
   client-side, not a new bulk-reorder endpoint — the published contract already carries
   `sort_order` on both `UpdateUserRequest` and `UpdateRuleRequest`.
2. "Adding mid-challenge sets `active_from` to that date" (§8.7) is a Settings-form default, not a
   server default: the client sends `active_from: serverToday` only when `serverToday >
   challenge_start`, otherwise omits it (since-challenge-start semantics unchanged). Always
   forward-dated, so §4.4's backdating warning never applies to people.
3. The rule-backdate confirm dialog's "how many past days it opens" (§4.4) is
   `daysBetween(effective_from, serverToday)` — pure calendar arithmetic in `src/lib/dates.ts`, not
   a count of existing `log_entries` rows.
4. Changing `challenge_start`/`challenge_end` in Settings warns with descriptive text ("entries
   outside the new window are hidden from standings, never deleted") rather than an exact affected-
   row count, which would need a new aggregate endpoint outside the published §9 contract.
5. Color-uniqueness (`ux_users_color_active`) is checked proactively with a `SELECT` before
   INSERT/UPDATE in `functions/api/users/**`, not by catching the D1 unique-constraint error.
6. Archiving a person defaults `active_to` to `serverToday` when the client omits it; setting
   `status` back to `'active'` clears `active_to` unless the client supplies a new one — matches
   §8.7's "archiving is reversible."

**Rationale:** All six are implementation details the spec leaves open, cheap to reverse, and none
change the wire contract in `src/types.ts`/`src/api.ts` that the 3A/3B tracks also depend on.

**Spec ref:** §4.4, §6, §8.7, §9.

**Status:** RESOLVED.

---

### 2026-08-24 — Phase 4A PWA shell: CSP directives and style-src requirements

**Decision:** Content Security Policy headers added in `functions/_middleware.ts` (spec §12
implementation). Directive set:

- Base: `default-src 'self'`
- Scripts: `script-src 'self'` (no inline)
- Styles: `style-src 'self' 'unsafe-inline'` (inline styles required)
- Images: `img-src 'self' data:`
- Fonts: `font-src 'self'`
- Connections: `connect-src 'self'`
- Workers: `worker-src 'self'` (service worker)
- Other: `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`

**Style-src justification:** A grep of `src/` found 283 instances of React inline `style={{...}}`
attributes used to apply per-user color ramps dynamically at runtime (e.g., `--u-color`,
`--u-100` through `--u-500` CSS variables). This is the only way to color the app chrome
per-person without a stylesheet bloat or a build-time color split. Since inline *styles* are
essential, `style-src 'self' 'unsafe-inline'` is required and correct. Inline *scripts* are not
used anywhere, so `script-src` remains `'self'` only (no `'unsafe-eval'`, no `'unsafe-inline'`).

**Rationale:** CSP was deferred until the design system settled (earlier DECISIONS.md entry). It
has now settled; inline styles are structural to the design approach, not a patch or workaround.

**Spec ref:** §12 ("CSP restricted to `'self'`"), §7 (color palette assignment per person),
§11.1 (tint-step color ramps via CSS variables).

**Status:** RESOLVED.

---

### 2026-08-24 — Phase 3B Standings: mockup/spec conflicts and reversible calls

**Decision (1 of 5) — radar completion-rate denominator.** Uses `eligible_days` (days the rule was
effective AND the user was active), per `RuleStatsEntry`'s own doc comment in `src/types.ts`, not
the mockup's simpler `days.length` (days the person actually logged anything). **Rationale:** the
denominator is a behavior decision; CLAUDE.md's precedence rule gives behavior to the spec/contract
over the mockup's illustrative demo data, and `types.ts` is itself the already-resolved parallelism
contract from Phase 1b. **Spec ref:** §8.5 #3, `src/types.ts` `RuleStatsEntry`. **Status:** RESOLVED.

**Decision (2 of 5) — a real Consistency widget, which the mockup never built.** Spec §8.5 #4
requires "days logged and average points per logged day, per person" as its own widget; the
mockup's `StandingsScreen` computes `days`/`avg` internally but never renders them anywhere. Built
it (in the mockup's visual language — Card/SectionTitle/mono numerals), reusing the leaderboard
response's existing per-entry fields rather than a new endpoint. **Rationale:** an entire required
widget is a behavior gap, not a visual nuance, so the spec wins. **Spec ref:** §8.5 #4.
**Status:** RESOLVED.

**Decision (3 of 5) — ties are general, not leader-only.** The mockup's tie handling only special-
cases a tie at rank 1 (`tie = totals.filter(t => t.pts === top).length > 1`); a tie at any other
rank silently renders as untied, sequential positions in the demo. Implemented general standard-
competition ranking (ties share the lower rank, T-prefixed, at ANY position; the next distinct
score skips ahead). **Rationale:** spec §8.5's tie text is general ("ties display as a shared
position"), not restricted to the leader; the mockup's narrower behavior looks like an artifact of
its demo data never exercising a non-leader tie, not a deliberate restriction. **Spec ref:** §8.5
#1, §13#2. **Status:** RESOLVED.

**Decision (4 of 5) — the ribbon is always scoped to one selected month, independent of the
leaderboard/radar/consistency month-vs-all-time tab.** Neither the spec nor the mockup resolves
what an "all-time" ribbon means; the ribbon API (`RibbonQuery{month}`) has no all-time shape, and a
181-day-wide strip isn't legible at 390px regardless. The ribbon section always renders
`selectedMonth` (defaulting to the current month, changeable via the same month-picker the "month"
tab's label opens), even while the top segmented control reads "All time." **Rationale:**
reversible, cheap to change; the alternative (hiding the ribbon under "All time") seemed worse for
a signature element the spec says to "spend the visual ambition" on. **Spec ref:** §8.5 #2.
**Status:** RESOLVED — reversible if the owner wants a different treatment.

**Decision (5 of 5) — `RibbonDayCell` gained an additive `eligible: boolean` field.** Spec §9's
weight-privacy sentence aside, the original contract had no way to distinguish "this day is before
the person joined / after they were archived" from "eligible but simply unlogged" — both would
otherwise render as the same empty-with-hairline-border segment. Added `eligible: boolean` to
`RibbonDayCell` in `src/types.ts` (additive, non-breaking; `RibbonResponse`/`RibbonUserRow`/
`src/api.ts`'s `getRibbon` signature are all unchanged). **Rationale:** the parallelism contract's
own rule ("a track that needs a shape change edits `types.ts` first and says so") — no other track
reads `RibbonResponse` yet, so there is no collision risk. **Spec ref:** §5/§9 `active_from`/
`active_to`, §8.5 #2. **Status:** RESOLVED.

### 2026-08-24 — Phase 4B Offline sync: retry boundary, weight bounds duplication, no flushed celebration

**Decision (1 of 3) — a 5xx from the server queues for retry, exactly like a genuine network
failure; only a 4xx throws immediately.** The brief's wording ("a network/offline failure — not a
4xx — enqueues") is read as drawing the line at 4xx specifically, not at "any HTTP response versus
no response." `queuedPutLog`/`queuedPutWeight` treat any thrown non-`ApiError` (real transport
failure) or an `ApiError` with a 500-599 code as retryable-and-queue; only a 400-499 `ApiError`
still throws. `flushQueue`'s mirror-image rule drops a per-op 4xx result from the queue (it will
never succeed on replay) but keeps a 5xx result queued for the next attempt. **Rationale:** a 5xx
is transient server trouble, exactly the class of failure retrying later is meant to paper over;
surfacing it as an immediate, unactionable error to someone mid-checkbox-tap would be worse than
queuing it. **Spec ref:** §10. **Status:** RESOLVED — reversible if the owner wants 5xx to surface
immediately instead.

**Decision (2 of 3) — the weight sanity-clamp bounds (1/1000 lb) are duplicated as local constants
in the new `functions/_lib/sync.ts` rather than exported from `functions/api/weights/[userId]/
[date].ts`.** That route file is outside this track's owned-files list. **Rationale:** avoiding an
edit to a file another track could be touching concurrently was judged worth one small duplicated
literal pair, especially since the existing route's own comment already frames it as "a sanity
clamp, not a medical bound" rather than a value with real business meaning that could drift.
**Spec ref:** §9 ("validate value against rule type"). **Status:** RESOLVED — trivial to collapse
into one shared export later if a future track touches that route anyway.

**Decision (3 of 3) — a write that goes offline never celebrates, even after its queue entry later
flushes successfully.** `celebrateIfNewTier` (spec §11.2) needs a real server-computed
`DayLogState` to derive the points ratio from; a queued write has none yet, and `flushQueue` talks
to `/api/sync/batch` directly rather than re-entering `Today.tsx`, so there is no later moment this
screen's code runs again on that specific op's behalf even once the flush succeeds. **Rationale:**
routing flush results back into a screen that may no longer be mounted is real added complexity for
a light-gamification feature the spec itself calls secondary to logging; a rare missed celebration
on a momentarily-offline checkbox tap is an acceptable, honestly-scoped gap. **Spec ref:** §10,
§11.2. **Status:** RESOLVED.

### 2026-08-24 — Weight percent-lost requires at least two entries, not just a nonzero baseline

**Decision — `computePercentLost` (`src/lib/weight.ts`) and `computeWeightPercentLost`
(`functions/_lib/stats.ts`) both return `null` for exactly one weight entry, not just for zero.**
With a single entry, baseline and "most recent" resolve to the same row, so the formula's only
possible output is 0% — which reads as "no progress made" when the truth is "not enough data yet."
`functions/_lib/stats.ts` folds an entry count into its existing single-query `SELECT` (no second
round trip) and gates on it alongside the existing zero-baseline guard; `loadWeightStatsEntries`'s
pre-existing `if (percentLost === null) continue` then correctly drops a single-weigh-in person out
of the weight standings, same as someone with no entries. **Rationale:** spec §8.6 defines the
percentage formula but is silent on the single-entry case; treating it as "no data yet" rather than
"0% progress" matches how every other null case in this module is already read by callers, and
avoids a person's first weigh-in ever displaying as a discouraging flat 0%. **Spec ref:** §8.6,
§8.5 #5, §9. **Status:** RESOLVED.

### 2026-08-24 — Phase 5B backups: manual export is the guaranteed path; scheduled Worker written but undeployed

**Decision:** Spec §12 asks for "scheduled weekly D1 export to R2, or at minimum a documented
manual `wrangler d1 export` procedure" and explicitly sanctions the manual path as acceptable.
Verified against current Cloudflare docs
([pages/functions/bindings](https://developers.cloudflare.com/pages/functions/bindings/),
[workers/configuration/cron-triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/))
that Pages Functions have no scheduled/cron handler today — Cron Triggers are documented only
for standalone Workers via `[triggers]`/`crons` + a `scheduled()` handler. A scheduled export
therefore requires a second, independently-deployed Worker with its own `wrangler.toml` and a
new R2 bucket. Wrote that Worker in `backup/` (D1 -> R2, weekly, with retention pruning) but
left it **entirely undeployed** — no R2 bucket created, no `wrangler deploy` run — since
provisioning a new cloud resource and a second deployment is the owner's call, not a decision
an agent makes silently. The manual `wrangler d1 export` / restore procedure documented in
`README.md` is the one actually verified against the real production database (a scratch
export was run to a path outside the repo and deleted immediately after inspection) and is the
procedure to treat as load-bearing.

**Rationale:** Spec §12's "or at minimum" is a real fork, not a fallback to apologize for; doing
unrequested cloud provisioning to reach the "better" option would violate CLAUDE.md's scope
discipline and the owner-approval bar for account changes. Writing the scheduled path's code
without deploying it preserves the option at zero cost and zero risk.

**Spec ref:** §12 ("Backups").

**Status:** RESOLVED — manual procedure is live documentation; scheduled Worker is written,
reviewed, and undeployed pending explicit owner action per `backup/README.md`.
