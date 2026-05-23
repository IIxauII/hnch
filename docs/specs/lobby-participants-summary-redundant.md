# Lobby participants accordion: hide summary when expanded

**Status:** Draft
**Date:** 2026-05-19
**Source:** https://github.com/xauyxau/hnch/issues/241

## Problem

The Lobby's Participants accordion header always renders a summary line — e.g. `"3 online · 1 offline · 1 viewer"` — whether the accordion is open or closed. When the accordion is **open** (pre-reveal state), the full participant list is immediately visible directly below the header: online/offline status renders per-row, viewer status renders via a role chip/note. The summary in the header duplicates that information at the exact moment the list itself is in view, creating visual noise and a redundant second count. The summary is only meaningful when the accordion is **collapsed** (the auto-collapsed post-reveal state).

## Users

- **Host** and **voter** in the Lobby, pre-reveal (accordion open) and post-reveal (accordion auto-collapsed).
- **Viewer** sees identical layout — same UX win.
- Applies on both mobile (≤ 430 px) and portal (≥ 1280 px) breakpoints.

## Proposed behavior

- **Accordion open (pre-reveal):** header shows `Participants (N)` only — no summary line. The participant list below is the single source of truth for online/offline/viewer status.
- **Accordion collapsed (post-reveal, auto-collapsed):** header shows `Participants (N)` and the summary line `X online · Y offline` (or similar) — unchanged from today.
- Light and dark themes render the summary text correctly when visible.
- No change to expand/collapse behavior, summary text content, or the per-row participant rendering.

## Success criteria

- In the pre-reveal Lobby on mobile (390 px) and portal (1280 px), the participants accordion header has no summary line beneath the title.
- In the post-reveal Lobby (accordion auto-collapsed) on both breakpoints, the summary line appears as it does today.
- **Manual toggle parity:** if the user taps the post-reveal header to expand the accordion, the summary hides; tapping again to collapse it brings the summary back. Visibility tracks actual expanded state, not just the auto-collapse intent.
- Single-participant case: no empty `<p>` artifact in the header in either state.
- No regression in accordion expand/collapse, participant list rendering, or theming.

## Scope

**In:**
- Conditional rendering of the existing `participantsSummary()` line in the Lobby accordion header, gated on the collapsed state.

**Out (explicit anti-goals):**
- Any visual change to the collapsed accordion header layout or the summary text itself.
- Any animation on summary in/out as the accordion transitions.
- Changing when the accordion auto-collapses.
- Touching the participant list's per-row online/offline rendering.

## Open questions

None — issue body specifies behavior, breakpoints, and edge cases.

## ADR impact

None — pure UX/client change. No sync protocol, schema, or relay surface touched.

## References

- Issue: https://github.com/xauyxau/hnch/issues/241
- Related UX flow: `docs/ux.md` (Lobby)
- Adjacent spec: `docs/specs/lobby-host-actions-portal.md`
