# Consensus celebration redesign — "hnch'd!" + confetti

**Status:** Draft
**Date:** 2026-05-20
**Source:** https://github.com/IIxauII/hnch/issues/274 (scope pivoted from dismiss-affordance to full celebration redesign)

## Problem

When a round reveals with unanimous consensus, the current overlay shows a green "Consensus!" badge with a scale-in animation on a dark scrim, auto-dismissing after 3 seconds. The moment is functionally communicative but emotionally flat — unanimous consensus is the high point of a planning round and the visual treatment does not celebrate it. Issue #274 framed this as a dismiss-affordance gap; the user reframed it as the wrong target entirely: the celebration itself is underwhelming.

User's framing: *"instead of the consensus we show hnch'd! and a bunch of emoji party / tada / partyhat / disco ball fly around in confetti style."*

## Users

All participants on all platforms (host, voter, viewer) when a round reaches unanimous consensus. Host and voters share the moment; viewers see the same celebration even though they didn't vote.

## Proposed behavior

On unanimous consensus reveal, the existing overlay scrim is replaced with a celebration moment:

- Central badge text reads **"hnch'd!"** (replaces "Consensus!"), styled in the existing success-color palette with the existing scale-in entrance.
- Party emoji fly across the overlay in a confetti-style burst: 🎉 party popper, 🎊 confetti ball, 🥳 partying face, 🪩 disco ball, plus additional fitting suggestions (e.g. ✨ sparkles, 🎈 balloon, 🌟 glowing star, 🎆 fireworks, 🎇 sparkler) — final emoji set to be locked in `/plan`.
- Confetti burst lasts the existing 3-second auto-dismiss window. Tapping anywhere on the overlay dismisses early (existing behavior preserved).
- Non-consensus reveals are unchanged: no overlay, no celebration, normal staggered vote-group reveal only.

Reduced-motion users see a static "hnch'd!" badge with no confetti, no flying emoji, no scale animation — text-only celebration cue.

## Success criteria

- On unanimous consensus, the reveal moment shows "hnch'd!" text + flying emoji confetti instead of the current static "Consensus!" badge.
- The 3-second auto-dismiss window is preserved; tap anywhere on the overlay still clears it early.
- On `prefers-reduced-motion: reduce`, the overlay shows a static "hnch'd!" badge only, with no motion of any element.
- Split-vote (non-consensus) reveals show no celebration overlay — the new treatment is exclusive to unanimous outcomes.
- All platforms (mobile ≤430 px, tablet, portal ≥1280 px) and both themes (light/dark) render the celebration legibly.

## Scope

**In:**
- Replace badge text "Consensus!" → "hnch'd!".
- Add flying-emoji confetti effect over the existing scrim during the 3-second window.
- Define the emoji set (base: 🎉 🎊 🥳 🪩; extended suggestions to be finalized).
- Reduced-motion fallback to a static badge.
- Preserve existing tap-to-dismiss + 3-second auto-dismiss timing.

**Out (explicit anti-goals):**
- Subtitle button redesign (#273) — separate work.
- Lobby section hierarchy (#266) — separate work.
- Audio / haptic celebration cues.
- Confetti for non-consensus reveals.
- Changes to the 3-second auto-dismiss duration.
- Visual countdown / progress indicator on the overlay.
- Changes to the staggered fade-in of vote groups behind the overlay.
- Persisting celebration history (no "you've hnch'd N times" tracker).

## Open questions

- Final emoji set: lock the extended list (✨ 🎈 🌟 🎁 🥂 🎆 🎇 candidates) at `/plan` time, plus per-emoji weighting if some should appear more often than others.
- Confetti density: how many emoji on screen at once? Density-vs-perf trade-off on low-end mobile.
- Confetti motion path: ballistic fall, radial burst from badge center, or both? Should emoji rotate while flying?
- Should the badge text "hnch'd!" pulse or stay static once entered?
- Z-order: do flying emoji pass in front of or behind the "hnch'd!" badge text?
- Naming for telemetry/observability: N/A — ADR-0028, no telemetry.

## ADR impact

None — pure UX/client change. No relay, schema, sync-protocol, or shared-package touch. No ADR amendment or supersession.

## References

- Issue #274 — original (dismiss-affordance framing, superseded by this spec): https://github.com/IIxauII/hnch/issues/274
- Issue #257 — prior consensus overlay fix (scrim scoping), CLOSED.
- ADR-0018 — unanimous auto-reveal (defines when consensus fires; this spec only changes the visual treatment of that moment).
- ADR-0028 — no telemetry (success criteria stay observable/behavioral).
- `docs/ux.md` — reveal flow.
- Component: `packages/client/src/app/shared/vote-results.component.ts` (consumer of this redesign; `/plan` will surface specifics).
