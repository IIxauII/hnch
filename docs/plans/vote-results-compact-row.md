# Vote results — compact single-column rows

Issue: #197 (alternative approach — not the grid proposed in the ticket).

## Goal

Revealed-round `VoteResultsComponent` should fit full overview on one screen without scroll. Keep single column. Make each vote group a compact horizontal row: card value + count on left, voter chips inline on right. Works mobile + portal.

## Out of scope

- Vote-distribution bars (#123).
- Stats row, elapsed paragraph, consensus overlay — unchanged.
- RoundHistoryComponent, Estimating screen.

## Files

- `packages/client/src/app/shared/vote-results.component.ts` — styles + minor template class tweak. Only file.

## Design

Per group row:

```
[ 5  (3 votes) ]   [Alice] [Bob] [Charlie]
```

- `.group` → `display: flex; align-items: baseline; gap: 0.75rem; padding: 0.4rem 0`.
- `.group-header` → `flex: 0 0 auto; min-width: 5.5rem; display: flex; gap: 0.4rem; align-items: baseline`. Card font shrunk `1.5rem → 1.15rem`. `.count` font `0.85rem`.
- `.chips` → `flex: 1 1 auto; flex-wrap: wrap`. Chips compacted: `--ion-chip-min-height: 1.5rem`, smaller padding via existing IonChip sizing (no override if Ionic default already tight enough — verify in screenshot pass).
- Drop `margin-top: 1rem` on `.group`. Replace `border-top` with `border-bottom: 1px solid var(--ion-color-step-150)` on `.group:not(:last-of-type)` for thin divider.
- `.group.didnt-vote` — same row layout, muted color preserved.
- Stagger animation `fadeInUp` + `--i` preserved.
- `prefers-reduced-motion` path preserved.

No template change needed beyond optional shrinking of chip size attr (`<ion-chip color="primary">` may get `outline` or no change — decide after first screenshot).

## Steps

1. **Worktree.** `git fetch origin && pnpm worktree:add vote-results-compact main`. Work inside `../hnch-vote-results-compact`.
2. **Edit styles** in `vote-results.component.ts` per Design above.
3. **Run dev client.** `pnpm dev:client` from worktree. Note worktree's `CLIENT_PORT` from `.env.local`.
4. **Capture screenshots** of revealed Lobby at three viewports via chrome-devtools MCP:
   - 390×844 (mobile)
   - 768×1024 (tablet)
   - 1440×900 (portal)
   Seed a session with Fibonacci scale, 4 distinct vote values + 1 didn't-vote, then reveal. Light mode + dark mode for portal viewport.
5. **Show user the screenshots.** User verifies layout matches intent. Iterate styles if needed.
6. **Post-approval:** lint, typecheck, unit tests for client. Fix any snapshot/test fallout.
7. **Commit + PR.** Title: `fix(client): compact vote-results rows for full at-a-glance overview`. Closes #197.

## Acceptance

- Mobile (≤430px): each group one row, card+count + chips visible without horizontal scroll. Long voter lists wrap chips below card label, still within same flex row.
- Tablet/Portal: identical row layout — single column intentional. Vertical density high enough that 6-group Fibonacci round fits viewport without scrolling on 1440×900.
- Didn't-vote row: muted, sits at end.
- Animation + reduced-motion paths intact.
- No regression: stats row, elapsed line, consensus overlay, Lobby header/footer.

## Verification gate

Implementation is NOT complete until user reviews screenshots and approves. Screenshots blocking before PR.
