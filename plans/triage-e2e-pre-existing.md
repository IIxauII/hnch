# Pre-existing e2e failures (triage)

**Status:** Out-of-scope for the ADR↔code gap closure swarm (T21–T31). Documented here so they don't get re-discovered as "regressions" by future work.

## Verification method

Confirmed pre-existing via `git stash` baseline check on `2026-04-27` against HEAD `e3b55dc` (one commit beyond `6da7e32`, no functional difference). All six tests fail with byte-identical errors and line numbers on baseline tree (no swarm changes) and on swarm working tree. Stash popped clean afterward.

Run scope: `pnpm --filter @hnch/e2e test` (chromium project, default config). 50 / 56 pass; the 6 below fail deterministically (3/3 across flake-check repeats — not flake).

## Failures

### 1. `expired-jump-back-in.spec.ts:29`

> `stale banner appears dimmed on unknown-room, second tap clears it`

**Symptom:** `app-jump-back-in-banner` never reaches `visible` state after navigating to the unknown-room screen with a stale `last-session` cache.

```
TimeoutError: locator.waitFor: Timeout 5000ms exceeded.
  - waiting for locator('app-jump-back-in-banner') to be visible
    > 52 |       await banner.waitFor({ state: 'visible', timeout: 5_000 })
```

**Hypotheses to investigate:** banner wiring in unknown-room flow (`home.page.ts` resume-banner logic? `app-jump-back-in-banner` registration in `home.page.ts` template?). Probably an Angular control-flow regression elsewhere or a stale-cache router race.

**Suggested owner on triage:** mobile (Angular client).

---

### 2. `qr-display.spec.ts:5`

> `opens with QR image and room code, then dismisses via Done`

**Symptom:** Done button click does not dismiss `app-qr-display-sheet`. Sheet remains visible until test timeout (15s).

```
Test timeout of 15000ms exceeded.
Error: locator.waitFor: Target page, context or browser has been closed
  - waiting for locator('app-qr-display-sheet') to be hidden
    32 × locator resolved to visible <app-qr-display-sheet ...>
    > 23 |     await host.page.locator('app-qr-display-sheet').waitFor({ state: 'hidden' })
```

**Hypotheses:** QR sheet's Done handler not wiring through `closeRequested` to parent's `isOpen`. Half-sheet modal pattern in `qr-display-sheet` likely changed. Or Done button selector drift.

**Suggested owner:** mobile.

---

### 3. `revote-role-toggle.spec.ts:12`

> `player toggles viewer mid-round, then back to voter on re-vote — vote counts`

**Symptom:** Fixture's `Participant.toggleRole` selector matches two `ion-chip` elements (round 1 + round 2 estimating views both mounted). Strict-mode locator violation.

```
Error: locator.waitFor: Error: strict mode violation:
  locator('ion-chip').filter({ hasText: /Voter|Observing/ }) resolved to 2 elements
    1) <ion-chip ... aria-label="You are observing. Tap to switch to voter."> (Round 1 estimating)
    2) <ion-chip ... aria-label="You are observing. Tap to switch to voter."> (Round 2 estimating)
  at fixtures/app.fixture.ts:133
```

**Root cause:** test-fixture bug, not implementation. `toggleRole` selector at `packages/e2e/fixtures/app.fixture.ts:133` doesn't scope to the active round.

**Suggested fix:** scope the locator to the current estimating view (e.g., `.locator('app-estimating-view').last().locator('ion-chip').filter(...)`) or to a stable `data-testid` on the chip in the current round.

**Suggested owner:** e2e (`packages/e2e/fixtures/app.fixture.ts`).

---

### 4. `revote-role-toggle.spec.ts:68`

> `player as viewer is excluded from round 1 denominator after toggle`

Same root cause as #3 — same `toggleRole` strict-mode violation. Fixed alongside #3.

---

### 5. `three-client.spec.ts:51`

> `host election: after host drops, exactly one remaining player becomes host`

**Symptom:** "Start Round" click intercepted by a "Join" button covering the click target. Lobby state appears to still show the join-flow overlay when the test expects the joined-player view.

```
Error: locator.click: Target page, context or browser has been closed
  - locator resolved to <ion-button>Start Round 1</ion-button>
  - <ion-button>Join</ion-button> from <slot></slot> subtree intercepts pointer events
  at fixtures/app.fixture.ts:104
```

**Hypotheses:** test-fixture stage transition not awaiting room-state propagation. OR genuine regression in lobby render after host election.

**Suggested owner:** mobile or e2e (start with e2e fixture timing — likely missing `waitFor` after host promotion).

---

### 6. `three-client.spec.ts:115`

> `host election: elected host can reveal votes after original host drops during round`

**Symptom:** Neither remaining player gets the Reveal button after the original host drops mid-round; election doesn't complete (or doesn't elect) within the test timeout.

```
expect(received).toBe(expected) // Object.is equality
Expected: true
Received: false
  > 156 |     expect(p1HasReveal || p2HasReveal).toBe(true)
```

**Hypotheses:** host-election debounce (5s per ADR-0010) interacting badly with test pacing, OR genuine regression in election flow. The auto-reveal control case (`three-client.spec.ts:14`) passes, so general session wiring works.

**Suggested owner:** mobile (host-election logic in `host-election.service.ts`) — possibly relay (snapshot under host churn).

---

## Pattern observations

- 2/6 are e2e fixture bugs (`revote-role-toggle.spec.ts:12,68`) — fastest to fix.
- 1/6 (`expired-jump-back-in.spec.ts:29`) is on the same code path the swarm hardened (T2 close-code change in `last-session.service.ts`, T22b/T25 cache-clear in CLI, T24 cache-clear in mobile). A future fix should also re-run T-level unit tests to ensure consistency.
- 2/6 (`three-client.spec.ts:51,115`) are host-election scenarios — swarm did not touch host election. Likely flake-vs-bug determination needs longer playwright timeouts or snapshot inspection.
- 1/6 (`qr-display.spec.ts:5`) is independent of swarm scope.

## Not blockers

These six failures predate the ADR-code-gap swarm (T21–T31) and do not gate its merge. Triage them as separate work items.
