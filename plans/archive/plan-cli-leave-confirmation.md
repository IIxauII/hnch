# Plan: CLI Leave Confirmation

**Estimate:** 3

## Context

CLI exits instantly on `Q`/`q` or Ctrl+C with no warning. Mobile shows a "Leave session?" destructive alert before tearing down the session. Adding a confirmation step to the CLI prevents accidental session drops mid-vote, bringing it to parity with mobile.

## User Journey

1. User is on lobby or voting screen
2. Presses `Q` (or `q`)
3. Inline confirm prompt appears at bottom of screen: `Leave session? y/n`
4. **y** → disconnect + exit
5. **n** or **Esc** → dismiss prompt, return to normal input
6. **Ctrl+C** — force-exits immediately (no confirmation, standard CLI behavior)
7. All other input suppressed while confirm prompt is visible

## UX / UI

**Confirm prompt (inline, bottom of screen):**
- Rendered as `<Text>` below current screen content
- Style: `Leave session? y/n` in dimColor, matching existing hint patterns (`↑↓ select  ⏎ confirm  esc close`)
- Appears in both lobby and voting screens (state lives in App.tsx, above both)
- While visible: Q, card keys, settings keys, all other hotkeys suppressed

## Decisions

1. **Ctrl+C behavior:** Ctrl+C always force-exits immediately, no confirmation. Only Q/q triggers the confirm prompt. Keeps standard CLI escape hatch simple.
2. **Confirm UI style:** Inline text at bottom of current screen, not a full-screen overlay. Matches existing `confirming-delete` pattern in ScalePicker.

## Acceptance Criteria

- [ ] Pressing Q/q in lobby or voting shows confirm prompt instead of exiting
- [ ] Pressing y while prompt visible disconnects session and exits
- [ ] Pressing n or Esc while prompt visible dismisses prompt, returns to normal
- [ ] All other hotkeys suppressed while confirm prompt visible
- [ ] Ctrl+C force-exits immediately without confirmation
- [ ] Confirm prompt renders inline at bottom in dimColor style
- [ ] `pnpm build` passes with no errors

## Tasks

- [ ] **T1: Add confirm-quit state to App.tsx**
  - File(s): `packages/cli/src/ui/App.tsx`
  - What: Add `confirmingQuit` boolean state. Change Q handler to set `confirmingQuit = true` instead of immediate exit. Add second `useInput` (active only when `confirmingQuit`) that handles y → disconnect+exit, n/esc → dismiss. Pass `confirmingQuit` down to suppress child `useInput` handlers via `isActive` props.
  - AC: Q/q shows prompt, y exits, n/esc dismisses, other keys suppressed

- [ ] **T2: Render confirm prompt**
  - File(s): `packages/cli/src/ui/App.tsx`
  - What: Conditional `<Text dimColor>` at bottom of the `<Box>`: `Leave session? y/n`. Only rendered when `confirmingQuit` is true.
  - AC: Prompt renders inline at bottom in dimColor

- [ ] **T3: Build + verify**
  - `pnpm build` passes
  - Manual test: Q confirm, Ctrl+C confirm, double-Ctrl+C force exit, n/esc dismiss, keys suppressed during confirm

## Key Files Reference

- `packages/cli/src/ui/App.tsx` — main app component, global quit handler (line 67–76)
- `packages/cli/src/ui/Lobby.tsx` — lobby screen with `useInput` (line 118)
- `packages/cli/src/ui/Voting.tsx` — voting screen with `useInput` (line 37)
- `packages/cli/src/ui/components/ScalePicker.tsx` — existing `confirming-delete` pattern to follow (line 94–107, 148–155)
- `packages/client/src/app/lobby/lobby.page.ts` — mobile's `confirmLeave()` reference (line 629–646)
