# Consensus celebration: gravity-based emoji bursts

**Status:** Draft
**Date:** 2026-05-22
**Source:** https://github.com/IIxauII/hnch/issues/303

## Problem

> "Current consensus celebration … uses a spiral emoji effect emanating from the hnch logo center. It feels uncontained and visually weak. Emoji density is also too low."

When a round reaches unanimous consensus, the celebration is supposed to be the emotional payoff of the meeting. Today's spiral reads as a thin, drifting halo rather than a burst — small particle count and curved drift make it feel like a screensaver, not a reward.

## Users

All session participants — host, voters, viewers. Everyone watching the reveal sees the same celebration on their own client.

## Current behavior

Visual baseline (post-reveal Lobby, where the celebration plays):

- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/reveal/reveal-02-post-reveal-lobby.png?raw=true

## Proposed behavior

On a consensus reveal, the celebration overlay plays one of three gravity-based emoji bursts, picked uniform-random per reveal (each reveal = one pattern, not mixed):

1. **Center explosion** — emojis burst outward from the hnch logo center on parabolic arcs, gravity pulls them down to the floor.
2. **Top sprinkle** — emojis rain from the top edge across the viewport width, paths slightly irregular for a natural feel, gravity pulls down.
3. **Side cannons** — emojis launch inward from the left and right edges like thrown balls, arcing under gravity.

All three obey true gravity (initial velocity vector + constant downward acceleration). Small per-particle jitter (angle, initial speed, drag) keeps the burst from looking mechanically uniform. Particle density is ~5× the current celebration so the screen feels filled, not sprinkled. Spawn timing is staggered in waves (reusing the existing batched-spawn cadence) rather than a single instant pop, so the 5× count releases over a short window and has time to fall.

The headline / text effect ("hnch'd") is unchanged. Haptics and (absent) sound are unchanged. `prefers-reduced-motion` continues to suppress the celebration entirely.

## Success criteria

- On any consensus reveal, one of the three gravity bursts plays; the spiral effect is never visible.
- Successive reveals in the same session visibly use different patterns over time (not all the same).
- Every particle's vertical motion accelerates downward (no straight drifts, no upward-curving paths after apex).
- With `prefers-reduced-motion` enabled, no particles render.
- A reviewer comparing before/after on the post-reveal Lobby screen describes the new effect as "filled" / "burst" / "celebratory" rather than "sparse" / "drifting".

## Scope

**In:**
- Replace spiral spawn position + motion integration with three gravity-based patterns.
- Increase emoji density ~5×.
- Random pattern selection per reveal.
- Update existing component tests to match new behavior.

**Out (explicit anti-goals):**
- Text / headline animation changes.
- Haptic timing changes.
- Sound (none today, not adding).
- Per-particle pattern mixing within a single reveal.
- Theming, emoji set changes, or new emojis.
- Configurability (no user setting, no flag, no fallback to spiral).

## Open questions

- Exact target particle count: issue says "~5× current `CONFETTI_BATCH_SIZE = 30`" → ~150. Confirm at `/plan` time whether 150 holds up perf-wise on low-end mobile, or whether to land somewhere between 100–150.
- Side-cannons launch points: vertically centered, or jittered along each side edge? Defer to `/plan` and visual iteration.

## ADR impact

None — pure UX/client change inside `vote-results.component.ts`. No protocol, schema, identity, or relay surface touched.

## References

- Issue: https://github.com/IIxauII/hnch/issues/303
- Adjacent specs (consensus celebration history): `docs/specs/consensus-celebration-hnchd.md`, `docs/specs/celebration-overlay-fix.md`, `docs/specs/consensus-overlay-scope-to-component.md`

## Screenshot scope (suggested)

Tag the post-reveal Lobby scene (`reveal-02-post-reveal-lobby`) so before/after density and motion are diff-able. `/plan` is the authority on the final `.screenshot-tags` set.
