# ADR-0008: Room code format and lifecycle

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

## Context

Users join sessions primarily by sharing a short human-typeable code (in addition to links and QR codes). The code format affects user experience — how easy is it to say over a voice call, to type on a phone, to remember for a few minutes — and the collision / reuse policy affects whether a returning user lands in the right room.

## Decision

Room codes are **6-character alphanumeric**, drawn from uppercase letters and digits, excluding the look-alike characters `0`, `O`, `1`, `I`, and `L`. Example: `K7P9MR`. Matching is **case-insensitive** and tolerates an optional separator dash for readability (`K7P-9MR`); internally, the code is stored and compared in normalized form (uppercase, no dash).

**Lifecycle:** when the last peer disconnects from a room, the code is **retired** — reserved and unusable for new sessions — for the duration of the snapshot TTL window (see ADR-0012). After the TTL elapses, the snapshot is discarded and the code returns to the pool for future sessions.

Internally, each room has a stable UUID; the 6-character code is a pointer to that UUID. This decouples code recycling from snapshot identity and allows aliasing in the future if needed.

## Options Considered

### Option A: 6-character alphanumeric, no look-alikes (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | None |
| Scalability | Excellent — ~887M combinations |
| Team familiarity | Standard |

**Pros:** 31-character alphabet (26 letters − 3 look-alikes + 10 digits − 2 look-alikes) × 6 positions gives ~887M combinations, which is collision-proof at any realistic concurrency; speakable over a voice call; quick to type; case-insensitive input is forgiving.
**Cons:** not particularly memorable; shares the same surface-shape as other tools' codes.

### Option B: Word-based codes, e.g. `brave-otter-42`

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium (curated wordlist) |
| Cost | Maintenance of the wordlist |
| Scalability | Good |
| Team familiarity | Standard |

**Pros:** more memorable, friendlier, pleasant to share.
**Cons:** requires a curated wordlist with ongoing offensive-word and trademark filtering; longer to type on mobile; harder to read back over voice; locale questions for non-English users.

### Option C: Numeric-only, 6 digits

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | None |
| Scalability | 1M combinations — adequate for the scale but tight |
| Team familiarity | Standard |

**Pros:** fastest to type on a mobile numpad; easy to read aloud; no confusion about letter case.
**Cons:** smaller pool — 1M codes, which means more frequent collisions when busy and more guessability; less distinctive to humans scanning a list.

## Trade-off Analysis

Option A is the pragmatic sweet spot: large pool, manageable typing cost, speakable, no wordlist to maintain. Word codes (B) are genuinely nicer to share but not by enough to justify the wordlist maintenance and the mobile-typing cost. Numeric-only (C) is fine at today's scale but leaves less headroom if the product grows meaningfully, and it's slightly more guessable for anyone trying to brute-force join a random room.

The look-alike exclusion (0/O/1/I/L) is a direct improvement in user experience at the cost of a small entropy reduction that doesn't matter at this scale. The optional separator dash is a display-layer convenience that doesn't affect the underlying identifier.

## Consequences

**Easier:**
- Codes are easy to type, speak, and share.
- Collision probability is effectively zero at realistic concurrent session counts.
- The retire-then-release lifecycle prevents a returning peer from accidentally landing in a new session at their old code.

**Harder:**
- The code is not memorable across days — users will need to save the link or code if they want to return to a specific meeting's record.
- The decoupling between code (lookup) and UUID (identity) means slightly more code to write around room creation and lookup.

**Revisit triggers:**
- User feedback that codes are hard to share → consider word-based codes (Option B) as an alternative input format.
- Evidence of brute-force join attempts at scale → consider adding rate limiting on the relay's code-resolution endpoint (mitigation rather than format change).

## Action Items

- [ ] Implement the code generator and the uniqueness check against active + retired codes.
- [ ] Design the normalization function (strip dashes, uppercase) and use it consistently at input and comparison time.
- [ ] Implement the retire-release lifecycle on the relay tied to the snapshot TTL of ADR-0012.
- [ ] Document the room UUID → code mapping in the relay's internal data model.
