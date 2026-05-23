# Vote value card-face badges in results

**Status:** Draft
**Date:** 2026-05-21
**Source:** https://github.com/IIxauII/hnch/issues/286

## Problem

After a round is revealed, vote values in the results section render as plain bold text in a fixed-width left column followed by a row of voter name chips. The app's identity is the planning poker card metaphor — on Estimating, participants "play a card" rendered as a bordered, elevated, rounded tile. At reveal — the payoff moment when all cards are simultaneously "flipped" — the revealed values drop that metaphor entirely. "Scanning the post-reveal distribution requires parsing values from surrounding text rather than recognising shaped card-faces at a glance." Friction is low on mobile (narrow column) but noticeable on portal (1440 px) where the results column is wide and the gap between plain-text value and chip row is visually ambiguous.

Current behavior:
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/reveal/reveal-02-post-reveal-lobby.png?raw=true (portal, dark)
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/baseline/16-lobby-results-390.png?raw=true (mobile, dark)

## Users

Any participant viewing the results section after reveal — host, voter, viewer. All platforms (mobile + portal/desktop, light + dark mode).

## Proposed behavior

After reveal, each vote group in the results section renders its vote value as a small rounded card-face badge — visibly shaped, bordered, elevated — echoing the Estimating card tile aesthetic at reduced size. Scanning the distribution feels like reading flipped cards rather than a text dump.

"Abstained" and "Didn't vote" group headers stay as plain muted text — they are meta-labels, not card values.

Light and dark modes both carry the badge shape via mode-aware surface tokens. Existing entrance animation on the group rows is unchanged; badges animate in with their parent row and are suppressed under `prefers-reduced-motion`.

## Success criteria

- At ≤430 px (mobile), each numeric vote group renders its value as a rounded badge with visible border and elevated background, distinct from surrounding text.
- At ≥1280 px (portal), the badge renders consistently and does not overflow the row or cause horizontal scroll.
- "Abstained" and "Didn't vote" headers render as plain muted text — no badge.
- In light mode the badge surface reads as elevated over the page background; in dark mode same.
- Staggered group-row entrance animation still plays; reduced-motion suppresses it and the badge still renders correctly.
- No regression on the stats row (Avg / Med / Spread), elapsed time, or any other Lobby section (participants accordion, share actions, agenda, round history).

## Scope

**In:**
- Visual restyle of the vote-value element inside each results group header.
- Suppression rule for non-card groups ("Abstained", "Didn't vote").
- Mobile and portal breakpoints; light and dark mode.

**Out (explicit anti-goals):**
- Changing the shape, size, or layout of estimate cards on the Estimating screen.
- Adding a flip or entrance animation specific to the badge.
- Changing the `(N votes)` count label or voter name chips.
- Changing the stats row, elapsed time, or round history summary list.
- Any relay, shared package, e2e harness, or CLI changes.

## Open questions

None — issue is exhaustive.

## ADR impact

None — pure client UX/style change. No schema, sync protocol, or relay surface touched.

## References

- Issue: https://github.com/IIxauII/hnch/issues/286
- Composes with #197 (vote-results multi-column grid, shipped) — badge sits inside each grid cell.

## Screenshot scope (suggested)

`reveal` + `baseline` tag scopes — both contain the post-reveal Lobby views that visualise the change.
