# ADR-0011: Timer canonical time authority

**Status:** Superseded by ADR-0018
**Date:** 2026-04-21
**Deciders:** Xau

## Context

The optional round timer (configurable for the session, triggers auto-reveal on expiry; see [ADR-0015](0015-v1-scope-session-level-reveal-and-timer.md) for scope) needs a canonical notion of "when did this start" so that all participants see a consistent countdown. In a distributed-client architecture with no authoritative server (ADR-0001), this isn't automatic: each peer has its own clock, and host-side `setTimeout` calls can be throttled in backgrounded browser tabs.

## Decision

When a round starts, the current host (per ADR-0010) writes `timerStartedAt = Date.now()` and `timerDurationMs = <configured duration>` into the Yjs doc. Every client computes its local countdown as `remaining = timerDurationMs - (Date.now() - timerStartedAt)`. Clients do not synchronize clocks with each other — sub-second drift is acceptable at planning-poker timer durations (60–300 seconds).

**Expiry authority:** the current host's client is solely responsible for writing the reveal-transition event into the Yjs doc when its local timer reaches zero. This ensures the reveal is a single authoritative event rather than a race between every client noticing expiry.

**Host handoff mid-timer:** because `timerStartedAt` is in the synced doc, a newly-elected host can compute "we are X seconds into this timer" and take over expiry duties seamlessly. The timer does not restart on host change.

## Options Considered

### Option A: Host broadcasts timerStartedAt; clients compute local (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | None |
| Accuracy | Sub-second drift, imperceptible |
| Team familiarity | Standard |

**Pros:** minimal state in the doc; every client sees the same reference timestamp; graceful host handoff because authority derives from the doc, not from live messaging; no protocol required beyond a single doc field.
**Cons:** a malicious host could write a `timerStartedAt` far in the past or future; no cross-client clock sync means the wall-clock display can be a second off between peers. Neither matters at the fidelity planning poker needs.

### Option B: Broadcast start + periodic tick heartbeats

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | More messages on the wire |
| Accuracy | Tighter, but unnecessary |
| Team familiarity | Standard |

**Pros:** clients stay in lockstep via server-side ticks (or in this case, host-side ticks); reduces display drift.
**Cons:** many more messages; Yjs doc has more frequent small updates; doesn't meaningfully improve user experience at these timer durations; fails identically under host disconnect.

### Option C: Session-epoch reference with offset broadcasts

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium-High |
| Cost | Clock-sync protocol at join time |
| Accuracy | Tightest across peers |
| Team familiarity | Low |

**Pros:** reduces sensitivity to wall-clock skew between peers by negotiating a shared reference time.
**Cons:** requires implementing NTP-like sync on join; real engineering work for a benefit that is imperceptible at our timer fidelity.

### Option D: Server-authoritative timer

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Adds stateful logic to the relay |
| Accuracy | Perfect |
| Team familiarity | Standard |

**Pros:** no distributed timer problem at all — the server is the clock.
**Cons:** violates ADR-0001's content-blind relay; the relay would have to know what a "timer" is and what "expiry" means; moves logic back to the server we chose not to build.

## Trade-off Analysis

Option A is the least complex approach that works at the fidelity our product needs. Planning poker timers are coarse — a participant seeing `0:32` while the host sees `0:33` is imperceptible and inconsequential. The *authoritative moment* (the reveal event) is written by exactly one client, so the reveal itself is deterministic even if visual countdowns drift.

Options B and C solve a precision problem we don't have. Option D is the simplest *in isolation* but is rejected on architectural grounds — we chose a content-blind relay deliberately and are not going to re-introduce session semantics there for this single use case.

## Consequences

**Easier:**
- Timer implementation is a few lines of doc-state read + local countdown.
- Host handoff mid-timer just works — the new host inherits `timerStartedAt` and handles expiry.
- No synchronization protocol to maintain.

**Harder:**
- Edge case: host drops during the final few seconds of the timer. The 5-second election debounce (ADR-0010) could cause a "timer expired but no host" gap. We handle this by: if any client observes `now > timerStartedAt + timerDurationMs` and no reveal event exists in the doc, *any* client may write the reveal event as a fallback. This is acceptable because reveal is idempotent — Yjs will merge concurrent reveal writes to the same logical event.
- A background/throttled tab may tick less frequently than once per second visually, but the underlying expiry timestamp is still in the doc, so state remains correct when the tab regains focus.

**Revisit triggers:**
- If we add vote-signing or stronger host authentication, we may want to require the reveal event to be signed by the current host to prevent fallback-reveal abuse.
- If user reports surface visible timer drift complaints, revisit (unlikely).

## Action Items

- [ ] Implement the host-writes-timerStartedAt protocol at round start.
- [ ] Implement the local countdown with `requestAnimationFrame` or an interval driven off the doc field.
- [ ] Implement the idempotent-reveal fallback for the host-drops-at-expiry edge case and explicitly test it.
- [ ] Document the timer protocol in developer docs so the fallback behavior is not accidentally removed later.
