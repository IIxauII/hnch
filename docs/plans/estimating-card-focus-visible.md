# Estimating cards — keyboard focus-visible ring

Issue: #228.

## Goal

Add visible focus ring on Estimating screen `.card` for native keyboard focus (Tab / Shift-Tab) via `:focus-visible`. Today only the in-component `focusedIndex` signal (driven by Arrow/Home/End) toggles `.card.focused` → ring. Plain Tab focus has no visual affordance.

## Background

`packages/client/src/app/estimating/estimating.page.ts:274`:

```scss
.card.focused:not(.selected) {
  outline: 2px solid var(--ion-color-primary);
  outline-offset: 2px;
}
```

`.focused` class bound from `focusedIndex` signal (line 175, 417) which is only set by `estimating.keyboard.ts` arrow/Home/End handler. Tab focus never sets it → no ring.

Established `:focus-visible` pattern lives in `lobby.page.ts` (`.room-code:focus-visible`, `.subtitle:focus-visible`).

## Out of scope

- Keyboard shortcuts (#154).
- ARIA / screen-reader (#140).
- Selected-state border (#179).
- Abstain button (native `ion-button` focus).

## Files

- `packages/client/src/app/estimating/estimating.page.ts` — styles only. Sibling rule to `.card.focused:not(.selected)`.

## Design

Add:

```scss
.card:focus-visible {
  outline: 2px solid var(--ion-color-primary);
  outline-offset: 2px;
}
```

Combined focused+selected: primary border (2px, in box) + primary outline (2px, offset 2px). No layout shift — existing `.card { border: 2px solid transparent }` already reserves space.

`:focus-visible` browser-suppressed on pointer activation → no mobile/touch regression. `outline` has no transition declared → `prefers-reduced-motion` unaffected.

Decision: keep ring color `var(--ion-color-primary)` for both unselected+focused and selected+focused. Reviewer call on whether selected+focused needs `--ion-color-primary-shade` after screenshot review.

## Steps

1. **Worktree.** `git fetch origin && pnpm worktree:add estimating-focus-visible main`. Work inside `../hnch-estimating-focus-visible`.
2. **Edit styles** in `estimating.page.ts` — add `.card:focus-visible` rule after existing `.card.focused:not(.selected)` block.
3. **Run dev client.** `pnpm dev:client` from worktree. Note `CLIENT_PORT` from `.env.local`.
4. **Capture screenshots** via chrome-devtools MCP. Seed Fibonacci round in Estimating. For each: Tab focus on first unselected card, then click 5, then Tab focus the selected 5.
   - 1440×900 portal — light + dark
   - 390×844 mobile — verify tap shows NO ring (sanity)
5. **Show user screenshots.** Confirm ring visibility on both themes, both states. Iterate if selected+focused double-ring is too loud (fallback: `--ion-color-primary-shade` for outline).
6. **Post-approval:** lint, typecheck, client unit tests. No new tests required — visual rule only, behavior unchanged.
7. **Commit + PR.** Title: `fix(client): add :focus-visible ring on estimating cards for keyboard nav`. Closes #228.

## Acceptance

- Portal keyboard: Tab into grid → first card shows primary outline ring. Tab → moves. Enter → card selected, ring stays on focused selected card.
- Mobile tap: no ring (`:focus-visible` suppressed by pointer).
- Light + dark: ring visible against `--hnch-elev-1` for default accent.
- `prefers-reduced-motion: reduce`: instant ring, no regression.
- No regression for arrow-key driven `.focused` cursor (still works).

## Verification gate

Screenshots blocking before PR. User reviews focus ring on both themes + selected+focused combo state.
