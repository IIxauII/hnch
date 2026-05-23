# Lobby host participant actions on portal

**Status:** Draft
**Date:** 2026-05-18
**Source:** https://github.com/IIxauII/hnch/issues/240

## Problem

On the Lobby screen the host can slide a participant row left to reveal **Make Host** and **Remove** via `IonItemSliding`. On portal (desktop, `pointer: fine`) the gesture relies on touch events and does not fire on mouse drag — the drawer never opens. The hint text "Swipe a row for host actions." still renders on desktop where the gesture has no effect. A host joining from a laptop browser therefore has **no way** to remove a participant or transfer host rights from the Lobby.

## Users

- **Host on portal** (desktop browser, `pointer: fine`) — primary; currently blocked.
- **Host on mobile** (touch) — existing behavior must remain unchanged.
- Non-host voters / viewers — unaffected (no host actions surfaced to them).

## Proposed behavior

- Mobile (touch): unchanged — `IonItemSliding` reveals Make Host / Remove; swipe-hint visible when accordion open.
- Portal / tablet (`pointer: fine`): each non-self participant row in the host's view shows a per-row overflow button (`···`, `slot="end"`). Clicking it opens a popover (rendered via the existing `SurfaceService.openSheetOrPopover()` desktop branch) with two items: **Make host** (primary) and **Remove** (destructive). Tapping either triggers the existing confirmation alert flow.
- Portal: the swipe-hint paragraph is not rendered.
- Light and dark themes both render the overflow button and popover correctly.

## Success criteria

- Host on portal (1280 px, mouse) can transfer host rights and remove a participant from the Lobby without touchscreen input.
- Host on mobile (390 px, touch) can still swipe a row to reveal the same two actions.
- Swipe-hint text is shown only on the mobile surface.
- Self-row and non-host rows show no overflow control on any surface.
- Remove and Make Host confirmation alerts behave identically on mobile and portal.

## Scope

**In:**
- Lobby participant-row host actions on portal/tablet via overflow button → popover.
- Gating the swipe-hint on the mobile surface only.

**Out (explicit anti-goals):**
- Participant management from the Estimating screen.
- Keyboard-only host action flow (separate a11y concern).
- Changes to the underlying `onHandoffTap` / `onRemoveTap` confirmation alerts.
- Non-host participant rows (no actions, unaffected).
- Patching Ionic internals to make `IonItemSliding` respond to mouse drag.

## Open questions

None — implementation surface, handlers, and viewport behavior are specified in the issue.

## ADR impact

None — pure client UX change. Reuses `SurfaceService` (already established) and existing `MenuPopoverComponent`.

## References

- Issue: https://github.com/IIxauII/hnch/issues/240
- `packages/client/src/app/core/surface.service.ts` — `mode()` signal
- `packages/client/src/app/shared/menu-popover/menu-popover.component.ts`
- `docs/ionic.md`, `docs/angular.md`
