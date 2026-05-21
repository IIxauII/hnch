# Celebration overlay: clipped, harsh green pill, missing on first reveal

**Status:** Draft
**Date:** 2026-05-21
**Source:** https://github.com/IIxauII/hnch/issues/291

## Problem

After the hnch'd celebration shipped in #284, the overlay has two visual issues on consensus reveals. "Our recent hnch'd celebration looks pretty fucked … I think it's bound by the history table. The color is also awful. Maybe no color would be better."

The badge and confetti are confined to `VoteResultsComponent`'s box, so the round-history section below crops the lower half of the celebration. The badge background is a saturated success-green pill that clashes with the rest of the results card on the dark theme and reads as visually loud in both themes.

Separately, the overlay does not appear on the initial consensus reveal — it only renders after a page reload. The `reveal/consensus-*` screenshot scenes on `main` confirm the regression: those captures show the post-reveal lobby with no overlay even though the e2e specs explicitly target the consensus celebration. Whatever signal currently mounts the overlay misses the live reveal transition and only catches the post-reload re-render.

## Current behavior

Visual baseline (existing reveal scenes on `main`):

- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/reveal/reveal-02-post-reveal-lobby.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/reveal/reveal-01-pre-reveal-estimating.png?raw=true

User-supplied screenshot of the visual regression (local): `2026-05-21_14-47.png` — green pill bisected horizontally by the history-section divider; confetti emojis disappear at the same line.

Reference for the missing-overlay regression: `docs/screenshots/sha-c023d13/reveal/` on the `screenshots` branch — `consensus-motion-*` and `consensus-reduced-*` captures show the post-reveal lobby with no overlay rendered.

## Users

All participants — voter, host, viewer — on mobile (Ionic shell) and portal (browser/desktop) when a consensus reveal fires.

## Proposed behavior

When consensus fires after reveal, the celebration overlay appears immediately on the live reveal transition — no page reload required — and covers the entire `ion-content` area of the current page (estimating or lobby), not just the `VoteResultsComponent` card. The Ionic toolbar (back-chevron, title, host actions) stays visible and interactive — the overlay sits under the toolbar layer so users can navigate away during the ~3 s celebration.

The badge itself has no background pill. The "hnch'd!" text renders as bold white type with a soft drop-shadow, sitting over the existing dimmed backdrop. Confetti emojis stream out from the badge and are no longer clipped by sibling sections.

Click-to-dismiss, ~3 s auto-dismiss, spring scale-in animation, pulse, and `prefers-reduced-motion` behavior are all preserved.

## Success criteria

- Overlay appears on the **first** consensus reveal in a session (no reload required) for every participant who is connected at reveal time.
- The same overlay still appears for a participant who reloads or joins after reveal, as long as the round is still inside the celebration window — existing behavior, no regression.
- The `reveal/consensus-motion-*` and `reveal/consensus-reduced-*` screenshot captures on `main` show the overlay rendered (no more blank post-reveal lobby).
- On a consensus reveal at mobile width (390 px), the dimmed scrim and "hnch'd!" badge cover the full content area — both the results card and the history section below it — with no horizontal clip line at the section boundary.
- On portal width (1280 px), the scrim is bounded to `ion-content` (or equivalent page content container), not the full browser window — the app's toolbar/header remains visible.
- The Ionic toolbar back-button is visible and tappable while the overlay is active on both widths.
- Badge renders as bold white text with shadow, no green pill, in both light and dark themes; backdrop dim is sufficient for legibility.
- Confetti emojis are not clipped by the lower edge of the results card.
- Click-to-dismiss and ~3 s auto-dismiss continue to work.
- Non-consensus rounds show no overlay (no regression).
- `prefers-reduced-motion` path unchanged (instant appearance, no confetti, static `🎉`).
- Existing vote-results test suite (`vote-results.component.test.ts`) keeps passing — selectors `.consensus-overlay`, `.confetti-layer`, `.consensus-text` and the AC-11/12/13/14 assertions stay valid.

## Scope

**In:**
- Fix the live-reveal render path so the overlay appears on initial consensus reveal, not only after reload.
- Reposition the consensus overlay so it spans the full page content area instead of the VoteResults card bounds.
- Drop the success-green pill background; render bold white text + drop-shadow over the dimmed scrim.
- Keep all existing dismiss behaviors, keyframes (`consensusScaleIn`, `consensusPulse`, `hnchdConfetti`), haptics, and a11y (`aria-live="polite"`).
- Update / re-baseline `reveal/consensus-*` screenshot scenes so they actually capture the rendered overlay.

**Out (explicit anti-goals):**
- Changing the 3-second auto-dismiss duration.
- Changing the badge text ("hnch'd!"), font weight scale, or spring curve.
- Changing the confetti emoji set, piece count, or stream timing.
- Haptic sequence changes.
- Any change to the non-consensus reveal flow or the abstain/skip guards from ADR-0040/0041.
- Covering the Ionic toolbar — back-button must remain reachable.

## Open questions

- Exact mounting point for "page-scoped but below toolbar" — does the overlay stay rendered inside `VoteResultsComponent` with CSS adjustments, or does it move to a portal/sibling container inside `ion-content`? Surface for `/plan`.
- Whether light-theme backdrop alpha needs a bump beyond the current `0.45` for white-on-light legibility once the green pill is gone. `/plan` to verify against a light-theme reveal screenshot.
- Root cause of the missing-on-first-reveal bug: is it a stale `showOverlay()` signal init, a missed effect on the `revealedAt` transition, a race between consensus detection and the round-swap reset, or an SSR/hydration gap? `/plan` to investigate before choosing the fix shape.
- Are the existing e2e captures failing because the app doesn't render (real bug) or because the harness samples the frame before the overlay mounts (test-side timing)? `/plan` to confirm via local repro.

## ADR impact

None — pure visual/positioning change. Prior `consensus-overlay-scope-to-component.md` (issue #257) is not formalized as an ADR, and the toolbar-accessibility intent from that spec is preserved here (overlay stays below the toolbar layer).

## References

- Issue: https://github.com/IIxauII/hnch/issues/291
- Prior spec: `docs/specs/consensus-overlay-scope-to-component.md` (issue #257)
- Origin spec: `docs/specs/consensus-celebration-hnchd.md` (PR #284)
- Component: `packages/client/src/app/shared/vote-results.component.ts`

## Screenshot scope (suggested)

Reuse existing `reveal/` tag — add a consensus-celebration variant of `reveal-02-post-reveal-lobby` so the new overlay treatment is captured in both light and dark themes. `/plan` decides the exact tag.
