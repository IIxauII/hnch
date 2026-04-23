# Plan: Lobby-Centric Results — Mobile + CLI

## Completed

Both Plan A (Mobile) and Plan B (CLI) have been fully executed:

- **Plan A (Mobile):** VoteResultsComponent and RoundHistoryComponent created; Lobby page updated with inline results and round history; Estimating navigates to `/lobby` after reveal; Revealed page and route deleted; e2e tests updated to expect `/lobby`; documentation updated.
- **Plan B (CLI):** Timer system removed; unanimous auto-reveal added; Revealed screen merged into Lobby; elapsed time added to Voting screen.

---

Two parallel tracks. Both eliminate the separate "Revealed" screen and make Lobby the persistent session hub with cumulative round history.

Also: CLI needs timer cleanup (mobile already done in prior commit).

---

## PLAN A: Mobile (Ionic/Angular)

### Context

Currently: Lobby → Estimating → Revealed → Estimating → ...
Target: Lobby → Estimating → Lobby (with results + history) → Estimating → ...

Revealed page eliminated. Layout order: **Participants → Latest Results → History**.
Results use full card-group + chip layout (same as current Revealed).

### Lobby layout (after rounds exist)

```
┌─────────────────────────────────────────┐
│ ←                                  ⋯    │
│                                         │
│   K7P-9MR                               │
│   Round 3 • Fibonacci                   │
│                                         │
│   [📤 Share invite]  [▤▤▤ Show QR]     │
│                                         │
│   Participants (6)                      │
│   ● Alice ★   ● Bob   ● Charlie        │
│   ● Dave      ● Eve   ○ Frank          │
│                                         │
│   ── Round 2 Results ──────────         │
│   5  (3 votes)                          │
│   [Alice] [Bob] [You]                   │
│   8  (2 votes)                          │
│   [Charlie] [Dave]                      │
│   Didn't vote (1)                       │
│   [Eve]                                 │
│   ⏱ 0:42                               │
│   [Re-vote]  [Next Round]               │
│                                         │
│   ── History ──────────────────         │
│   Round 1: Auth migration               │
│     5×3, 8×1, 13×1 — 0:38              │
│                                         │
├─────────────────────────────────────────┤
│ ┌───────────────────────────────────┐   │
│ │         Start Round 3             │   │
│ └───────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Changes

#### A1. Create VoteResultsComponent

**New file:** `packages/client/src/app/shared/vote-results.component.ts`

Standalone component extracted from Revealed page logic:
- Inputs: `round: Round`, `participants: ParticipantSnapshot[]`, `myId: string | null`
- Renders: grouped cards (sorted by count desc, tie-break by scale index), voter chips, didn't-vote section, elapsed time
- Includes stagger reveal animation from Revealed
- Includes `computeStats()` — average, median, agreement percentage (port from CLI's Revealed.tsx — mobile didn't have this yet)

#### A2. Create RoundHistoryComponent

**New file:** `packages/client/src/app/shared/round-history.component.ts`

Standalone component:
- Input: `rounds: Round[]`, `participants: ParticipantSnapshot[]`
- Renders compact summary per revealed round (reverse chronological)
- Format: "Round N: [title] — [card]×[count], ... — M:SS"
- Skips the latest revealed round (shown in full by VoteResultsComponent)

#### A3. Update Lobby page

**File:** `packages/client/src/app/lobby/lobby.page.ts`

Template additions (after participants, before footer):
- `<app-vote-results>` — shown when `lastRevealedRound()` exists
- Re-vote + Next Round buttons — below results (host only)
- `<app-round-history>` — shown when `revealedRounds().length > 1`

New computed signals:
- `lastRevealedRound` — last round with `revealedAt` set
- `pastRevealedRounds` — all revealed rounds except the latest (for history)

Footer logic:
- No rounds yet → "Start Round 1"
- Latest round revealed → "Re-vote" + "Next Round N" (two buttons, same 2-col grid as current Revealed footer)
- Latest round active/unrevealed → (user is on Estimating, not here)

Navigation: existing auto-navigate effect already works — unrevealed round appears → Estimating. Round revealed → user returns to Lobby with results inline.

New imports: `VoteResultsComponent`, `RoundHistoryComponent`

Move Re-vote logic from Revealed into Lobby:
```typescript
onRevote() {
  const round = this.lastRevealedRound()
  this.docService.startRound({
    parentRoundId: round.id,
    title: round.title,
    description: round.description,
    ticketId: round.ticketId,
  })
}
```

#### A4. Update Estimating page — navigate to Lobby after reveal

**File:** `packages/client/src/app/estimating/estimating.page.ts`

Change auto-navigate target from `/revealed` to `/lobby`.
Change `onReveal()` manual handler to navigate to `/lobby`.

#### A5. Delete Revealed page

- Delete `packages/client/src/app/revealed/revealed.page.ts`
- Remove route from `packages/client/src/app/app.routes.ts`

#### A6. Update e2e tests

- `manual-reveal.spec.ts` — expect `/lobby` not `/revealed`; verify results visible on lobby
- `unanimous-reveal.spec.ts` — same
- Update `helpers.ts` — remove `REVEALED` selectors, add result-section selectors

#### A7. Update docs

- `ux.md` — remove §5.6 Revealed screen, add results-in-lobby section, update wireframes and flow
- `CLAUDE.md` — note Revealed page removed

---

## PLAN B: CLI (React/Ink)

### Context

CLI has same 3-screen flow plus timer code that still references removed `revealMode`/`timerDurationMs` types. Two sub-tasks: timer cleanup + lobby-centric results.

### Changes

#### B1. Remove timer system

**Delete:** `packages/cli/src/timer.ts`
**Delete:** `packages/cli/src/ui/components/Timer.tsx`

**Update `packages/cli/src/session.ts`:**
- Remove `startRoundTimer` import (gone from shared)
- Remove `revealMode`/`timerDurationMs` from `CreateSessionOptions`
- Remove `startTimerWatcher` setup
- Remove `startTimer()`, `onTimerTick()` from `SessionHandle`
- Remove timer conditional in `newRound()` and `revote()` (shared `appendRound` handles `timerStartedAt` now)
- Remove `timerCallbacks`, `timer.stop()`

**Update `packages/cli/src/index.ts`:**
- Remove `--reveal` and `--timer-duration` CLI options
- Remove `revealMode`/`timerDurationMs` from `handleCreate()`

**Update `packages/cli/src/session.test.ts`:**
- Remove `revealMode` from fixtures

**Update `packages/cli/src/ui/App.tsx`:**
- Remove `timerRemaining`, `timerRoundId` state
- Remove `onTimerTick` subscription
- Remove `timerMs` prop passing

**Update `packages/cli/src/ui/Voting.tsx`:**
- Remove `timerRemainingMs` prop + `Timer` import
- Add elapsed time display: `Date.now() - round.timerStartedAt` (use setInterval in App, pass as prop)

#### B2. Add unanimous auto-reveal

**Update `packages/cli/src/session.ts`:**
- In `wireSession()`, add a 250ms `setInterval` that checks: all online participants have voted → write `revealedAt`
- Same logic as mobile's estimating page effect, imperative style
- Clean up interval in `disconnect()`

#### B3. Merge Revealed into Lobby

**Update `packages/cli/src/ui/App.tsx`:**
- Change `Screen` type: `'lobby' | 'voting'` (remove `'revealed'`)
- `deriveScreen()`: revealed round → `'lobby'`
- Remove `<Revealed>` rendering
- Pass round history + latest revealed round to Lobby
- Move `handleRevote` and `handleNewRound` callbacks to Lobby

**Update `packages/cli/src/ui/Lobby.tsx`:**
- When latest round is revealed, show:
  - Results table (name + estimate columns, from Revealed.tsx)
  - Stats line (Avg / Med / Agreement — move `computeStats` here)
  - Elapsed time
  - [v] Re-vote, [n] Next Round hotkeys
- Round history: compact one-liner per past round
- Keep participant list and [s] Start Round

**Delete:** `packages/cli/src/ui/Revealed.tsx`

#### B4. Add elapsed time to Voting

**Update `packages/cli/src/ui/App.tsx`:**
- Add `elapsed` state, tick via setInterval (reuse the awareness poll interval at 1s)
- Pass `elapsedMs` to Voting

**Update `packages/cli/src/ui/Voting.tsx`:**
- Show elapsed time as `⏱ M:SS` (counting up)

---

## Verification

### Mobile
1. `pnpm --filter shared build && pnpm --filter client build` — clean
2. `pnpm --filter shared test` — pass
3. `pnpm --filter e2e test` — all e2e pass with `/lobby` navigation
4. Browser: create → start round → vote → Lobby shows results + elapsed → next round → history accumulates

### CLI
1. `pnpm --filter cli build` — clean
2. `pnpm --filter cli test` — pass
3. `hnch create --help` — no `--reveal` or `--timer-duration`
4. Manual: create → start → vote → Lobby shows results → history accumulates
