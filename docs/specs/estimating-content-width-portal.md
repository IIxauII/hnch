# Estimating content width matches Lobby on portal

**Status:** Draft
**Date:** 2026-05-22
**Source:** https://github.com/IIxauII/hnch/issues/296

## Problem

On portal (≥768 px), the Lobby content column caps at 800 px and the Estimating content column caps at 640 px. Every round cycle navigates Lobby → Estimating → Lobby, so the centered content column shifts by 160 px in width (80 px per side) on every transition. At 1440 px viewport this is "clearly perceptible — the content visibly shrinks or expands against the page background" and "the repeated jump accumulates into a persistent distracting rhythm on portal." Mobile (≤430 px) is unaffected — both pages are full-width there.

## Users

Hosts, voters, and viewers using hnch on a desktop or laptop browser (portal layout, viewport ≥768 px). Mobile users are not affected.

## Current behavior

Visual baseline on `main`:

- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/lobby/desktop-host.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/estimating/desktop-pre-vote.png?raw=true

Lobby content column: 800 px max-width. Estimating content column: 640 px max-width. Each Lobby ↔ Estimating navigation shifts the centered column inward or outward by 80 px per side.

## Proposed behavior

> "As a participant or host on a desktop or laptop browser, I want the content area to stay the same width when navigating between the Lobby and Estimating screens, so the page layout feels stable and the round cycle doesn't distract me with a repeated visual jump."

Estimating's content column caps at the same width as Lobby on portal, so navigating between the two screens produces no visible shift in content column position or width. The Estimating card grid adapts to the wider column naturally (approximately 6 columns instead of 5 with the Fibonacci scale). Mobile remains full-width and unchanged.

## Success criteria

- At ≥1280 px (portal), switching between Lobby and Estimating produces no visible shift in the content column position or width.
- At ≥1280 px (portal), the Estimating card grid with the Fibonacci scale (10 cards) renders without horizontal overflow.
- At ≥1280 px (portal), T-shirt scale (≤6 cards) and Powers-of-2 scale (7 cards) render without horizontal overflow.
- The full-width "Abstain this round" button still spans the column width — no regression.
- No visible change at ≤430 px (mobile) on either Lobby or Estimating.
- No regression in the Estimating header toolbar, avatar vote row, elapsed timer, observer notice, or host footer CTA button.
- Light and dark themes: no visual change other than the widened column.

## Scope

**In:**
- Align Estimating's portal content column max-width with Lobby's so both screens use the same constraint.
- Both light and dark themes (layout-only change).
- Tablet (768–1279 px) and portal (≥1280 px) breakpoints.

**Out (explicit anti-goals):**
- Changing Lobby's max-width (800 px stays).
- Changing the Estimating card grid's `minmax`, gap, or card min-height.
- Addressing card-grid orphan rows (tracked in #180; orphan pattern shifts from 5+5 → 6+4 Fibonacci but neither is ideal, and #180 owns the fix — designed to work at the new width).
- Footer CTA full-viewport alignment on portal (tracked in #272; that fix should target the new shared max-width for the Estimating footer).
- Mobile layout or behavior.
- Relay, shared package, CLI, or e2e protocol changes.

## Open questions

None — issue specifies the change precisely.

## ADR impact

None. Pure client-side layout change; no schema, sync protocol, identity, host election, or relay-surface implications.

## References

- Issue: https://github.com/IIxauII/hnch/issues/296
- Related: #180 (card grid orphan rows), #272 (footer CTA full-width on portal)
- Files in scope: `packages/client/src/app/estimating/estimating.page.ts` (styles), `packages/client/src/theme/_page-container.scss` (mixin — read-only reference)

## Screenshot scope (suggested)

`lobby`, `estimating` — portal/desktop viewports. Informational for `/plan`.
