# Voted dot initials use palette ink color

**Status:** Draft
**Date:** 2026-05-22
**Source:** https://github.com/IIxauII/hnch/issues/295

## Problem

On the Estimating screen, `AvatarVoteRowComponent` renders each participant's voting status as a 24 px colored dot containing their initial letter. The initial is hardcoded to `color: #fff`, but the 12-color avatar palette includes five light-toned entries — **dijon, orange, amber, green, teal** — where white text fails contrast against the dot's background (ratios ≈ 1.1 : 1 to 1.7 : 1). The initial is effectively invisible for ~42 % of palette assignments. The `ACCENTS` table in `packages/shared/src/avatar-palette.ts` already encodes the correct over-base ink (`'#000'` or `'#fff'`) per entry; the dot component predates the `ink` field and never adopted it.

## Users

All participants (host, voter, viewer) using any of the five light-toned palette colors, on both mobile and portal, during an active estimation round. Other participants are affected indirectly — they lose the quick-glance "who has voted" identity cue when a teammate's dot reads as blank.

## Proposed behavior

In the Estimating screen's avatar vote row, the initial letter inside each filled (voted) dot uses the ink color that the palette has declared for that avatar — black on light-toned palette entries (dijon, orange, amber, green, teal), white on dark palette entries (e.g. graphite, racing-green). For custom hex avatar colors that aren't palette keys, ink falls back to a WCAG luminance threshold (light bg → black ink; dark bg → white ink). Unvoted dots, dot sizing, layout, and the pending-names line are unchanged. The fix applies uniformly across mobile and portal viewports and both light and dark themes.

Visual baseline:
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/estimating/estimating-pre-vote.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/estimating/estimating-post-vote.png?raw=true

## Success criteria

- A voted dot for a participant with **amber, dijon, orange, green, or teal** avatar color shows a legible dark initial letter (contrast ≥ 4.5 : 1 against the dot background).
- A voted dot for a participant with **graphite** or other dark palette colors continues to show a legible white initial.
- A custom-hex avatar color (e.g. `#FFFF00`, `#111111`) receives the ink color predicted by relative-luminance threshold and remains legible.
- Behavior is identical on mobile (≤430 px) and portal (≥1280 px), light and dark themes.
- Unvoted dots, "X of Y voted" count, pending-names line, dot sizes, and surrounding layout exhibit no visual regression.

## Scope

**In:**
- Voted-state initial letter color inside `AvatarVoteRowComponent` dots.
- Palette-driven ink resolution for all 12 standard accents.
- Luminance fallback for non-palette (custom hex) avatar colors.

**Out (explicit anti-goals):**
- Lobby participants list avatar icon colors.
- Unvoted dot border or background.
- Dot sizing, row layout, pending-names line, role/connection chips.
- CLI or relay changes.
- Any new palette entries or ink-table edits.

## Open questions

None — the issue specifies the resolution rule (palette ink + luminance fallback at `L > 0.179`) and the affected component surface.

## ADR impact

None — pure UX/client visual fix using existing palette metadata (the `ink` field on `AccentDef`). No schema, sync-protocol, relay, or identity change. No new or superseding ADR required.

## References

- Issue: https://github.com/IIxauII/hnch/issues/295
- Palette source: `packages/shared/src/avatar-palette.ts` (`ACCENTS`, `AccentDef.ink`, `deterministicAvatarColor`)
- Consuming component: `packages/client/src/app/estimating/avatar-vote-row.component.ts`

## Screenshot scope (suggested)

`estimating` — voted/post-reveal states with mixed-palette participants. Informational; `/plan` is the authority on `.screenshot-tags`.
