# Plan: fix 5 pre-existing e2e failures (test-fixture work)

**Estimate:** 4-5 story points (revised down from 6-8 after research)
**Status:** ready for orchestration
**Source plan:** `plans/plan-e2e-pre-existing-failures.md`
**Research:** all 5 failures diagnosed as **test-fixture / test-ordering bugs**. Client code is correct under ADR-0010, ADR-0013, ADR-0018, ADR-0020.

## Context

5 e2e specs were failing on baseline `c091a7e` and excluded from `plan-e2e-fixes`. Researchers confirmed all 5 are test-side issues — no client bugs. The diagnoses:

- **revote-cycle (2 tests):** `host.reveal()` fixture (`app.fixture.ts:138–143`) returns after `waitForURL(/\/lobby/)` but does not wait for round-state CRDT sync; subsequent `Re-vote` button query (`ion-button:has-text("Re-vote")` from fixture line 165) hits an unrendered button. Re-vote button is gated on `lastRevealedRound()` (lobby.page.ts:236).
- **three-client (2 tests):**
  - Test 1 (line 51): `Promise.all([player1GainsHost, player2GainsHost])` resolves, then `newHost.startRound()` at line 110 races with fixture teardown closing contexts mid-action.
  - Test 2 (line 115): `host.createSession()` at line 122 runs **after** `host.disconnect()` at line 136 already closed the page — ordering bug. Plus player2 teardown closes its context while still in use.
- **voting-flow "votes remain hidden":** `expectVotesHidden()` hangs on `waitForURL(/estimating/)` in fixture line 384; never reaches visibility assertions. Vote-concealment client impl is correct (AvatarVoteRowComponent dots-only pre-reveal, vote-results gated on `revealedAt`).

All fixes are in `packages/e2e`. No client changes required. No ADR drift.

## User Journey

Reviewer/orchestrator journey:

1. Implementer claims story → re-confirms diagnosis by running spec → applies fixture/test fix → runs spec 2× to confirm stability.
2. Reviewer checks: scope tight (no client edits), no timeout bumps, fix matches diagnosis.
3. Verifier runs full chromium suite 2× to confirm no regression to the 47 passing.

## Decisions

**D1: Investigation depth**
A) Implementer re-runs spec to confirm research diagnosis matches what they see locally before patching ← recommended
B) Trust the research, patch directly

Recommend A — cheap (one spec run ≈30s), catches stale diagnosis if anything shifted, and gives implementer the actual error trace to commit-message-quote.

**D2: Test-only vs widening scope**
A) All 3 stories are test-only per research; do not touch client code ← recommended
B) Allow client edits if implementer disagrees with research diagnosis

Recommend A — research confirmed client code is correct against ADRs. If implementer believes otherwise, they escalate to reviewer instead of silently changing scope.

**D3: Fixture refactor scope**
A) Minimal — patch each broken fixture method in place, no helper extraction ← recommended
B) Refactor `app.fixture.ts` to add a robust `waitForRoundState()` helper used everywhere

Recommend A — three localized fixes ship faster and are easier to review. Helper extraction is a separate cleanup if patterns repeat.

**D4: Per-test timeout**
A) Preserve 15s — diagnose any sync wait longer than that as a real bug ← recommended
B) Allow per-test timeout bumps for known-slow flows

Recommend A — current 15s is the bar. CRDT sync after a reveal is sub-second; if the fixture wait extends past 15s, something is wrong in client code, not test-side.

**D5: Tier downgrade after diagnosis-known**
A) Drop area stories from sonnet → haiku (test-only changes, root causes pinpointed) ← recommended
B) Keep sonnet for diagnosis-validation reasoning

Recommend A — root causes + file/line pointers given. Mechanical fixture patches with cited line numbers fit haiku scope.

## Spec

### Behavioral Requirements

Per ADR-0013: re-vote creates a new round inheriting `title`/`description`/`ticketId` from parent — confirmed correct in `DocService.startRound()` (doc-service.ts:573–579) and `LobbyPage.onRevote()` (lobby.page.ts:587–598). Round-N labeling auto-increments via `lastRevealedRoundIndex()` (lobby.page.ts:495–500).

Per ADR-0010: `HOST_ABSENCE_ELECTION_DEBOUNCE_MS = 5_000` (host-election.service.ts:16), election winner = `[...onlineIds].sort()[0]`, only winner writes `hostParticipantId`. Awareness deduped by participantId in doc.service.ts:539–548. Confirmed correct.

Per ADR-0018: vote VALUES never rendered pre-reveal in any participant-list surface. AvatarVoteRowComponent shows dots only. vote-results.component.ts gated on `round.revealedAt`. Confirmed correct.

### Test-fixture requirements

- `host.reveal()` fixture must wait for the round to reach revealed state in the doc (`lastRevealedRound()` truthy in client) before returning, so subsequent `Re-vote` button query succeeds.
- Three-client test must sequence actions strictly before any `disconnect()` or fixture teardown closes contexts. Specifically test 2 needs `createSession()` BEFORE `disconnect()`, and player teardown must not run while `host.waitForURL` is in flight.
- `expectVotesHidden()` must not depend on a `waitForURL(/estimating/)` that already happened earlier in the flow; the assertion should run against the current page state without re-waiting for navigation.

### Interfaces

No new interfaces. Files in scope:
- `packages/e2e/tests/fixtures/app.fixture.ts` (lines 77, 104, 138–143, 165, 384 are referenced by research)
- `packages/e2e/tests/revote-cycle.spec.ts`
- `packages/e2e/tests/three-client.spec.ts` (especially lines 51, 87–97, 110, 115, 122, 136)
- `packages/e2e/tests/voting-flow.spec.ts`

### Data Flow

Re-vote test: createSession → vote → reveal → **wait for round-revealed sync** → click Re-vote → assert Round 2.

3-client test 1: 3 contexts join → host disconnects → both remaining clients see new host → **all peers fully settled** → start round → assert.

3-client test 2: 3 contexts join → host runs flow to round-in-progress → host disconnects → elected host reveals → assert. (Reordering: createSession must precede disconnect.)

Vote concealment: 2 contexts in estimating → both vote → `expectVotesHidden()` reads CURRENT estimating page DOM (no navigation wait) → assert dots/no values visible.

### Edge Cases

- Reveal-fixture wait must not race with unanimous auto-reveal (ADR-0018). If both clients vote and auto-reveal fires before the fixture's manual reveal, the wait should still resolve correctly (it waits for `revealedAt` set, regardless of who set it).
- Three-client teardown: each test owns its contexts; do not let Playwright fixture cleanup race with in-flight assertions. May require `await`-ing all peer actions before any context closes.
- expectVotesHidden after navigation: the test flow already navigated to estimating before the call; calling `waitForURL` again is the bug. Either remove the wait or replace with a state assertion (`expect(page.locator(estimating-marker))`).

## Acceptance Criteria

- [ ] AC-1: `revote-cycle.spec.ts` — both tests pass on chromium, 2 sequential runs.
- [ ] AC-2: `three-client.spec.ts` — both tests pass on chromium, 2 sequential runs.
- [ ] AC-3: `voting-flow.spec.ts` "votes remain hidden" passes on chromium, 2 sequential runs.
- [ ] AC-4: `pnpm --filter @hnch/e2e test --project=chromium` 52/52 green, 2 sequential runs.
- [ ] AC-5: 15s per-test timeout preserved (no bumps).
- [ ] AC-6: No `packages/client` or `packages/shared` changes (test-only scope).
- [ ] AC-7: Each fix has a 1-line root-cause note in the commit body, citing the fixture line numbers.

## Stories

### Story 1: Re-vote fixture sync wait — `revote-cycle.spec.ts`

Cohesion: single fixture method (`host.reveal()`) and the spec relying on it.

- [ ] **T1: Re-confirm + fix `host.reveal()` round-sync wait** [haiku]
  - Package: e2e
  - File(s): `packages/e2e/tests/fixtures/app.fixture.ts` (lines 138–143, 165), `packages/e2e/tests/revote-cycle.spec.ts` (only if spec references need adjusting)
  - What: Run `pnpm --filter @hnch/e2e exec playwright test revote-cycle --project=chromium --reporter=line --timeout=15000` once to confirm `Re-vote` button timeout matches research. In `host.reveal()`, after `waitForURL(/\/lobby/)`, add a wait for the revealed-round signal via DOM (e.g., `expect(page.locator('[data-testid="last-revealed-round"]')).toBeVisible()` or a wait for the `Re-vote` button to attach). Do NOT bump per-test timeout. Re-run spec 2× to confirm stable.
  - AC: AC-1, AC-5, AC-6, AC-7
  - Blocked by: —

### Story 2: 3-client test ordering — `three-client.spec.ts`

Cohesion: same spec, two tests with related lifecycle/ordering bugs.

- [ ] **T2: Fix 3-client test 1 ordering (post-election action vs teardown)** [haiku]
  - Package: e2e
  - File(s): `packages/e2e/tests/three-client.spec.ts` (lines 51, 87–97, 110), `packages/e2e/tests/fixtures/app.fixture.ts:104` (only if `startRound()` needs a guard)
  - What: After `Promise.all([player1GainsHost, player2GainsHost])` resolves, ensure all 3 peers (or remaining 2) are fully settled before `newHost.startRound()`. The fix is sequencing: explicit `await` chain, ensuring no teardown can run mid-action. May involve guarding `startRound()` to assert page is still open, or ensuring the test does not exit a `test.step` block early. Run target spec 2× chromium.
  - AC: AC-2, AC-5, AC-6, AC-7
  - Blocked by: —

- [ ] **T3: Fix 3-client test 2 createSession-before-disconnect ordering** [haiku]
  - Package: e2e
  - File(s): `packages/e2e/tests/three-client.spec.ts` (lines 115, 122, 136)
  - What: Reorder so `host.createSession()` runs BEFORE `host.disconnect()`. Verify player teardown does not close player2's context while `host.waitForURL` is in flight (use sequenced `await` or fixture-scoped lifetimes). Run target spec 2× chromium.
  - AC: AC-2, AC-5, AC-6, AC-7
  - Blocked by: —

### Story 3: Vote-concealment fixture — `voting-flow.spec.ts`

Cohesion: single fixture method (`expectVotesHidden`) and the one assertion using it.

- [ ] **T4: Fix `expectVotesHidden()` redundant navigation wait** [haiku]
  - Package: e2e
  - File(s): `packages/e2e/tests/fixtures/app.fixture.ts:384`, `packages/e2e/tests/voting-flow.spec.ts` (if spec relies on a removed call)
  - What: Remove the `waitForURL(/\/estimating/)` that hangs (test is already on /estimating by this point). Replace with current-state assertion if needed (e.g., `await expect(page.locator(<estimating-marker>)).toBeVisible()` with a short wait), then run the existing visibility/concealment assertions. Run target spec 2× chromium.
  - AC: AC-3, AC-5, AC-6, AC-7
  - Blocked by: —

### Story 4: Verify + commit

- [ ] **T5: Full chromium suite 2× stability check** [haiku]
  - Package: e2e
  - File(s): —
  - What: `pnpm --filter @hnch/e2e test --project=chromium` twice sequentially. Confirm 52/52 green both runs. If any flake appears, report exact spec + run number to reviewer; do NOT auto-rerun until green.
  - AC: AC-4, AC-5
  - Blocked by: T1, T2, T3, T4

- [ ] **T6: Commits + plan tidy** [haiku]
  - Package: —
  - File(s): commit message bodies; mark `plans/plan-e2e-pre-existing-failures.md` closed.
  - What: One commit per story (or one squashed) with 1-line root-cause note per fix citing fixture line. No `Co-Authored-By` trailer (per CLAUDE.md).
  - AC: AC-7
  - Blocked by: T5

## Team Recommendation

### Agent Roster

| Agent | type | Stories | Spawn | Despawn |
|---|---|---|---|---|
| impl-A | mobile-haiku (e2e-haiku if available) | S1 (T1), S3 (T4) | S1 start | after S3 review clean |
| impl-B | mobile-haiku | S2 (T2 + T3) | S1 start | after S2 review clean |
| verifier | mobile-haiku | S4 (T5 + T6) | after S1+S2+S3 reviewed | end |
| reviewer | reviewer | all (idle until story ready) | S1 start | end |

All implementer tasks downgraded to **haiku** (per D5) — the diagnoses with file/line pointers reduce these to mechanical fixture edits. impl-A handles the two single-task stories (S1, S3); impl-B handles S2 (the 3-client story has 2 tasks but they share spec context).

### Reviewer Strategy

Single reviewer. Phase-batched per user preference: review S1 when T1 done, review S2 when T2+T3 both done, review S3 when T4 done, review S4 when T5 done. Reviewer reads code only — implementers run tests and report results.

Reviewer scope check per story:
- No client / shared package edits (AC-6).
- No per-test timeout bumps (AC-5).
- Fix matches diagnosis cited in commit body (AC-7).
- Spec passed 2× chromium per implementer report.

### Concurrency Timeline

```
S1 + S2 (parallel):    impl-A (T1), impl-B (T2 then T3), reviewer    (3 agents)
  → review S1 when T1 clean
  → review S2 when T2 + T3 clean

S3:                    impl-A (T4), reviewer                          (2 agents)
                       (despawn impl-B after S2 review clean)
  → review S3 when T4 clean

S4:                    verifier (T5 then T6), reviewer                (2 agents)
                       (despawn impl-A after S3 review clean)
  → review final commits
```

Peak: 3 concurrent. Well under the 5 cap.

### Restart cadence

Per user feedback (memory: restart haiku every 4 tasks): impl-A handles 2 tasks across S1+S3, impl-B handles 2 tasks in S2, verifier handles 2 tasks in S4 — all under the 4-task threshold, no restarts needed.

## Key Files Reference

Pinpoint locations from research:

**Fixtures (test-side):**
- `packages/e2e/tests/fixtures/app.fixture.ts:77` — three-client test 2 hits closed-page error here
- `packages/e2e/tests/fixtures/app.fixture.ts:104` — `startRound()` mid-teardown collision (test 1)
- `packages/e2e/tests/fixtures/app.fixture.ts:138–143` — `host.reveal()` returns after `waitForURL(/\/lobby/)` without round-state sync
- `packages/e2e/tests/fixtures/app.fixture.ts:165` — `Re-vote` button query that times out
- `packages/e2e/tests/fixtures/app.fixture.ts:384` — `expectVotesHidden()` redundant `waitForURL(/estimating/)`

**Specs:**
- `packages/e2e/tests/revote-cycle.spec.ts`
- `packages/e2e/tests/three-client.spec.ts:51` (test 1), `:87–97` (gainsHost waits), `:110` (post-election action), `:115` (test 2), `:122` (createSession), `:136` (disconnect)
- `packages/e2e/tests/voting-flow.spec.ts`
- `packages/e2e/tests/host-election.spec.ts` (passing 2-client baseline — reference only)

**Client code (read-only — confirmed correct, no edits):**
- `packages/client/src/app/lobby/lobby.page.ts:236` — Re-vote button gating on `lastRevealedRound()`
- `packages/client/src/app/lobby/lobby.page.ts:495–500` — Round-N labeling
- `packages/client/src/app/lobby/lobby.page.ts:587–598` — `onRevote()`
- `packages/client/src/app/core/doc/doc-service.ts:573–579` — `startRound()` parent inheritance
- `packages/client/src/app/core/doc/doc-service.ts:539–548` — awareness participantId dedupe
- `packages/client/src/app/core/doc/host-election.service.ts:16` — `HOST_ABSENCE_ELECTION_DEBOUNCE_MS = 5_000`

**ADRs:**
- `adr/0010-host-election.md`, `adr/0013-round-model-flat-parentroundid.md`, `adr/0018-remove-timer-add-unanimous-reveal.md`, `adr/0020-participant-viewer-voter-role.md`

## Estimation

4-5 SP total (revised down from 6-8 after research):
- S1 (re-vote fixture wait): 1 SP — single fixture method, add a state-wait.
- S2 (3-client ordering): 2 SP — two related ordering fixes, requires careful Playwright lifecycle reasoning.
- S3 (concealment fixture): 0.5 SP — remove a redundant `waitForURL`.
- S4 (verify + commit): 1 SP — full-suite runs + commits.

Risk: low. All fixes are in test-fixture/spec code; no client behavior changes; ADR conformance untouched.
