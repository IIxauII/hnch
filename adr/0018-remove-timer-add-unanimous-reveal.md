# ADR-0018: Remove countdown timer; add unanimous auto-reveal

**Status:** Accepted
**Date:** 2026-04-23
**Deciders:** xau
**Supersedes:** ADR-0011 (timer canonical time authority), ADR-0015 (v1 scope — session-level reveal and timer)

## Context

The product supported two reveal modes: `manual` (host taps Reveal) and `timer` (countdown auto-reveals after a configured duration). In practice the countdown timer added complexity — settings UI, host-authority expiry logic, fallback grace periods, edge cases around host dropout during countdown — without proportional value. The elapsed voting time is useful feedback ("this round took 45 seconds"), but the countdown pressure and auto-reveal-on-expiry are not.

Meanwhile, the most natural reveal trigger — "everyone has voted" — was explicitly deferred in ADR-0015 as out of v1 scope. Users expect this behavior from other planning poker tools.

**Reversal of ADR-0015's reasoning:** [ADR-0015](0015-v1-scope-session-level-reveal-and-timer.md) explicitly rejected unanimous auto-reveal, stating: *"We deliberately rejected a "reveal when everyone has voted" auto-detection because it creates pressure on slow voters and surprises participants who change their minds at the last second."* That reasoning is reconsidered here on two grounds. First, the countdown timer this ADR removes applied substantially more time pressure than a unanimous trigger does — slow voters were already pressured, just by a different mechanism. Second, the change-of-mind concern is preserved by the existing rule that votes remain editable until reveal: a participant who changes their vote before the final voter casts theirs simply moves the unanimous threshold, and the host's manual reveal remains as an escape hatch when waiting on the last voter is undesirable.

## Decision

1. **Remove the `RevealMode` type and `revealMode` / `timerDurationMs` settings entirely.** There is no reveal-mode setting. The reveal behavior is always: manual (host taps Reveal) + unanimous auto-reveal (fires when all online participants have voted).

2. **Keep `timerStartedAt` on each round**, repurposed as a stopwatch origin. It is always written at round creation (`timerStartedAt = createdAt`). The estimating screen displays elapsed time counting up from this value.

3. **Add unanimous auto-reveal.** When every participant in the awareness set (online) has a vote entry in the current round, `revealedAt` is written. Every client runs this check independently; Yjs merges concurrent writes idempotently. No host-authority model is needed because the condition is deterministic from shared CRDT + awareness state.

4. **The host can still manually reveal at any time** before all votes are in (e.g. to reveal a round where one participant is AFK).

## Options Considered

### Option A: Keep timer, add unanimous as a third mode

Add `'unanimous'` to `RevealMode` alongside `'manual'` and `'timer'`.

**Pros:** No feature regression for timer users.
**Cons:** Three modes = more settings UI, more edge cases, more code. Timer added little value in practice.

### Option B: Remove timer, add unanimous (chosen)

Single behavior: manual + unanimous. No reveal-mode setting at all.

**Pros:** Simpler product, less code, fewer edge cases. Unanimous is what users actually want.
**Cons:** Loses countdown pressure for teams that liked it. Can revisit if demand emerges.

### Option C: Remove timer, keep manual-only

**Pros:** Simplest possible implementation.
**Cons:** Misses the most-requested behavior (auto-reveal on all voted).

## Trade-off Analysis

Option B is the right balance: it removes complexity that wasn't earning its keep (countdown timer) while adding the behavior users expect (unanimous reveal). The countdown can be re-added later behind a setting if demand materializes, but the simpler default is better for v1.

## Consequences

- **Easier:** No reveal-mode setting to explain. No timer picker. No host-authority expiry logic or fallback grace periods. The estimating screen is simpler (elapsed stopwatch instead of countdown).
- **Harder:** Teams that genuinely wanted countdown pressure lose it. If we bring it back, we'd need a new ADR and the host-authority machinery from ADR-0011.
- **Deleted code:** `RoundTimerService`, `TimerPickerSheetComponent`, timer-host integration tests, timer e2e test.
- **Revisit if:** users report wanting countdown pressure back, or if the unanimous check causes issues with large groups where awareness propagation lags.

## Action Items

- [x] Remove `RevealMode` type and timer fields from `doc.ts`
- [x] Remove `startRoundTimer()`, update `appendRound()` to always write `timerStartedAt`
- [x] Delete `RoundTimerService`, timer picker, timer tests
- [x] Add unanimous auto-reveal effect to `EstimatingPage`
- [x] Replace countdown display with elapsed stopwatch
- [x] Update e2e tests
- [x] Update `schema.md`, `CLAUDE.md`, `ux.md`
- [x] Mark ADR-0011 and ADR-0015 as superseded
