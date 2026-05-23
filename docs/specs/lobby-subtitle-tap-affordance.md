# Lobby subtitle tap affordance on mobile

**Status:** Draft
**Date:** 2026-05-20
**Source:** https://github.com/IIxauII/hnch/issues/273

## Problem

In the Lobby, the subtitle below the room code (e.g. "Round 3 • Fibonacci") is a button that opens the session settings half-sheet when tapped. On mobile — the primary target platform — there are no hover states, and the button is "visually indistinguishable from a read-only label": plain muted gray text, no trailing icon, no underline, no chevron. Hosts have no reason to tap muted informational text, so the shortcut is practically invisible. The empty-string case also renders an invisible zero-height tap target.

## Users

- **Host on mobile** — primary beneficiary; uses the subtitle as a one-tap shortcut to scale and access-mode pickers between rounds.
- **Non-host participants (voter / viewer) on mobile** — see the subtitle as informational text only; affordance must not imply interactivity they cannot use.

## Current behavior

Visual baseline:
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/lobby-host.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/lobby-voter.png?raw=true

## Proposed behavior

- Host on mobile sees the subtitle text followed by a small `pencil-outline` icon, communicating "tap to edit" without hover.
- Tap on text or icon opens the existing session settings half-sheet (no behavior change).
- Non-host participants see the subtitle text only — no icon, affordance not implied.
- When `subtitle()` resolves to empty string, no button (and no icon) is rendered in the DOM.
- Existing hover-color transition (portal) and `focus-visible` outline preserved; icon participates in the hover color transition via inherited color.
- Icon visible in both light and dark themes via the same color token used by subtitle text.

## Success criteria

- On mobile (≤430 px), the subtitle on the host's Lobby renders with a visible trailing pencil icon.
- Tapping the subtitle (text or icon) opens the session settings half-sheet — no regression.
- Non-host participants see no icon next to the subtitle.
- No empty button element is rendered when subtitle text is empty.
- Light and dark themes both render the icon with the muted subtitle color at rest and the active text color on hover (portal).
- `focus-visible` outline still applies to the button after the change.

## Scope

**In:**
- Add trailing `pencil-outline` icon to the Lobby subtitle button for hosts.
- Guard the button with a non-empty subtitle check.
- Hide the icon for non-host participants (keep text).
- Preserve hover, focus-visible, and theme behavior.

**Out (explicit anti-goals):**
- Redesign of the room-code + subtitle block (Issue #266).
- Changes to the session settings sheet content or layout.
- Changes to non-host waiting guidance (Issue #181, closed).
- Hover-color rework on portal (Issue #192, closed).

## Open questions

- None remaining after interview.

## ADR impact

None — pure UX/client change. No ADR touched.

## References

- Issue: https://github.com/IIxauII/hnch/issues/273
- Related open: #266 (Lobby section visual hierarchy)
- Related closed: #192 (hover color on portal), #181 (non-host waiting guidance)
- `docs/angular.md`, `docs/ionic.md` — icon registration via `addIcons()`.
