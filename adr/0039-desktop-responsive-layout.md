# ADR-0039: Desktop-responsive layout

**Status:** Accepted
**Date:** 2026-05-08

## Context

- Client renders mobile-only layout at all viewport widths; no max-width containers, full-bleed columns, sticky-bottom CTAs.
- Desktop screenshots at 1440×900 reveal concrete UX failures: Join code-input overflows (4 of 6 boxes visible), Start Round modal buttons hidden behind Lobby CTA bar, Session-name label duplicates placeholder, room-code formatting inconsistent (dashed in QR caption, undashed in header), Settings rows span 1440px with disconnected label↔value, Estimating cards ≈470×90px with empty bottoms.
- Fitts's-law violation: gear icon (top-right header) opens ActionSheet anchored to bottom edge.
- Web PWA and CLI are production surfaces; desktop experience must match mobile quality bar.
- Phase 6a polish; no CRDT/relay/protocol change.

## Decision

Adopt breakpoint-conditional surface modes reusing existing components with differential configuration:

**Breakpoints:** `md` (768px) pivot + `(pointer: fine)` media query. Touch laptops keep mobile UX; desktop = 768px+ with fine pointer.

**Modals:** mobile = half-sheet via `breakpoints: [0, 0.6, 0.95]`; desktop = centered dialog with `.modal-centered` global CSS class (sizes via `::part(content)` CSS vars, no handle, capped width ≤480px, max-height 80vh). Applied via `SurfaceService.openModal()` helper.

**Menus:** mobile = `ActionSheetController` overlay; desktop = `PopoverController` anchored to trigger. Shared `<app-menu-popover>` component replaces action-sheet buttons array. Routed through `SurfaceService.openSheetOrPopover()` helper.

**CTA bars:** mobile = `ion-footer` sticky; desktop = pure-CSS `position: static` swap (no JS, no portal). Footer element reflows into document as inline CTA row.

**Page layout:** capped max-widths via `<ion-grid fixed>` + per-page SCSS mixin (no wrapper component). Target widths: Onboarding 480px, Home 560px, Join 480px, Lobby 800px, Estimating 640px, Settings 720px.

**Token files:** `_breakpoints.scss` (SCSS map) + `breakpoints.ts` (TS mirror) for central media-query references.

**Accessibility:** hover styles in `@media (hover: hover)`; `:focus-visible` rings on all interactive; modal focus trap verified (polyfill if gh-issue #29728 blocks).

## Trade-offs

- `SurfaceService` + `MenuPopoverComponent` + breakpoints files add ~150 LOC new surface layer. All action-sheet call sites refactored through helper.
- `ion-split-pane` deferred. Current Lobby content density (room code + share+QR rows + 1–8 participants + 1 round shown) doesn't justify side rail yet; would appear sparse vs capped-width centered. Split-pane adoption will be a separate ADR when round-history list grows beyond ~3 entries inline.
- Hover and fine-pointer media queries filter out touch-capable devices; no hover-reveal desktop features can be previewed at touch viewport scales unless user also has `(pointer: fine)` device available.
- Native iOS/Android layout (Phase 6b) untouched; native clients remain pure mobile.

## Consequences

- **Easier:** single codebase adapts to desktop and mobile from day 1; no fork maintenance. Existing component tests pass unchanged; surface mode is a *configuration* delta, not behavior change.
- **Easier:** capped page widths + centered layout reduce visual sprawl and improve readability at ultra-wide displays.
- **Harder:** all pages must opt into capped container via SCSS mixin; no implicit inheritance (but single mixin per page is low cost).
- **Harder:** testing must cover both mobile and desktop viewports. E2E suite expands to include 1440×900 desktop viewport scenarios.
- **Revisit when:** round-history grows to 3+ entries inline (likely Phase 6c); triggers split-pane ADR for Lobby side rail.
- **Revisit when:** future PWA install banner or window-controls overlay changes safe-area insets; affects page padding strategy.

## Conformance

- Compatible with ADR-0002 (Angular + Ionic + Capacitor stack).
- Compatible with ADR-0036 (participant kick semantics unchanged; only UI affordance changes on desktop). Soft-delete `leftAt` / `removedBy` fields untouched.
- Compatible with ADR-0028 (no telemetry; surface mode not tracked).
- Compatible with ADR-0029 (deployment unchanged; PWA + relay served from single origin).
- New files live in `adr/`, `packages/client/src/`, `packages/shared/src/`; no code removals.
