# ADR-0018: Remove countdown timer; add unanimous auto-reveal

**Status:** Accepted
**Date:** 2026-04-23

## Context

- Two reveal modes shipped: `manual` (host taps) + `timer` (countdown auto-reveal). Countdown added complexity (settings UI, host-authority expiry, fallback grace, host-dropout edge cases) without proportional value.
- Elapsed voting time useful as feedback ("round took 45s"); countdown pressure + auto-reveal-on-expiry not.
- Most natural reveal trigger — "everyone voted" — users expect it from other planning-poker tools.
- Slow-voter pressure + last-second change-of-mind concern: change-of-mind preserved by votes-editable-until-reveal rule (changing vote moves threshold) + host manual reveal escape hatch.

## Decision

(1) Remove `RevealMode` type and `revealMode`/`timerDurationMs` settings entirely — no reveal-mode setting. Reveal = manual + unanimous. (2) Keep `timerStartedAt` per round, repurposed as stopwatch origin (always `= createdAt`). Estimating screen displays elapsed time counting up. (3) Unanimous auto-reveal: when every awareness-set (online) participant has vote in current round, write `revealedAt`. Every client runs check independently; Yjs merges idempotently — no host-authority needed. (4) Host can still manually reveal anytime (e.g., AFK voter).

## Trade-offs

- Countdown-pressure teams lose feature; re-adding requires new ADR + host-authority machinery for expiry.
- Large groups with awareness-propagation lag could see unanimous-check anomalies.

## Consequences

- Easier: no reveal-mode setting; no timer picker; no host-authority expiry/fallback; estimating screen = elapsed stopwatch.
- Harder: countdown-pressure teams lose feature; restoring requires new ADR.
- Deleted: `RoundTimerService`, `TimerPickerSheetComponent`, timer-host integration tests, timer e2e.
- Revisit when: users report wanting countdown back; unanimous check causes issues with large groups (awareness lag).
