# ADR Audit — hnch

**Date:** 2026-04-26 (revised after plan-critic review)
**Scope:** All 20 ADRs in `adr/` plus cross-reference docs (`CLAUDE.md`, `project.md`, `schema.md`, `ux.md`, `roadmap.md`, `angular.md`, `ionic.md`, `cli.md`).
**Method:** ADRs read directly; codebase verified via 5 parallel researchers across relay, client-core, scales/prefs, URLs/QR/e2e, and CLI/misc. Revised after critic challenge round (see Critic Responses at end).

---

## TL;DR

- **No load-bearing drift.** Every Accepted ADR's headline claim is honored by the code. The only ADR-vs-code discrepancy is a *narrow* one in ADR-0008: room codes are quarantined for the snapshot TTL via room ownership (correct), but the *additional* `retired` defense-in-depth window described in `code-pool.ts` doc-comments is unimplemented. This is a stale code comment, not an architectural drift.
- **ADR-0011 / ADR-0015 are correctly Superseded by ADR-0018 in their headers, but `adr/README.md` index still shows them as Accepted** — stale cross-link health, typo-class.
- **The real findings are missing ADRs.** Five structural decisions are visible in code today with no ADR backing:
  1. CLI package (existence, parity contract, identity divergence from ADR-0005, persistence path divergence from ADR-0004)
  2. Last-session cache shape + 24h TTL invariant aligned to ADR-0012
  3. Session-end-for-everyone semantics (`meta.sessionEndedAt` doc broadcast)
  4. Participant cap (20, relay-enforced, close code 4006 active)
  5. Reconnect/backoff workaround (debugged-into-existence Chromium offline-mode reset at `sync-provider.ts:209-222`)
- **Two implicit governance decisions to make explicit pre-launch:**
  - Test-only relay surfaces (`HNCH_ENABLE_TEST_ROUTES`, `HNCH_ROOM_CAP`) — admission behavior is env-var-controlled in production code paths.
  - No analytics / telemetry / crash-reporting decision exists. Privacy-relevant non-decision.
- **No ADR needs to be rewritten.** ADR-0009's invite-only sections are misleading post-ADR-0017 — fix with a one-line status note (typo-class). Long ADRs (0001, 0014, 0016) earn their length.

**Recommended actions in priority order:**

| # | Action | Type | Target |
|---|---|---|---|
| 1 | Clarify `code-pool.ts:78-84` comment to match actual TTL-bound retirement; optionally typo-class-clarify ADR-0008 cross-ref | CODE-COMMENT-FIX (+ optional typo-class ADR edit) | ADR-0008 |
| 2 | Fix `adr/README.md` index: ADR-0011 and ADR-0015 → "Superseded by ADR-0018" | INDEX-FIX (typo-class) | adr/README.md |
| 3 | Write ADR for CLI package — existence, parity rule, identity & persistence divergence | WRITE NEW | (new) |
| 4 | Write ADR for last-session cache — 24h-TTL-aligned-to-ADR-0012 cross-package invariant | WRITE NEW | (new) |
| 5 | Write ADR for session-end-for-everyone — doc-broadcast vs alternatives, idempotency, ADR-0010 interaction | WRITE NEW | (new) |
| 6 | Write ADR for participant cap (20) — relay enforcement, **canonically activates close code 4006**, cross-link from ADR-0016 | WRITE NEW | (new) |
| 7 | Write ADR for reconnect/backoff posture — y-websocket default + `onOnline` Chromium workaround | WRITE NEW (short) | (new) |
| 8 | Write ADR for deep-link URL format `/join?code=XXXXXX` (public contract, AASA target) | WRITE NEW | (new) |
| 9 | Write ADR (or note in ADR for #3 above) covering test-only relay surfaces (`HNCH_ENABLE_TEST_ROUTES`, `HNCH_ROOM_CAP`) | WRITE NEW (short) | (new) |
| 10 | Decide and document the no-analytics / no-telemetry / no-crash-reporting posture pre-launch | WRITE NEW (short) | (new) |
| 11 | Minor-correct ADR-0014 to mention `cli` and `e2e` packages | typo-class | ADR-0014 |
| 12 | Minor cross-link from ADR-0016 to the new participant-cap ADR (resolves 4006 status without inline edit) | typo-class | ADR-0016 |
| 13 | Minor cross-link from ADR-0009 to ADR-0017 noting invite-only is dropped in v1 | typo-class | ADR-0009 |
| 14 | (Optional) Add note to ADR-0018 acknowledging it overrules ADR-0015's explicit rejection of unanimous reveal | typo-class | ADR-0018 |

Items 1–2 are factual fixes (~10 minutes each). Items 3–10 are missing-ADR work (~3-4 hours total). Items 11–14 are typo-class corrections allowed under CLAUDE.md immutability rules.

---

## Per-ADR Status Table

Status legend:
- **Live** — Accepted, decision matches code, no rot.
- **Superseded** — explicitly replaced by a later ADR.
- **Drift** — ADR claims something the code doesn't honor.
- **Stale-fact** — ADR is conceptually correct but contains an outdated factual claim (typo-class fix).

| # | Title | Status | Load-bearing | Bloat | Notes |
|---|---|---|---|---|---|
| 0001 | Networking — CRDT over relay | Live | Yes | Medium-High | 87 lines. Foundational; references separate `networking-analysis.md` doc. Worth its length. |
| 0002 | Frontend framework | Live | Yes | Medium | Standard tech-pick ADR. |
| 0003 | State sync — Yjs | Live | Yes | Medium | Tight. Provider-ecosystem rationale still applies. |
| 0004 | Local persistence (SQLite + IndexedDB) | Live | Yes | Medium | Tight. CLI's config-JSON path is an unstated divergence — should be covered by the new CLI ADR. |
| 0005 | Device identity (Capacitor Device) | Live | Yes | Medium | Tight. CLI uses generated UUID, not `Device.getId()` — unstated divergence, covered by new CLI ADR. |
| 0006 | Ephemeral sessions | Live | Yes | Low | Tight. |
| 0007 | Teams local-only | Live | Yes (architecturally) | Low | Conceptually load-bearing even with no Team UI. |
| 0008 | Room code format & lifecycle | Live (with stale code comment) | Yes | Low | Code-vs-ADR alignment is correct: `RoomRecord.deleteRoom()` is invoked only by the snapshot sweeper after the 24h TTL elapses (`snapshot.ts:69-71` → `room-store.ts:157-167` → `codePool.release()`). The TTL-bound retirement IS implemented. The narrower gap: `code-pool.ts:78-84` describes an *additional* retirement quarantine (the `retired` set) that's never populated. This was meant as defense-in-depth against returning peers landing in a freshly-minted unrelated room *during* sweeper jitter. Not architecturally significant; mostly a stale doc-comment. |
| 0009 | Access control — relay tokens | Live (with deprecated section) | Yes | Medium | Half of body (invite-only flow) is **misleading** — superseded de-facto by ADR-0017 but the body still reads as live. Add cross-link header note (typo-class). |
| 0010 | Host election | Live | Yes | Medium | Code matches: 5s debounce, lowest-peer-ID tiebreak, no-reclaim. |
| 0011 | Timer authority | Superseded by 0018 (header correct; **README index stale**) | No | — | File header says "Superseded by ADR-0018" but `adr/README.md:33` still lists "Accepted". |
| 0012 | Snapshot policy (24h in-mem) | Live | Yes | Medium | Implemented correctly. |
| 0013 | Round model — flat + parentRoundId | Live | Yes | Medium | Action-item field list out of date but ADR-0015 already cross-references; adequate. |
| 0014 | Repo layout — pnpm workspaces | Stale-fact | Yes | High | Lists only `client/relay/shared` — missing `cli` and `e2e`. Decision still correct. |
| 0015 | v1 scope — session-level reveal/timer | Superseded by 0018 (header correct; **README index stale**) | No | — | File header correct; `adr/README.md:37` shows "Accepted". |
| 0016 | Client ↔ relay handshake | Live with stale-fact | Yes | High | Close code 4006 marked "reserved; unused in v1" but is now actively used (`server.ts:295-298` + `e2e/room-full.spec.ts`). Inline edit would be substantive — fix instead by cross-link to new participant-cap ADR. |
| 0017 | Password hashing & invite-only removal | Live | Yes | Medium | Verified end-to-end. |
| 0018 | Remove timer; add unanimous reveal | Live | Yes | Low | Tight. **Mild gap:** doesn't acknowledge that ADR-0015 explicitly rejected unanimous reveal ("creates pressure on slow voters and surprises participants"). Supersession is correct, but a cross-reference paragraph explaining the reversal would help future readers. Optional typo-class note. |
| 0019 | Scale customization | Live | Yes | Medium | Verified end-to-end. |
| 0020 | Voter/Viewer role | Live | Yes | Low | Verified end-to-end. |

---

## Findings by Audit Question

### 1. Compaction candidates

ADRs that could be tightened without losing decision history:

- **ADR-0001 (87 lines).** Long but earns it — sets the architectural foundation. **Recommendation: leave.**
- **ADR-0014 (125 lines).** Longest ADR. Could be trimmed without losing rationale. **Recommendation: leave** — apply only the minor `cli` / `e2e` correction.
- **ADR-0016 (144 lines).** Long but earns it. **Recommendation: leave** — fix close-code 4006 status by cross-link, not inline edit.
- **ADR-0009 (~100 lines).** Half of body still describes the invite-only flow that ADR-0017 dropped. **Recommendation: add a one-line "Status update" near the top: *Invite-only path dropped from v1 by ADR-0017; password-only enforcement is the live behavior.* No body rewrite — that would violate immutability.**

No ADR is bloated enough to warrant a rewrite.

### 2. Stale / superseded ADRs

- **ADR-0011 + ADR-0015.** File headers correctly say "Superseded by ADR-0018", but `adr/README.md` index still shows them as **Accepted**. Typo-class fix to the index.
- **ADR-0009.** Invite-only sections silently retired by ADR-0017; body still reads as live. Add cross-link note.
- **ADR-0008.** Not drifted. The TTL-bound retirement window IS implemented (rooms live in RAM for 24h post-disconnect; `deleteRoom` called by sweeper releases the code). The unimplemented part is the *extra* `retired` set declared in `code-pool.ts:62-63` and explained in the file header — meant as defense-in-depth against sweep-cadence jitter. The misleading text is the code comment, not the ADR. **Action: clarify `code-pool.ts:78-84` comment to drop the "until then, immediately reusable" claim** (since release is in fact only called post-TTL via the sweeper). Optionally add a typo-class ADR-0008 footnote noting that the additional `retired` quarantine is currently unimplemented and the protection comes from the sweeper.
- **ADR-0014.** `cli` and `e2e` packages added without ADR amendment. The decision (pnpm workspaces) is still correct; only the package list is stale. Defer to the CLI ADR (covers `cli`); add typo-class one-liner mentioning `e2e`.
- **ADR-0016.** Close-code 4006 is active in code. **Per CLAUDE.md immutability** ("substantive change requires a new ADR"), do NOT inline-edit the table. Instead, the new participant-cap ADR canonically activates 4006, with a one-line cross-link pointer added to ADR-0016. This stays within typo-class.
- **ADR-0013.** Action-item list is outdated but ADR-0015's body explicitly notes this; supersession chain is sufficient.
- **ADR-0018.** Decision is correct and code matches. Mild governance gap: doesn't engage with ADR-0015's explicit *rejection* of unanimous reveal. Optional typo-class addition: a sentence acknowledging the reversal and why (pressure-on-slow-voters concern was overruled by user expectation parity with peer products).

### 3. Missing ADRs (structural decisions present in code with no ADR)

These are the real governance gaps. Listed in priority order.

#### M1. CLI package existence + parity contract

**What's there:** `packages/cli` ships as `@hnch/cli` — Ink + Yargs terminal client speaking the same Yjs/relay protocol. `cli.md` documents conventions and asserts "no feature delta." The package is a v1 deliverable per `project.md`'s status section.

**Why it's structural:** Adds a fourth deliverable. Asserts a parity contract that constrains every future session-behavior change. Affects ADR-0014's repo layout. **Diverges from ADR-0004** (CLI persists to `~/.config/hnch/`, not Capacitor Preferences — the WKWebView eviction rationale doesn't apply to TTY) and **diverges from ADR-0005** (CLI generates a UUID at install rather than calling `Device.getId()`, which is Capacitor-only).

**What an ADR should pin:** existence + scope + parity rule + persistence path divergence (config JSON vs Capacitor) with explicit ADR-0004 relaxation + identity divergence (generated UUID) with explicit ADR-0005 relaxation. Also pins that CLI is a parity *smoke-test* surface, used for cross-client e2e.

#### M2. Last-session cache shape and TTL

**What's there:** Both client and CLI persist a "last session" record. Shape lives in `packages/shared/src/last-session.ts`, fields `{roomCode, roomUuid, lastScreen, lastSeenAt}` (+ optional `passwordHash` on CLI). 24h TTL aligned to ADR-0012.

**Why it's structural:** This is a *cross-package* invariant: the 24h cache TTL must align with the relay's snapshot TTL. Drift on either side breaks rejoin. The invariant — *"last-session cache TTL ≤ snapshot TTL"* — is the load-bearing decision; the field list is implementation detail.

**What an ADR should pin:** the cross-package invariant first, the shape second. Cross-link from ADR-0012 (relay TTL) and the new CLI ADR (persistence path divergence). Eviction rule: relay returns `unknown-room` → cache cleared client-side.

#### M3. Session-end-for-everyone semantics

**What's there:** Host writes `meta.sessionEndedAt` to the Yjs doc; all clients observe and navigate home with a toast (`SessionEndService`). No ADR.

**Why it's structural:** A choice between (a) doc-broadcast (current), (b) relay close, (c) per-client leave-on-host-leave. Each has different failure modes for offline peers. Has non-obvious interaction with ADR-0010 (host election) and ADR-0012 (snapshot post-end).

**What an ADR should pin:** doc-broadcast over relay-close rationale, idempotency, offline-peer behavior, snapshot lifecycle after end, `lastSession` cache cleanup.

#### M4. Participant cap (20)

**What's there:** `MAX_ROOM_PARTICIPANTS = 20` in `packages/shared/src/auth.ts:105`. Enforced relay-side at WS upgrade — over-cap rejects with close code 4006.

**Why it's structural:** Decides who enforces the cap (relay vs client soft-cap), what UX appears, how the number was chosen. **Canonically activates close code 4006**, resolving the ADR-0016 stale-fact via cross-link rather than inline edit (immutability-respecting).

**What an ADR should pin:** the number 20, where it's enforced (relay), what the user sees on rejection, why a soft client-side cap isn't also added. ADR-0001 mentions ≤20 as a sizing assumption — this ADR makes it a contract.

#### M5. Reconnect/backoff posture

**What's there:** y-websocket default exponential backoff with explicit `onOnline` reset (`packages/client/src/app/core/doc/sync-provider.ts:209-222`) — a debugged-into-existence workaround for a Chromium offline-mode quirk where the socket reports connected but doesn't deliver messages until forced to reconnect.

**Why it's structural:** Exactly the "hard to reconstruct from code in 6 months" trigger for an ADR. The workaround looks weird without context — why are we *closing* a connected socket on `online`? A future contributor will rip it out and rediscover the bug. The decision (lean on y-websocket defaults rather than write a custom retry layer) is also worth pinning.

**What an ADR should pin:** lean on y-websocket defaults + explicit `onOnline` reset + the Chromium quirk reference. Short — ~30 lines.

#### M6. Deep-link / invite URL format

**What's there:** `${appBaseUrl}/join?code=XXXXXX` (no dashes), case-insensitive code, password not in URL. Public contract via QR codes and universal-link AASA target in Phase 6b.

**Why it's structural:** Public contract. Changing it later breaks every printed QR code. AASA file binding in iOS native build.

**What an ADR should pin:** path, query param name, dash-strip, case rules, password-not-in-URL (security-relevant), interaction with onboarding pending-join resume.

#### M7. Test-only relay surfaces

**What's there:** Production relay code reads `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP` env vars. The e2e harness sets `HNCH_ROOM_CAP=3, HNCH_ENABLE_TEST_ROUTES=1` (`packages/e2e/playwright.config.ts:24-36`).

**Why it's structural:** Env-var-controlled admission behavior in production code is a *security adjacency* to ADR-0009. A misconfigured deploy could expose test routes or weaken the cap. Should be either documented in a short ADR or cross-referenced into the participant-cap ADR (M4) and ADR-0009.

**What an ADR should pin:** the env vars, what they control, that they default to *off* (test-mode disabled, full cap), and the deploy-time check that ensures they aren't set in production. Could be a sub-section of M4 (participant cap) since both touch admission, or a standalone short ADR.

#### M8. Analytics / telemetry / crash-reporting posture

**What's there:** Nothing. No analytics SDK, no Sentry/equivalent. `console.error` only.

**Why it's structural:** Privacy-relevant *non-decision*. A future contributor adding Sentry "for free" would silently violate ADR-0001's privacy posture (server-side telemetry receives session data, even hashed). Pre-launch this should be made explicit: either "no telemetry in v1, decision deferred" or "opt-in only, with anonymization rules." Currently it's silence.

**What an ADR should pin:** no telemetry in v1 (simplest); revisit-trigger if user reports become unactionable. Short — ~25 lines.

### 4. Implicit decisions in non-ADR docs that should be ADRs or cross-referenced

- **Reconnect/retry** → covered by M5 above.
- **QR encoding** (string = URL only, lib = `qrcode`, error correction `'M'`, base64 PNG output) — not structural enough for a full ADR. Add to a future "client conventions" doc or footnote in M6.
- **Logging posture** — `roadmap.md §10` claims "console.debug gated by boot flag (client) + console.log with structured prefix (relay)." Code uses raw `console.error`/`console.log`. Either drop the claim from roadmap or implement it. No ADR needed; doc-vs-code drift fix.
- **e2e harness conventions** — dual webServer launch, multi-context fixture, storage-cleanup preserving identity. Not structural; lives in `playwright.config.ts` + `app.fixture.ts`. The env-var surface (`HNCH_ROOM_CAP`, `HNCH_ENABLE_TEST_ROUTES`) is structural and covered by M7.
- **Theme system** — `ThemeService` class-toggle, three-mode, pre-paint init. Documented in `ionic.md`. **Removed from missing-ADR list per critic review:** the choice is not "a reasonable contributor could have made differently" — Ionic strongly recommends class-toggle for explicit user-override scenarios; `dark.system.css` is the alternative only when there's no Settings toggle. The pre-paint init is the only mildly subtle bit, and it's well-documented in `ionic.md`. Below the ADR bar.

### 5. Implementation drift not in ADR scope

- **ADR-0008** — narrow stale-comment in `code-pool.ts:78-84`, see §2. Not architectural drift.
- All other ADR claims verified to match code. Researchers found zero drift on host election, password hashing, scales, viewer/voter role, snapshot policy, handshake (modulo 4006 status), password compare, or sentinel removal.

---

## Recommendations — Detailed

### Priority 1: Clarify the ADR-0008 / `code-pool.ts` story

The misleading artifact is a code comment, not the ADR. Edit `packages/relay/src/code-pool.ts:78-84` to reflect actual behavior: codes are released only when `deleteRoom()` is called, which is invoked only by the snapshot sweeper post-TTL. The `retired` set was reserved for an additional sweep-jitter quarantine that v1 doesn't need. Optionally add a typo-class ADR-0008 footnote noting where retirement actually happens (room-store.ts → snapshot.ts) so a reader doesn't have to trace it.

**Don't supersede ADR-0008**, **don't write a new ADR**, **don't restructure the code-pool**. The behavior is correct.

### Priority 2: Fix `adr/README.md` index

Lines 33 and 37 still list ADR-0011 and ADR-0015 as "Accepted". Change to "Superseded by ADR-0018". Typo-class.

### Priority 3–10: Write missing ADRs

In recommended order:

1. **CLI package + parity contract** (M1) — blocks parity-rule enforcement and resolves ADR-0004 + ADR-0005 silent divergences.
2. **Last-session cache** (M2) — pins cross-package TTL invariant, depends on CLI ADR.
3. **Participant cap** (M4) — canonically activates close code 4006, resolves ADR-0016 stale-fact.
4. **Session-end-for-everyone** (M3) — pins doc-broadcast and ADR-0010 interaction.
5. **Reconnect/backoff posture** (M5) — short ADR; pins workaround + Chromium reference.
6. **Deep-link URL format** (M6) — public contract, AASA target.
7. **Test-only relay surfaces** (M7) — short ADR or sub-section of M4.
8. **Analytics / telemetry posture** (M8) — short ADR; pre-launch governance.

Each is small (~30-60 lines using the template). Combined effort: ~3-4 hours.

### Priority 11–14: Typo-class corrections (allowed by CLAUDE.md immutability rule)

11. **ADR-0014** — add a one-liner mentioning `cli` and `e2e` packages. Or defer the `cli` mention to the CLI ADR cross-link.
12. **ADR-0016** — add cross-link to the new participant-cap ADR (do NOT inline-edit the close-code table).
13. **ADR-0009** — add header status note: *Invite-only dropped from v1 by ADR-0017.*
14. **ADR-0018** (optional) — add a sentence acknowledging the reversal of ADR-0015's unanimous-reveal rejection.

### Priority 15 (optional): documentation hygiene

- Update `roadmap.md §10` to drop the unimplemented logging-flag claim or implement it. Don't leave the doc lying.
- The QR encoding details belong in `ionic.md` or a future "client conventions" doc, not in an ADR.

---

## What NOT to do

- **Don't compact ADRs 0001 / 0014 / 0016 substantially.** They earn their length.
- **Don't merge ADRs.** The supersession trail is the value.
- **Don't preemptively write ADRs for non-decisions.** The bar is "a reasonable contributor could have chosen differently." Theme system, QR encoding, logging posture do not clear it.
- **Don't bypass immutability.** ADR-0016's 4006 status is substantive enough that inline edit would violate the rule. Use cross-link from the new participant-cap ADR.
- **Don't restructure code-pool to match the unimplemented `retired` semantics** unless a real bug surfaces. The TTL-bound retirement via the sweeper is sufficient.

---

## Appendix: cross-reference matrix (ADR claims → code)

| ADR | Claim | Code | Status |
|---|---|---|---|
| 0008 | Codes retired for snapshot TTL window before release | sweep at `snapshot.ts:69-71` → `room-store.ts:157-167` → `codePool.release()` | OK (TTL-bound retirement implemented; extra `retired` set unimplemented but not load-bearing) |
| 0010 | 5s debounce, lowest peer-ID, no-reclaim | `host-election.service.ts:16,28,69-75,97` | OK |
| 0012 | 24h in-memory snapshot, hourly sweep | `snapshot.ts:22-72` | OK |
| 0016 | `GET /rooms/:code` + `WS /ws/:uuid` + close codes | `relay/src/server.ts` | OK except 4006 reserved-vs-active |
| 0017 | PBKDF2-SHA-256 100K, 32B hex, UUID salt, timingSafeEqual | `shared/src/password.ts:8-11,43,51` + `relay/src/server.ts:388-393` | OK |
| 0018 | No timer, no RevealMode, unanimous + manual reveal | grep zero hits for `RevealMode` / `timerDurationMs` / `RoundTimerService` | OK |
| 0019 | 5 builtin presets, sentinels removed, flat wire format | `shared/src/doc.ts:158-195`, `scales.ts:49-70`, `doc.test.ts:58-63` | OK |
| 0020 | `role` field, viewer denominator exclusion, all-viewer guard | `shared/src/doc.ts:79,86-88`, `estimating.page.ts:343-350,512` | OK |

---

## Critic Responses

Plan-critic delivered 11 challenges. Responses:

**#1 (BLOCKING) — ADR-0008 framing wrong.** **Accept.** Code DOES quarantine codes for the full 24h TTL via `RoomRecord` ownership; `deleteRoom()` (which calls `codePool.release()`) is invoked only by the snapshot sweeper post-TTL. The unimplemented part is the *extra* `retired` set in `code-pool.ts`, which was intended as additional defense-in-depth, not the primary protection. **Revised: TL;DR drift claim removed; per-ADR table reclassified to "Live (with stale code comment)"; recommendation changed from "fix-or-supersede" to "clarify code comment + optional typo-class ADR footnote".**

**#2 (SHOULD ADDRESS) — ADR-0015 ↔ ADR-0018 contradiction unaddressed.** **Accept partially.** ADR-0015 explicitly rejected unanimous reveal ("creates pressure on slow voters and surprises participants"). ADR-0018 reverses without engaging. The supersession header is correct procedurally, but a one-sentence acknowledgement of the reversal would help future readers. **Added optional typo-class item #14 to revised action list.**

**#3 (SHOULD ADDRESS) — `adr/README.md` index stale for ADR-0011 / ADR-0015.** **Accept.** Verified: lines 33 and 37 list both as "Accepted" despite Superseded headers. **Promoted to Priority 2 in the revised action list.**

**#5 (SHOULD ADDRESS) — Missed structural decisions.** **Accept all three.**
- (a) Reconnect/backoff: promoted from one-paragraph footnote to its own missing-ADR section (M5).
- (b) `HNCH_ENABLE_TEST_ROUTES` / `HNCH_ROOM_CAP`: promoted from footnote to its own missing-ADR section (M7), with note that it could be sub-section of M4 (cap) if preferred.
- (c) Analytics/telemetry: added as new missing-ADR section (M8) covering pre-launch privacy-posture governance.

**#7 (SHOULD ADDRESS) — ADR-0016 close-code 4006 inline edit violates immutability.** **Accept.** Per CLAUDE.md "substantive change requires a new ADR." **Revised action: M4 (participant-cap ADR) canonically activates 4006; ADR-0016 gets a one-line cross-link only (typo-class).** Original "Priority 9 — minor-correct ADR-0016 close-code table" rewritten as "cross-link from ADR-0016 to new participant-cap ADR."

**#4 (NIT) — M5 (theme) is governance fluff.** **Accept.** Class-toggle vs `dark.system.css` is dictated by Ionic's recommended pattern when explicit user-override is present; a reasonable contributor would not have chosen differently. **Theme system removed from missing-ADR list and explicitly noted in §4 as below the ADR bar.**

**#6 (NIT) — ADR-0009 misleading, not just historically useful.** **Accept.** Strengthened wording in §1 (Compaction candidates) and §2 (Stale ADRs) to call out that the invite-only body is *misleading* to a current reader, not merely "historically useful."

**#8 (NIT) — M1 (CLI ADR) underspecified.** **Accept.** M1 expanded to explicitly cover ADR-0004 divergence (config JSON vs WKWebView-eviction-driven SQLite/IndexedDB) and ADR-0005 divergence (generated UUID vs `Device.getId()`). The CLI ADR explicitly relaxes both ADRs for the TTY context.

**#9 (NIT) — ADR-0008 path: prefer Option C (clarify comment) not A or B.** **Accept.** Adopted as Priority 1 in revised action list.

**#10 (NIT) — M5 contradicts "What NOT to do".** **Accept (but moot after #4).** With theme system removed from missing-ADR list per challenge #4, the contradiction is gone.

**#11 (NIT) — M2 should pin the 24h-TTL-aligned-to-ADR-0012 invariant, not the field list.** **Accept.** M2 rewritten to lead with the cross-package TTL invariant; field list demoted to implementation detail.

**Revisions summary:**
- BLOCKING #1: ADR-0008 reclassified, recommendation rewritten
- #2: optional typo-class item added (ADR-0018 reversal note)
- #3: promoted to Priority 2 (README index fix)
- #5: three new missing-ADR sections added (M5 reconnect, M7 test-routes, M8 telemetry)
- #7: 4006 fix changed to cross-link, not inline edit
- NITs #4, #6, #8, #9, #10, #11 all accepted and folded in
- Action list re-numbered (now 14 items vs original 10)
- TL;DR rewritten to remove drift framing and lead with no-load-bearing-drift
