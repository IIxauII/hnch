# ADR-0018: Remove countdown timer; add unanimous auto-reveal

**Status:** Accepted
**Date:** 2026-04-23
**Supersedes:** ADR-0011 (timer canonical time authority), ADR-0015 (v1 scope — session-level reveal and timer)

## Context

- Two reveal modes shipped: `manual` (host taps) + `timer` (countdown auto-reveal). Countdown added complexity (settings UI, host-authority expiry, fallback grace, host-dropout edge cases) without proportional value.
- Elapsed voting time useful as feedback ("round took 45s"); countdown pressure + auto-reveal-on-expiry not.
- Most natural reveal trigger — "everyone voted" — explicitly deferred by ADR-0015. Users expect it from other planning-poker tools.
- ADR-0015 rejected unanimous citing slow-voter pressure + last-second change-of-mind. Reconsidered: countdown applied more pressure than unanimous; change-of-mind preserved by votes-editable-until-reveal rule (changing vote moves the threshold) + host manual reveal escape hatch.

## Decision

(1) Remove `RevealMode` type and `revealMode`/`timerDurationMs` settings entirely — no reveal-mode setting. Reveal = manual + unanimous. (2) Keep `timerStartedAt` per round, repurposed as stopwatch origin (always `= createdAt`). Estimating screen displays elapsed time counting up. (3) Unanimous auto-reveal: when every awareness-set (online) participant has vote in current round, write `revealedAt`. Every client runs check independently; Yjs merges idempotently — no host-authority needed. (4) Host can still manually reveal anytime (e.g., AFK voter).

## Options

- **A — Keep timer, add unanimous as 3rd mode:** no regression for timer users. Cons: 3 modes = more settings UI, edge cases, code; timer added little value.
- **B — Remove timer, add unanimous (chosen):** simpler product; unanimous = what users want. Cons: loses countdown pressure for teams that liked it.
- **C — Remove timer, manual-only:** simplest impl. Cons: misses most-requested behavior.

## Trade-offs

- Countdown-pressure teams lose feature; re-adding requires new ADR + ADR-0011 host-authority machinery.
- Large groups with awareness-propagation lag could see unanimous-check anomalies.

## Consequences

- Easier: no reveal-mode setting; no timer picker; no host-authority expiry/fallback; estimating screen = elapsed stopwatch.
- Harder: countdown-pressure teams lose feature; restoring requires new ADR.
- Deleted: `RoundTimerService`, `TimerPickerSheetComponent`, timer-host integration tests, timer e2e.
- Revisit when: users report wanting countdown back; unanimous check causes issues with large groups (awareness lag).

## Action Items

- [x] Remove `RevealMode` type and timer fields from `doc.ts`
- [x] Remove `startRoundTimer()`, update `appendRound()` to always write `timerStartedAt`
- [x] Delete `RoundTimerService`, timer picker, timer tests
- [x] Add unanimous auto-reveal effect to `EstimatingPage`
- [x] Replace countdown display with elapsed stopwatch
- [x] Update e2e tests
- [x] Update `schema.md`, `CLAUDE.md`, `ux.md`
- [x] Mark ADR-0011 and ADR-0015 as superseded
