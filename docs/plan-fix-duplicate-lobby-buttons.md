# Plan: Fix Duplicate Re-vote / Next Round Buttons in Lobby

## Context

Host sees two identical sets of Re-vote + Next Round buttons after a round is revealed:
1. **Inline** (lines 207–224) — inside `results-section`, after `<app-vote-results>`
2. **Footer** (lines 236–268) — in `<ion-footer>`, pinned to bottom

Both sets fire the same handlers (`onRevote()`, `openRoundStart()`), use same conditions (`isHost()` + `lastRevealedRound()`), near-identical CSS. The UX spec (`ux.md` §5.4, lines 423–460, 496) explicitly places these buttons in the **footer only**. The inline set is a leftover.

## Plan

**File:** `packages/client/src/app/lobby/lobby.page.ts`

### 1. Remove inline button block (lines 207–224)

Delete the `@if (isHost()) { <div class="revote-row"> ... }` block inside the `results-section`. Keep `<app-vote-results>` and `</section>` intact.

### 2. Remove `.revote-row` CSS rule (lines 369–374)

Dead style after step 1 — delete the entire `.revote-row { ... }` block.

### 3. Update component comment (line 81)

Change "The host gets Re-vote and Next Round controls inline." → "The host gets Re-vote and Next Round controls in the footer."

## Verification

1. `pnpm --filter client build` — confirm no build errors
2. Run dev server, open as host with a revealed round → only footer shows Re-vote / Next Round
3. Fresh session (no revealed round) → footer shows "Start Round 1"
4. Non-host view → no buttons at all
5. Run e2e: `pnpm --filter e2e test`
