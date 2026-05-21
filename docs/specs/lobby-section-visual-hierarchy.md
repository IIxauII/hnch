# Lobby section visual hierarchy

**Status:** Draft
**Date:** 2026-05-21
**Source:** https://github.com/IIxauII/hnch/issues/266

## Problem

On the lobby page the split between sections (General / Share / Participants / Agenda / History) is not visually clear: "section boundaries blend together", "widths inconsistent across sections", and the page is "hard to scan / differentiate at a glance" (issue #266). On desktop the lobby is a single column stack that wastes horizontal space, making the page longer than it needs to be and giving no visual rhythm between blocks. New joiners and returning hosts both have to read body content to figure out which section they are looking at.

## Current behavior

Lobby today is a vertical column of sections with inconsistent inner widths and weak boundaries between blocks. Same layout on mobile and desktop — the desktop view is a stretched mobile column.

Baseline references on `main`:

- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/baseline/06-lobby-1440.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/baseline/20-lobby-390.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/baseline/15-lobby-results-1440.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/baseline/4a-lobby-no-history-yet-1440.png?raw=true

## Users

Both **host** and **joiner** (voter / viewer) on the lobby screen. Same unified hierarchy for both roles — host sees additional affordances inside sections, but the section rhythm and structure are identical. Mobile (390) and desktop (≥1024) viewports both in scope.

## Proposed behavior

After this ships:

- Every lobby section (General, Share, Participants, Agenda, History) reads as a distinct block. A first-time viewer can name each section without reading its body content — section identity comes from boundary, heading, and placement.
- Inner widths and padding are consistent across sections. No visual jitter while scrolling top-to-bottom.
- On desktop (≥1024px) the lobby uses horizontal space: sections lay out in a multi-column / split arrangement rather than one tall column, reducing scroll and making the room status legible above the fold.
- On mobile the column stack remains, but with clearer boundaries, uniform widths, and selective progressive disclosure for secondary content (e.g. collapsible blocks) to cut noise.
- If a small behavior tweak materially improves hierarchy (e.g. defaulting a section collapsed, reordering, surfacing a summary), it is in scope — but the redesign is layout-first, not feature-led.

UX flows themselves (joining, sharing, kicking, agenda mgmt, round start, viewing history) are unchanged. See `docs/ux.md`.

## Success criteria

- A new user can name each lobby section at a glance (section identity legible from boundary + heading without reading body content).
- Desktop lobby at 1440 uses horizontal space — not a pure single-column stack.
- Inner widths and padding are consistent across sections at both 390 and 1440.
- Above-the-fold density on desktop improves: visibly less vertical scroll to reach the bottom of the lobby with a typical session (a few participants, an agenda, some history).

## Scope

**In:**

- Layout, spacing, boundaries, headings, and responsive arrangement for all lobby sections (General, Share, Participants, Agenda, History).
- Desktop multi-column / split layout at ≥1024px.
- Mobile boundary + width + heading polish at 390.
- Progressive disclosure (collapse/expand) on secondary blocks where it sharpens hierarchy.
- Small behavior changes inside sections **only if they materially improve hierarchy or scannability**; layout-driven, not feature-driven.

**Out (explicit anti-goals):**

- Feature additions or behavior rewrites unrelated to hierarchy (no new agenda capabilities, no new share targets, no new participant actions).
- New theme tokens / color system or palette changes — use existing tokens.
- Estimating page redesign.
- Round history component internals — reposition / re-frame only; do not rework the row layout.
- New ADR — this is a pure UX/client layout change.

## Open questions

- Desktop breakpoint: where does the multi-column layout kick in? `1024` is the working assumption; the planner should confirm against current responsive breakpoints in the client.
- Which sections, if any, default to collapsed on mobile vs desktop? History is the obvious candidate; Agenda is borderline.
- Are there any sections that should move position (e.g. Share closer to General, History below the fold by default)?
- How does the new layout interact with the existing lobby host-actions portal (`docs/specs/lobby-host-actions-portal.md`) and participants-summary work (`docs/specs/lobby-participants-summary-redundant.md`)? Ordering across these specs may matter.

## ADR impact

None — pure UX/client layout change. No structural decisions about identity, sync, persistence, or relay surface. Existing theme tokens and component primitives are reused.

## References

- Issue: https://github.com/IIxauII/hnch/issues/266
- Related specs: `docs/specs/lobby-host-actions-portal.md`, `docs/specs/lobby-participants-summary-redundant.md`, `docs/specs/lobby-subtitle-tap-affordance.md`
- UX flows: `docs/ux.md`
- Angular / Ionic conventions: `docs/angular.md`, `docs/ionic.md`

## Screenshot scope (suggested)

Informational only — `/plan` is the authority on `.screenshot-tags`. Likely useful tags: `baseline` (lobby 390 + 1440), plus a new `lobby-hierarchy` tag covering lobby empty / lobby with participants+agenda / lobby with history, at 390 and 1440, light + dark.
