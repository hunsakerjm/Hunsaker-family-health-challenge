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
