---
title: Audit fixes (post-1.1)
date: 2026-04-26
status: approved
estimate: ~22 story points across 6 stories
---

# Plan: Audit fixes (post-1.1)

## Context

A product audit produced 5 bugs, 4 doc-drift items, 3 UX gaps, 6 test-coverage gaps, plus a vitest Angular harness ask. Bug 1.1 (avatar-vote-row ordering) already shipped in commit `3ae61e8`. This plan covers everything else from the audit. Items grouped into stories by code-area cohesion so reviewer context stays warm per story (per phased-review convention).

The avatar-vote-row regression test was deferred during the bug 1.1 ship because vitest in this repo runs plain esbuild without an Angular component-mount harness — restoring it lives in Story 2 once the harness is wired.

## Approved decisions

All five recommendations accepted by team-lead on 2026-04-26.

- **D1 = A.** Deep-link `/join?code=` auto-submits. Public rooms resolve straight to Lobby; protected rooms show the inline password sheet without a manual Join tap. Matches `ux.md` §4.3.
- **D2 = A.** CLI documented as a shipping surface. New `cli.md` sibling doc; project.md mentions CLI in the target-audience section; roadmap.md cross-cutting cross-links cli.md. CLAUDE.md "full Yjs/relay parity" framing stays.
- **D3 = A.** Muted Jump-back-in banner implemented. Stale entries render at opacity 0.6 with no chevron until tap → toast → clear. Matches `ux.md` §5.2.
- **D4 = A.** `ToastService` helper introduced. Two presets: `info(message)` (top, 2000ms) and `error(message, opts)` (top, 4000ms, close icon). All existing `ToastController.create` call sites migrated. Centralization prevents future drift and gives bug 1.5 a clean toast call site.
- **D5 = A.** Vitest Angular harness wired in Story 2. Reduced-motion test (audit 4.1) lands in Story 6 alongside other test-coverage fixes, depending on the harness.

## User journey

This plan is internal cleanup — it does not introduce a new user-facing flow. User-visible deltas:

1. Reload PWA mid-session → state restored locally without a relay round-trip (bug 1.2).
2. Tap an invite URL → land in Lobby (or password sheet) without a manual Join tap (bug 1.3).
3. Dismiss any half-sheet → focus returns to the element that opened it (bug 1.4).
4. Sustained relay outage → user sees an error toast instead of silent retry (bug 1.5).
5. Tap a stale Jump-back-in banner → muted banner clarifies the room is gone (gap 3.1); toast confirms; banner self-removes.
6. Toasts are consistent: top position, 2000ms info / 4000ms error w/ close (gap 3.2).

## Spec

### Behavioral requirements

**Persistence (bug 1.2).** On PWA, the Yjs doc for a room must be backed by `IndexeddbPersistence` keyed by room UUID, instantiated and `whenSynced`-awaited before the y-websocket provider connects. On native (`Capacitor.isNativePlatform() === true`), the persistence branch is a TODO no-op pointing at Phase 6b SQLite. Leaving a session destroys the persistence provider.

**Deep-link auto-submit (bug 1.3).** When the Join page loads with a `code` query param, after pre-filling the input the page kicks off the same flow as the manual Join tap. If the relay rejects with `password-required` (close code 4002), the password sheet appears inline; otherwise the user resolves to Lobby.

**Focus restore (bug 1.4).** A `presentSheet()` helper captures `document.activeElement` before `modal.present()` and restores it on `didDismiss`. Every half-sheet invocation site uses the helper.

**Repeat-rejection toast (bug 1.5).** The sync provider tracks unknown WS close codes; on a third unknown rejection within a 60-second window, an error toast fires ("Trouble reaching the room — retrying."). Counter resets on successful connect.

**Muted stale banner (gap 3.1).** Jump-back-in banner state has a `stale: boolean` flag. When the relay reports `unknown-room`, the flag flips and the banner renders dimmed (opacity 0.6, no chevron). Tap fires the existing "This room has expired" toast and clears the entry.

**Centralized toasts (gap 3.2).** A `ToastService` exposes `info(message)` and `error(message, { closeIcon? })`. All toasts use top position; info uses 2000ms, error uses 4000ms with close icon. Every existing `ToastController.create` call site migrates.

**Stale CLI dist (bug 1.6).** `packages/cli/dist/` removed from VCS and added to gitignore.

### Interfaces

```ts
// packages/client/src/app/services/toast.service.ts (new)
@Injectable({ providedIn: 'root' })
export class ToastService {
  info(message: string): Promise<void>;
  error(message: string, opts?: { closeIcon?: boolean }): Promise<void>;
}
```

```ts
// packages/client/src/app/utils/present-sheet.ts (new)
export interface PresentSheetOpts {
  modal: HTMLIonModalElement;
}
export function presentSheet(opts: PresentSheetOpts): Promise<unknown>;
```

```ts
// packages/client/src/app/services/doc.service.ts (modified)
// new platform-detection branch in the two existing `new Y.Doc()` sites
```

### Data flow

- Persistence (bug 1.2): On Lobby/Estimating mount → `Y.Doc()` instantiated → if PWA, attach `IndexeddbPersistence(roomUuid, doc)`, `await provider.whenSynced` → connect y-websocket provider. On Leave → destroy IndexeddbPersistence and clear local IndexedDB store for that UUID.
- Deep-link (bug 1.3): `queryParamMap.get('code')` → set input value → invoke same handler manual Join uses → relay responds → either Lobby nav or password-sheet present.
- Repeat-rejection (bug 1.5): WS close handler → if code unmapped, push timestamp into a rolling 60s buffer → if buffer length ≥ 3, call `toastService.error(...)` and clear buffer.

### Edge cases

- Persistence + relay race: `whenSynced` must complete before the y-websocket provider connects, otherwise the snapshot from IndexedDB and the relay snapshot can both apply and produce duplicate transient state.
- Native branch: must be a no-op TODO, not throw — Phase 6b will replace.
- Deep-link + onboarding: if no display name is stored, onboarding still gates first; the pending join URL is preserved and resumes auto-submit after Continue.
- Focus restore: if the invoking element is removed before dismiss (rare — e.g. nav happened during sheet), focus restoration is a best-effort no-op (no exception).
- Repeat-rejection counter: must reset on successful connect, otherwise a long-running session accumulates over its lifetime.
- Stale banner: only stale-flagged when relay actually responded with `unknown-room`; pure offline does not stale-flag (different recovery semantics).

## Acceptance criteria

- [ ] AC-DOC-1: project.md matches ADR-0017/18/19 (5 presets, no `?` cards line, no countdown timer paragraph, no Invite-only bullet).
- [ ] AC-DOC-2: ux.md wireframes have no `?`/`☕`/Modified-Fibonacci/Invite-only artifacts.
- [ ] AC-DOC-3: ux.md §5.5/§5.7 documents viewer/voter chip toggle + observer empty state, citing ADR-0020.
- [ ] AC-DOC-4: cli.md exists; project.md target-audience mentions CLI; roadmap.md cross-cutting cross-links cli.md.
- [ ] AC-BUG-1.2-RELOAD: PWA reload mid-round preserves doc state without a relay round-trip.
- [ ] AC-BUG-1.2-NATIVE-BRANCH: `Capacitor.isNativePlatform()` branch present, leaves a clean SQLite swap point for Phase 6b.
- [ ] AC-BUG-1.3: Tapping `/join?code=PUBLIC` auto-resolves to Lobby; `/join?code=LOCKED` shows the password sheet without manual tap.
- [ ] AC-BUG-1.4: All half-sheet dismissals restore focus to the invoking element.
- [ ] AC-BUG-1.5: Three consecutive unknown WS close codes within 60s produces an error toast.
- [ ] AC-BUG-1.6: `git ls-files packages/cli/dist` returns empty.
- [ ] AC-GAP-3.1: Stale Jump-back-in banner renders muted (opacity 0.6, no chevron) before tap.
- [ ] AC-GAP-3.2: Every toast uses top position; durations are 2000ms info / 4000ms error w/ close icon.
- [ ] AC-TEST-HARNESS-1: `pnpm --filter client test` runs with TestBed support.
- [ ] AC-TEST-HARNESS-2: All 146 pre-existing client tests still green.
- [ ] AC-TEST-HARNESS-3: `avatar-vote-row.component.test.ts` lands as a TestBed-mounted regression for bug 1.1.
- [ ] AC-TEST-4.1: prefers-reduced-motion path verified by unit test.
- [ ] AC-TEST-4.2: `timingSafeEqual` invocation asserted in a relay test.
- [ ] AC-TEST-4.3: e2e produces close code 4010 + asserts user-facing copy.
- [ ] AC-TEST-4.4: Zero-voter no-auto-reveal guard verified.
- [ ] AC-TEST-4.5: Voter↔viewer toggle re-vote eligibility verified.
- [ ] AC-TEST-4.6: 24h-evicted room Jump-back-in produces toast + banner clear.

## Stories

### Story 1: Doc drift sweep

Cohesive context: pure documentation edits, no code touch. Cheap, high-value alignment with ADR-0017/18/19/20.

- [ ] **T1.1: Fix project.md presets/timer/invite drift** [haiku]
  - Package: docs
  - File: `project.md`
  - What: L28-32 prune to ADR-0019's 5 presets (Fibonacci, T-shirt, Powers-of-2, Linear, Risk). L34 remove `?` cards line. L72 remove optional countdown timer paragraph; cite ADR-0018. L115 remove Invite-only bullet; cite ADR-0017.
  - AC: AC-DOC-1
  - Blocked by: —

- [ ] **T1.2: Fix ux.md wireframes** [haiku]
  - Package: docs
  - File: `ux.md`
  - What: Estimating wireframe (~L527, L530) — remove `?` and `☕` cards. Scale picker (~L630-635) — list 5 ADR-0019 presets, drop Modified Fibonacci. Access picker (~L649) — remove "Invite only" row.
  - AC: AC-DOC-2
  - Blocked by: —

- [ ] **T1.3: Document viewer/voter role UX** [sonnet]
  - Package: docs
  - File: `ux.md` §5.5, §5.7
  - What: Add Estimating viewer chip (toggle voter↔viewer in-session). Add observer empty state under §5.5. Mention role exclusion from unanimous reveal denominator. Cite ADR-0020.
  - AC: AC-DOC-3
  - Blocked by: —

- [ ] **T1.4: Add cli.md and CLI mention to project surface (D2=A)** [sonnet]
  - Package: docs
  - Files: `cli.md` (new), `project.md`, `roadmap.md`
  - What: Write `cli.md` documenting the CLI as a shipping surface (commands: `hnch create|join|resume|config`, audience: dev/automation users, parity smoke). Add a CLI mention to project.md target-audience. Cross-link cli.md from roadmap.md cross-cutting.
  - AC: AC-DOC-4
  - Blocked by: —

### Story 2: Vitest Angular harness

Cohesive context: the vitest harness work and the first TestBed-mounted spec it unblocks. Story exists because the avatar-vote-row regression test was deferred during the 1.1 ship and is the natural first consumer of the harness.

- [ ] **T2.1: Wire @analogjs/vite-plugin-angular** [sonnet]
  - Package: client
  - Files: `packages/client/vitest.config.ts`, `packages/client/src/test-setup.ts` (new), `packages/client/package.json`
  - What: Add `@analogjs/vite-plugin-angular` and `@analogjs/vitest-angular` deps. Switch vitest config to `defineConfig` from `@analogjs/vitest-angular`. Add `zone.js/testing` import + `TestBed.initTestEnvironment(...)` in `setupFiles`. Verify all 146 existing tests still green.
  - AC: AC-TEST-HARNESS-1, AC-TEST-HARNESS-2
  - Blocked by: —

- [ ] **T2.2: Restore avatar-vote-row TestBed regression** [haiku]
  - Package: client
  - File: `packages/client/.../avatar-vote-row.component.test.ts`
  - What: Recreate the bug 1.1 regression test as a TestBed-mounted spec. Assert avatar ordering / voted-state classes per the 1.1 fix.
  - AC: AC-TEST-HARNESS-3
  - Blocked by: T2.1

### Story 3: Toast centralization

Cohesive context: the cross-cutting helper that bug 1.5 and several future toasts depend on. Lifted ahead of Story 4 because T3.2 (1.5 fallback toast) explicitly depends on the helper per D4=A.

- [ ] **T3.1: Add ToastService helper and migrate call sites (D4=A)** [sonnet]
  - Package: client
  - Files: `packages/client/src/app/services/toast.service.ts` (new), every call site of `ToastController.create`
  - What: Export `info(message)` (top, 2000ms) and `error(message, { closeIcon?: boolean })` (top, 4000ms, close icon when set). Migrate every `ToastController.create` call site. Inject via the standard Angular `inject()` pattern.
  - AC: AC-GAP-3.2
  - Blocked by: —

### Story 4: Persistence + connection robustness

Cohesive context: bug 1.2 (Yjs IndexedDB) and bug 1.5 (repeat-rejection toast) both touch the same connection-establishment code path; bundling them keeps reviewer context warm.

- [ ] **T4.1: Wire y-indexeddb on PWA (bug 1.2)** [sonnet]
  - Package: client
  - Files: `packages/client/.../doc.service.ts` (the two `new Y.Doc()` sites), `packages/client/package.json`
  - What: Add `y-indexeddb` dep. On `Capacitor.isNativePlatform() === false`, instantiate `IndexeddbPersistence(roomUuid, doc)` and `await provider.whenSynced` before connecting the relay. Native branch is a TODO no-op pointing at Phase 6b SQLite (`adr/0004-local-persistence-sqlite-indexeddb.md`). On Leave session, destroy the persistence provider.
  - AC: AC-BUG-1.2-RELOAD, AC-BUG-1.2-NATIVE-BRANCH
  - Blocked by: —

- [ ] **T4.2: Repeat-rejection toast in sync-provider (bug 1.5)** [haiku]
  - Package: client
  - File: `packages/client/.../sync-provider.ts` (around lines 157-163)
  - What: Maintain a 60-second rolling buffer of unknown-WS-close-code timestamps. On 3rd entry, call `toastService.error('Trouble reaching the room — retrying.')` and clear the buffer. Reset on successful connect.
  - AC: AC-BUG-1.5
  - Blocked by: T3.1

### Story 5: Deep-link auto-submit + join-flow tests

Cohesive context: bug 1.3 and the two new join-related e2e specs all live around the Join page and join-rejection close codes.

- [ ] **T5.1: Implement D1=A deep-link auto-submit (bug 1.3)** [sonnet]
  - Package: client
  - File: `packages/client/.../join.page.ts` (around lines 268-276)
  - What: After `queryParamMap` pre-fill, kick off the same handler as the manual Join tap. If the relay returns close code 4002 (`password-required`), surface the password sheet inline; otherwise auto-resolve to Lobby. Honor pending-join-URL semantics through onboarding.
  - AC: AC-BUG-1.3
  - Blocked by: —

- [ ] **T5.2: e2e — close code 4010 (malformed credentials) (test 4.3)** [sonnet]
  - Package: e2e
  - File: `packages/e2e/...` (new spec)
  - What: Drive a join with malformed credentials (e.g. password sent on an open room, or wrong shape). Assert the 4010 user-facing copy mapped at `join.page.ts` ~L385-402.
  - AC: AC-TEST-4.3
  - Blocked by: —

- [ ] **T5.3: e2e — room-expired Jump-back-in (test 4.6)** [sonnet]
  - Package: e2e + relay test hook
  - Files: e2e spec; minimal relay test endpoint (or fast-forward TTL hook)
  - What: Force-evict the snapshot via a test-only relay endpoint; tap the now-stale Jump-back-in banner; assert toast + banner self-removal. Pairs with T6.2 muted state behavior.
  - AC: AC-TEST-4.6
  - Blocked by: T6.2

### Story 6: A11y + UI gaps + remaining test gaps

Cohesive context: cross-cutting client polish (focus restore, muted banner) plus the remaining test-coverage fixes that depend on Story 2's harness or Story 3's toast service.

- [ ] **T6.1: Focus-restore on modal/sheet dismiss (bug 1.4)** [sonnet]
  - Package: client (cross-cutting)
  - Files: `packages/client/src/app/utils/present-sheet.ts` (new); every half-sheet invocation site (session-settings, scale-picker, access-picker, round-start, theme/name editors, password prompt, QR display)
  - What: Capture `document.activeElement` before `modal.present()`; restore via `(didDismiss)`. Centralize in a `presentSheet()` helper. Migrate all sheet call sites.
  - AC: AC-BUG-1.4
  - Blocked by: —

- [ ] **T6.2: Muted Jump-back-in banner (D3=A, gap 3.1)** [haiku]
  - Package: client
  - Files: home page banner component + its template/styles
  - What: Add `stale: boolean` flag to banner state. When relay reports `unknown-room`, flip flag. Render at opacity 0.6 with no chevron when stale. Tap fires existing toast and clears the entry.
  - AC: AC-GAP-3.1
  - Blocked by: T3.1

- [ ] **T6.3: prefers-reduced-motion test (test 4.1)** [haiku]
  - Package: client
  - Files: `vote-results.component.test.ts`, `estimating.page.test.ts` (new or extended)
  - What: TestBed mount with `matchMedia` stub returning `matches: true` for `(prefers-reduced-motion: reduce)`. Assert reveal stagger CSS / animation duration collapses to 0ms per CSS at `vote-results.component.ts:253-257,309-313` and `estimating.page.ts:219-223`.
  - AC: AC-TEST-4.1
  - Blocked by: T2.1

- [ ] **T6.4: Timing-safe password-compare regression test (test 4.2)** [sonnet]
  - Package: relay
  - File: `packages/relay/test/...` (new spec)
  - What: Unit test asserting `timingSafeEqual` is invoked on the password-compare path (mock `node:crypto`, assert call). Exercises `relay/server.ts:268-279,356-361`.
  - AC: AC-TEST-4.2
  - Blocked by: —

- [ ] **T6.5: Zero-voter unanimous-reveal guard test (test 4.4)** [haiku]
  - Package: client
  - File: estimating page tests
  - What: TestBed scenario with all-viewers room (0 voters). Assert auto-reveal does NOT fire (`estimating.page.ts:297` guard).
  - AC: AC-TEST-4.4
  - Blocked by: T2.1

- [ ] **T6.6: e2e — re-vote eligibility after voter↔viewer toggle (test 4.5)** [sonnet]
  - Package: e2e
  - File: e2e spec
  - What: Voter votes → toggles to viewer → host triggers reveal → toggles back to voter on re-vote round → can vote again.
  - AC: AC-TEST-4.5
  - Blocked by: —

- [ ] **T6.7: Stale CLI dist artifact cleanup (bug 1.6)** [haiku]
  - Package: cli
  - Files: `packages/cli/.gitignore` (add `dist/`), tracked `packages/cli/dist/` files
  - What: Add `dist/` to `.gitignore`. `git rm -r --cached packages/cli/dist`. Regenerate via build.
  - AC: AC-BUG-1.6
  - Blocked by: —

## Story dependencies

```
S1 (docs)              — standalone
S2 (harness)           — standalone, blocks S6.T6.3 and S6.T6.5
S3 (toast service)     — standalone, blocks S4.T4.2 and S6.T6.2
S4 (persistence + 1.5) — T4.2 blocked by S3.T3.1
S5 (deep-link + tests) — T5.3 blocked by S6.T6.2
S6 (a11y + tests)      — T6.2 blocked by S3.T3.1; T6.3/T6.5 blocked by S2.T2.1
```

Suggested execution order: S1 → S2 → S3 → S4 → S6 (T6.1, T6.2, T6.4, T6.6, T6.7 can land before S5 if convenient) → S5 (T5.3 needs T6.2).

## Team Recommendation

### Agent roster

| Agent | subagent_type | Stories | Spawn | Despawn |
|---|---|---|---|---|
| docs-haiku | docs-haiku | S1 | S1 start | after S1 review clean |
| client-sonnet | client-sonnet | S2, S3, S4, S5, S6 | S2 start | after S6 review clean |
| client-haiku | client-haiku | S2.T2.2, S6.T6.2/T6.3/T6.5/T6.7 + S4.T4.2 | S2 start | after S6 review clean |
| relay-sonnet | relay-sonnet | S6.T6.4 | S6 start | after S6 review |
| e2e-sonnet | e2e-sonnet | S5.T5.2/T5.3, S6.T6.6 | S5 start | after S6 review |
| reviewer | reviewer | all | S1 start | end |

### Reviewer strategy

**One reviewer continuous.** Stories 2-6 cluster around `packages/client`, so a single reviewer keeps warm context across them. S1 (docs), S6.T6.4 (relay test), and the e2e specs (S5.T5.2/T5.3, S6.T6.6) are smaller add-ons the same reviewer can absorb without thrash. Phased review: review at end of each story; fixes go back through the reviewer before the next story starts (no exceptions, per memory).

### Concurrency timeline

```
Story 1 (docs):           docs-haiku, reviewer                          — 2 agents
Story 2 (harness):        client-sonnet, client-haiku, reviewer         — 3 agents
Story 3 (toast):          client-sonnet, reviewer                       — 2 agents
Story 4 (persistence):    client-sonnet, client-haiku, reviewer         — 3 agents
Story 5 (deep-link+e2e):  client-sonnet, e2e-sonnet, reviewer           — 3 agents
Story 6 (a11y+tests):     client-sonnet, client-haiku, relay-sonnet,
                          e2e-sonnet, reviewer                          — 5 agents (cap)
```

Max concurrent = 5 (Story 6). Within the 5-agent cap. Despawn `docs-haiku` after S1 review clean. T6.7 (cli artifact cleanup) may serialize last to avoid going over the cap mid-S6 if all four implementers are otherwise busy.

### Restart cadence

Per memory: restart `client-haiku` after every 4 completed tasks. Likely restart point: between S5 and S6, since `client-haiku` will have completed T2.2, T4.2, plus several S6 tasks by then.

## Key files reference

- `packages/client/.../doc.service.ts` (Y.Doc instantiation sites for bug 1.2)
- `packages/client/.../sync-provider.ts:157-163` (WS close-code switch for bug 1.5)
- `packages/client/.../join.page.ts:268-276,385-402` (deep-link, 4010 mapping)
- `packages/client/.../estimating.page.ts:85-91,119-142,219-223,297` (viewer chip, observer empty, reduced-motion CSS, zero-voter guard)
- `packages/client/.../vote-results.component.ts:253-257,309-313` (reveal animation reduced-motion CSS)
- `packages/client/vitest.config.ts` (harness wiring)
- `packages/relay/server.ts:268-279,356-361` (timingSafeEqual)
- `packages/shared/auth.ts:82-90` (`JoinRejectionReason` 4010)
- `packages/cli/dist/timer.d.ts:2` (stale ADR-0011/0015 references)
- `packages/cli/.gitignore`
- `project.md` L28-32, L34, L72, L115
- `ux.md` §5.5 (~L527, L530), §5.7 (~L630-635, L649)
- `adr/0017-password-hashing-drop-invite-only.md`
- `adr/0018-remove-timer-add-unanimous-reveal.md`
- `adr/0019-scale-customization.md`
- `adr/0020-participant-viewer-voter-role.md`
- `adr/0004-local-persistence-sqlite-indexeddb.md`

## Estimation

~22 story points, ranged across 6 stories.

- S1 (docs): 3 pts (cheap markdown edits, but T1.4 writes a new doc).
- S2 (harness): 5 pts (config plumbing carries hidden risk; T2.2 is small once T2.1 lands).
- S3 (toast): 3 pts (helper is small; migration touches many files).
- S4 (persistence + 1.5): 5 pts (whenSynced ordering + race-free destroy is the subtle bit).
- S5 (deep-link + tests): 3 pts.
- S6 (a11y + tests): 3 pts (focus helper is small; remaining tests are scaffolding).
