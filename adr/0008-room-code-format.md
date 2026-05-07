# ADR-0008: Room code format and lifecycle

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Users join sessions primarily via short human-typeable code (alongside links/QR).
- Format affects voice-call sharing, mobile typing, short-term memorability.
- Collision/reuse policy affects whether returning user lands in the right room.

## Decision

Room codes are **6-char alphanumeric** from uppercase letters + digits, excluding look-alikes `0`, `O`, `1`, `I`, `L`. Example: `K7P9MR`. Matching case-insensitive; optional dash separator (`K7P-9MR`) tolerated; stored normalized (uppercase, no dash). Each room has stable internal UUID; code points to UUID. On last-peer disconnect, code is **retired** for snapshot TTL window (ADR-0012); after TTL, code returns to pool.

## Options

- **A — 6-char alphanumeric, no look-alikes (chosen):** ~887M combinations, speakable, quick to type, forgiving. Cons: not memorable across days; generic shape.
- **B — Word codes (`brave-otter-42`):** more memorable, friendlier. Cons: curated wordlist with offensive/trademark filtering; longer mobile typing; voice readback harder; locale issues.
- **C — Numeric-only 6 digits:** fastest mobile numpad entry. Cons: 1M pool — tighter, more guessable; less distinctive scanning lists.

## Trade-offs

- Look-alike exclusion costs trivial entropy at this scale → big UX win.
- Code/UUID decoupling adds small implementation cost around creation/lookup.
- Codes not memorable across days — users need link/code to return.

## Consequences

- Easier: typing, voice-sharing, ~zero collision risk; retire-then-release prevents stale-code mis-routing.
- Harder: extra indirection (code → UUID) in relay data model.
- Revisit when: users complain codes hard to share → add word-code option; brute-force join attempts → rate-limit code-resolution endpoint.

## Action Items

- [ ] Implement code generator + uniqueness check vs active + retired codes.
- [ ] Normalization fn (strip dashes, uppercase) used at input + comparison.
- [ ] Retire-release lifecycle on relay tied to ADR-0012 snapshot TTL.
- [ ] Document UUID ↔ code mapping in relay data model.
