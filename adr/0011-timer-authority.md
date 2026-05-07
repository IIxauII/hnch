# ADR-0011: Timer canonical time authority

**Status:** Superseded by ADR-0018
**Date:** 2026-04-21

## Context

- Optional round timer (configurable, auto-reveal on expiry; see ADR-0015) needs canonical "when did this start" so countdowns agree across clients.
- No authoritative server (ADR-0001) — each peer has own clock; backgrounded tabs throttle `setTimeout`.

## Decision

On round start, current host (ADR-0010) writes `timerStartedAt = Date.now()` and `timerDurationMs = <configured>` into Yjs doc. Each client computes `remaining = timerDurationMs - (Date.now() - timerStartedAt)` locally. No clock sync — sub-second drift acceptable at 60–300s timer durations. **Expiry authority:** current host's client writes the reveal-transition event when its local timer hits zero — single authoritative event, not a per-client race. **Mid-timer host handoff:** new host computes elapsed from `timerStartedAt` and takes over expiry; timer does not restart.

## Options

- **A — Host broadcasts `timerStartedAt`; clients compute local (chosen):** minimal doc state; same reference timestamp for all; graceful handoff via doc; no protocol beyond one field. Cons: malicious host could write skewed timestamp; no cross-client clock sync — neither matters at this fidelity.
- **B — Start broadcast + periodic tick heartbeats:** tighter lockstep. Cons: many more wire messages; doc churn; imperceptible UX gain; same host-disconnect failure mode.
- **C — Session-epoch reference + offset broadcasts:** tightest peer accuracy. Cons: NTP-like sync at join — real engineering for imperceptible benefit.
- **D — Server-authoritative timer:** perfect accuracy. Cons: violates ADR-0001 content-blindness; relay would need to know what "timer" means.

## Trade-offs

- Visual countdown can drift ~1s between peers — acceptable at planning-poker fidelity.
- Reveal event is deterministic (single writer) even when display drifts.
- Options B/C solve a precision problem we don't have; D rejected on architectural grounds.

## Consequences

- Easier: timer = few lines of doc-read + local countdown; handoff just works; no sync protocol.
- Harder: edge case — host drops in final seconds + 5s election debounce (ADR-0010) → "timer expired but no host" gap. Mitigation: any client may write reveal event if `now > timerStartedAt + timerDurationMs` and no reveal exists; reveal idempotent via Yjs merge. Background tabs may tick less frequently visually but doc state stays correct.
- Revisit when: vote-signing/host-auth work → require reveal signed by current host; visible drift complaints (unlikely).

## Action Items

- [ ] Implement host-writes-`timerStartedAt` at round start.
- [ ] Local countdown via `requestAnimationFrame` or interval driven off doc field.
- [ ] Idempotent-reveal fallback for host-drops-at-expiry; explicit test.
- [ ] Document timer protocol so fallback is not accidentally removed.
