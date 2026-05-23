# Plan: Lobby host actions on portal

**Status:** Ready
**Date:** 2026-05-18
**Source spec:** [docs/specs/lobby-host-actions-portal.md](../specs/lobby-host-actions-portal.md)
**Source issue:** https://github.com/IIxauII/hnch/issues/240
**PR title scope:** `feat(client,e2e): ...`
**Worktree:** `git fetch origin && pnpm worktree:add lobby-host-actions-portal main`

## Summary

Desktop / portal host currently cannot remove a participant or hand off host rights from Lobby — `IonItemSliding` only fires on touch. Add a per-row overflow button (`ellipsis-vertical`, `slot="end"`) that opens a popover (Make host / Remove) via the existing `SurfaceService` desktop branch. Mobile swipe path stays untouched; swipe-hint hidden on portal.

## Approach

- Render overflow button next to each non-self participant row in the host's Lobby view, gated by `surface.mode() === 'desktop'` in the template, AND by the existing `isHost() && p.id !== myId()` predicate.
- Click handler: new wrapper `openParticipantActions(p: ParticipantRow, event: Event)` on `LobbyPage`. Builds two `MenuItem`s (imported from `../shared/menu-popover/menu-popover.component`) — Make host (primary) and Remove (destructive role) — wired to the existing `onHandoffTap` / `onRemoveTap` confirmation flows, and dispatches through `SurfaceService.openSheetOrPopover()`.
- Overflow button carries `[attr.aria-label]="'Host actions for ' + p.displayName"`; the inner `ion-icon` is `aria-hidden="true"`. No keyboard-only flow beyond the free Enter/Space activation on the focused button (separate a11y concern per spec anti-goal).
- On `LobbyPage` destroy, dismiss any open popover (defensive; covers session-end navigation per ADR-0023 while a popover is open).
- Hide swipe-hint paragraph when `surface.mode() === 'desktop'` (template gate).
- Register `ellipsisVertical` via `addIcons({ ellipsisVertical })` at the component level.
- Reuses `MenuPopoverComponent`. No new shared components.

## ADR impact

None. Pure client UX. Reuses `SurfaceService` (established) and `MenuPopoverComponent`.

## Decisions resolved

- **D1 PR shape:** Single PR.
- **D2 Gating:** `surface.mode()` evaluated in template (`@if (surface.mode() === 'desktop')`).
- **D3 Icon:** `ellipsis-vertical`, registered via `addIcons({ ellipsisVertical })`.
- **D4 Handler:** new wrapper method `openParticipantActions(p, event)` on `LobbyPage` — delegates to existing `onHandoffTap` / `onRemoveTap`.
- **D5 Tests:** Playwright e2e in `packages/e2e`. Desktop path uses the default `chromium` project (Desktop Chrome, 1280×720, `pointer: fine`); mobile swipe path uses `test.use({ ...devices['iPhone 13'] })` per-spec to flip `pointer: coarse` + touch. Both covered by Playwright — no manual-only path.
- **D6 Screenshots:** Required — desktop popover open + mobile swipe-revealed, light + dark, under `docs/screenshots/lobby-host-actions-portal/`, posted via PR comment with branch-file links. Squash/drop screenshot commit before merge.
- **D7 Gating predicate:** Reuse existing `isHost() && p.id !== myId()`.

## Phases

Single phase — one PR.

### Phase 1: Lobby host actions on portal (single PR)

Tasks:

1. **LobbyPage template** (`packages/client/src/app/lobby/lobby.page.ts`):
   - Add `<ion-button fill="clear" slot="end">` with `ellipsis-vertical` icon to each participant row, gated by `@if (surface.mode() === 'desktop' && isHost() && p.id !== myId())`.
   - Button carries `[attr.aria-label]="'Host actions for ' + p.displayName"`; inner `<ion-icon aria-hidden="true">`.
   - Wrap swipe-hint `<p>` in `@if (surface.mode() === 'mobile')`.
2. **LobbyPage component class** (`packages/client/src/app/lobby/lobby.page.ts`):
   - Inject `SurfaceService` if not already.
   - Add `openParticipantActions(p: ParticipantRow, event: Event)` building a `MenuItem[]` (imported from `../shared/menu-popover/menu-popover.component`) — Make host (primary, `star-outline`) and Remove (`role: 'destructive'`, `person-remove-outline`) — and calling `surface.openSheetOrPopover(...)` with the click event as the popover anchor.
   - `addIcons({ ellipsisVertical })`.
   - On `ngOnDestroy`, dismiss any open popover so session-end navigation (ADR-0023) doesn't leave a popover stranded.
3. **Playwright specs** (`packages/e2e`):
   - **Desktop** (`chromium` project, default Desktop Chrome viewport, `pointer: fine`): mirror the existing `participant-host-kick.spec.ts` two-context fixture — host creates room, second participant joins, host clicks overflow on the other row, popover opens, asserts the button's `aria-label`, clicks Remove, confirms alert, row disappears. Second case: host clicks overflow → Make host → confirms → host badge transfers.
   - **Mobile** (per-spec `test.use({ ...devices['iPhone 13'] })`, `pointer: coarse`, touch enabled): swipe a participant row left, assert Make Host / Remove revealed via the sliding drawer, confirm overflow button absent, swipe-hint visible.
   - Assert popover dismisses on backdrop tap and Escape.
   - Assert no double-fire (alert opened exactly once) on the popover→alert handoff to guard the focus-handoff race.
4. **Screenshots:**
   - Capture desktop popover open (light + dark) and mobile swipe-revealed (light + dark) under `docs/screenshots/lobby-host-actions-portal/`.
   - Commit on branch; post PR comment with `https://github.com/IIxauII/hnch/blob/lobby-host-actions-portal/docs/screenshots/lobby-host-actions-portal/<file>.png` links.
   - Squash or drop the screenshot commit before merge.

## Open questions

- **Tablet edge (C5):** an iPad with attached trackpad/keyboard reports `pointer: fine` and flips `SurfaceService.mode()` to `'desktop'`. The swipe gesture itself still works on a touch screen, but the swipe-hint is hidden and the overflow button replaces it. We accept this edge: success criteria are satisfied, and changing the pivot is out of scope. Reviewers should not raise this.

## Verification plan

Run from the worktree before pushing:

- `pnpm --filter @hnch/client typecheck`
- `pnpm --filter @hnch/client lint`
- `pnpm --filter @hnch/client build`
- `pnpm --filter @hnch/e2e test` — new Lobby host-actions popover specs (desktop `chromium` + mobile `iPhone 13` per-test device).
- Flake-check the new specs **20x** locally — the popover→alert focus handoff is timing-sensitive; assert no double-fire and that no underlying-row activation occurs in that window.
- Sanity: self-row and non-host rows show no overflow on desktop; swipe-hint absent on desktop, present on mobile; popover dismisses on backdrop tap, Escape, and route nav.

## Screenshots

Required. Capture under `docs/screenshots/lobby-host-actions-portal/`:

- `desktop-popover-light.png` — Lobby on desktop (1280 px), host view, accordion open, overflow popover open with Make host + Remove.
- `desktop-popover-dark.png` — same, dark theme.
- `mobile-swipe-light.png` — Lobby on mobile (390 px), host view, participant row swiped left exposing Make Host / Remove.
- `mobile-swipe-dark.png` — same, dark theme.

Delivery: commit on the PR branch, post a PR comment with markdown links to each file on the branch (per `CLAUDE.md` screenshot rule). Squash or drop the screenshot commit before merge.

## References

- Spec: [docs/specs/lobby-host-actions-portal.md](../specs/lobby-host-actions-portal.md)
- Issue: https://github.com/IIxauII/hnch/issues/240
- `packages/client/src/app/core/surface.service.ts` — `mode()` signal, `openSheetOrPopover()`
- `packages/client/src/app/shared/menu-popover/menu-popover.component.ts`
- `packages/client/src/app/lobby/lobby.page.ts` (+ template) — `onHandoffTap`, `onRemoveTap`, `isHost`, `myId`
- `packages/e2e/tests/participant-host-kick.spec.ts` — existing two-context fixture to mirror for the new specs
- `packages/e2e/playwright.config.ts` — default `chromium` project is Desktop Chrome (1280×720); use per-test `test.use({ ...devices['iPhone 13'] })` for mobile path
- `docs/ionic.md`, `docs/angular.md`
- Conventions: [CLAUDE.md](../../CLAUDE.md), [CONTRIBUTING.md](../../CONTRIBUTING.md)
