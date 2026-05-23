# Consensus overlay scope to VoteResultsComponent

**Status:** Draft
**Date:** 2026-05-19
**Source:** https://github.com/IIxauII/hnch/issues/257

## Problem

On Lobby post-reveal, when all votes are identical (consensus), `VoteResultsComponent` renders a celebration overlay with `position: fixed; inset: 0; z-index: 1000` that covers the **entire viewport** — including the Ionic header/toolbar with the back button — for up to 3 seconds. During this window the user "cannot read the freshly-animated vote breakdown (obscured behind the dark scrim), tap the back button, or navigate away." Click-to-dismiss and auto-dismiss work, but no escape route is visible while the overlay is active. On portal/desktop the same `position: fixed` covers the full browser window.

## Users

All participants — voter, host, and viewer — on both mobile (Ionic shell) and portal (browser/desktop) after any consensus reveal.

## Proposed behavior

The "Consensus!" celebration is preserved but scoped to the vote-results section only. The dark scrim and centered "Consensus!" badge appear over `VoteResultsComponent`'s bounding box, not the whole screen. The Ionic toolbar (back-chevron, title) and any content above/outside the vote-results section remain visible and interactive during the ~3 s celebration. Click-to-dismiss and auto-dismiss continue to work. Animation, haptic timing, and `prefers-reduced-motion` behavior are unchanged.

## Success criteria

- Mobile (390 px) consensus round: overlay appears only over `VoteResultsComponent`'s visual area; toolbar back button is visible and tappable while overlay is shown.
- Portal (1280 px) consensus round: scrim is bounded to the vote-results section; page header and surrounding content stay accessible.
- Tapping the toolbar back button while the overlay is active dismisses the overlay and navigates normally on both platforms.
- Light and dark themes render the scrim and badge correctly.
- `prefers-reduced-motion`: badge appears instantly, consistent with existing `@media` guard.
- Non-consensus rounds show no overlay (no regression).
- Auto-dismiss after ~3 seconds still works.
- Vote groups' fade-in-up stagger animation and haptic sequence unchanged.

## Scope

**In:**
- Scope the consensus celebration overlay to `VoteResultsComponent`'s rendered area on consensus reveals.
- Preserve existing dismiss behaviors (click, ~3 s auto), animation keyframes, haptics, and a11y (`aria-live="polite"`).

**Out (explicit anti-goals):**
- Changing the 3-second auto-dismiss duration.
- Changing the "Consensus!" text, color, or spring animation (`consensusScaleIn` / `consensusPulse`).
- Haptic timing or sequence changes.
- Any change to the non-consensus reveal flow.
- Changes to the vote groups' stagger animation.
- Changes to safe-area inset handling.

## Open questions

None — issue specifies the exact CSS change (`:host` gets `position: relative`; `.consensus-overlay` switches `position: fixed` → `position: absolute`), and acceptance criteria are unambiguous.

## ADR impact

None — pure client CSS/UX scoping change. No sync-protocol, identity, access-control, or schema implications.

## References

- Issue: https://github.com/IIxauII/hnch/issues/257
- Component: `packages/client/src/app/shared/vote-results.component.ts` (CSS block ~lines 309–315)
- `docs/ionic.md`, `docs/angular.md` — conventions unaffected
