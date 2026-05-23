# Consensus overlay scope to VoteResultsComponent

**Status:** Draft
**Date:** 2026-05-19
**Source spec:** docs/specs/consensus-overlay-scope-to-component.md
**Shape:** Single PR

## Summary

Replace full-viewport `position: fixed` consensus overlay in `VoteResultsComponent` with a host-scoped `position: absolute` overlay so the Ionic toolbar (back button) and surrounding content stay interactive during the ~3 s celebration. Pure CSS change; behavior, animation, haptics, and a11y untouched.

## Approach

Two CSS edits inside the `styles` array of `packages/client/src/app/shared/vote-results.component.ts`:

1. `:host` (line 163): add `position: relative` so the host becomes the containing block for absolutely-positioned descendants.
2. `.consensus-overlay` (line 311): change `position: fixed` → `position: absolute`. `inset: 0`, `z-index: 1000`, background scrim, and click-to-dismiss handler unchanged.

`.consensus-text` keeps its existing `position: absolute; top: 50% / left: 50% / translate(-50%,-50%)` centering — it now centers within the host box instead of the viewport, which is the desired visual.

## ADR impact

- None. Pure client CSS scoping. No sync-protocol, schema, identity, access-control, or relay surface touched.

## Decisions resolved

None to surface — spec specifies exact CSS values and behavior; no design alternatives in scope (toast-style alternative explicitly rejected in issue body).

## Phases

### Phase 1 — Scope overlay to component

- **Scope:** `packages/client/src/app/shared/vote-results.component.ts` (CSS block only, ~lines 163–165 and 310–320)
- **Exit bar:** Consensus overlay visually bounded to vote-results section on mobile (390 px) and portal (1280 px); toolbar back button tappable during the celebration in both light + dark themes; non-consensus rounds unaffected; auto-dismiss + click-to-dismiss work.
- **PR title scope:** `fix(client): scope consensus overlay to vote-results component` (or `fix(client)` Conventional Commit — fixes interaction-blocking UX bug)
- **Worktree:** `pnpm worktree:add consensus-overlay main` at execution time (run `git fetch origin` first)
- **Depends on:** none

## Open questions

None.

## Verification plan

- `pnpm --filter @hnch/client typecheck` — confirm no TS regression (unlikely; CSS-only change)
- `pnpm --filter @hnch/client lint`
- `pnpm --filter @hnch/client build`
- Manual UI smoke in dev (`pnpm dev:client` + `pnpm dev:relay`):
  - Trigger consensus round (2+ voters, identical vote) → confirm overlay confined to results section; toolbar visible and tappable during overlay; back-tap during overlay dismisses + navigates.
  - Repeat at mobile (≤430 px viewport) and portal (≥1280 px) widths.
  - Light + dark theme.
  - `prefers-reduced-motion: reduce` (DevTools rendering tab) → badge appears instantly.
  - Non-consensus round → no overlay (regression check).
- No e2e change planned; existing reveal specs should still pass.

## Screenshots

**Required:** Yes — visible UX behavior shift; reviewer needs to see the bounded scrim vs toolbar accessibility.

- Screens: Lobby post-reveal consensus state (overlay active) + immediately after dismiss
- Variants: mobile (390 px) + portal (1280 px), light + dark = 4–8 PNGs
- Path: `docs/screenshots/consensus-overlay/`
- Delivery: PR comment with branch-file links `https://github.com/IIxauII/hnch/blob/<branch>/docs/screenshots/consensus-overlay/<file>.png` (no raw URLs, no pasted attachments, no markdown image tables — all three fail on mobile GH)
- Merge handling: squash screenshot commit before merge (images not needed in main history)

## References

- Spec: `docs/specs/consensus-overlay-scope-to-component.md`
- Issue: https://github.com/IIxauII/hnch/issues/257
- Component: `packages/client/src/app/shared/vote-results.component.ts:163` (`:host`), `:311` (`.consensus-overlay`)
- ADR-0028 — no telemetry; verification via observable behavior only
