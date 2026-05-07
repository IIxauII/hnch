# ADR-0008: Room code format and lifecycle

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Users join sessions primarily via short human-typeable code (alongside links/QR).
- Format affects voice-call sharing, mobile typing, short-term memorability.
- Collision/reuse policy affects whether returning user lands in the right room.

## Decision

Room codes are **6-char alphanumeric** from uppercase letters + digits, excluding look-alikes `0`, `O`, `1`, `I`, `L`. Example: `K7P9MR`. Matching case-insensitive; optional dash separator (`K7P-9MR`) tolerated; stored normalized (uppercase, no dash). ~887M combinations. Each room has stable internal UUID; code points to UUID. On last-peer disconnect, code is **retired** for snapshot TTL window (ADR-0012); after TTL, code returns to pool.

## Trade-offs

- Look-alike exclusion costs trivial entropy at this scale → big UX win.
- Code/UUID decoupling adds small implementation cost around creation/lookup.
- Codes not memorable across days — users need link/code to return.

## Consequences

- Easier: typing, voice-sharing, ~zero collision risk; retire-then-release prevents stale-code mis-routing.
- Harder: extra indirection (code → UUID) in relay data model.
- Revisit when: users complain codes hard to share → add word-code option; brute-force join attempts → rate-limit code-resolution endpoint.
