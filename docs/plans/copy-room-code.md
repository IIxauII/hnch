# Plan: Tap room code in Lobby to copy (issue #116)

## Context

The 6-char room code in the Lobby header (`<h1 class="room-code">` at `packages/client/src/app/lobby/lobby.page.ts:177`) is currently a static `<h1>`. Hosts share it verbally or via the "Share invite" OS sheet — there is no one-tap "copy bare code". This adds a tap-to-copy on the heading with an inline `copy-outline` icon affordance, toast confirmation, and clipboard fallback message on failure. No relay, schema, or ADR change.

Single package touched (`packages/client`) → single scope `feat(client): ...`. e2e spec lives in `packages/e2e` (non-releasing).

## Files

**Modify**
- `packages/client/src/app/lobby/lobby.page.ts`
  - Template `:177`: replace `<h1 class="room-code">…</h1>` with a `<button class="room-code">` containing the code + `copy-outline` icon. `(click)="onCopyRoomCode()"`, `aria-label="Copy room code"`. Min-height 44px.
  - New protected `onCopyRoomCode()` next to `copyToClipboard` (`:973`): writes `formattedRoomCode()` via `navigator.clipboard.writeText`; success → `toastService.info(buildCopyRoomCodeToast(true, code))`; failure → `toastService.info(buildCopyRoomCodeToast(false, code))` (info not error — user can still read the inline code).
  - Add `copyOutline` to the `addIcons({...})` block.
  - Styles: strip button chrome on `.room-code` (appearance none, transparent bg, border none, font inherit, color inherit), `display: inline-flex; align-items: center; gap: 0.4rem; min-height: 44px; cursor: pointer;` + `:focus-visible` outline mirroring `.subtitle:focus-visible` (`:487`). Icon `font-size: 1.25rem; color: var(--ion-color-medium);`.
- `packages/client/src/app/lobby/lobby-helpers.ts`
  - Pure helper `buildCopyRoomCodeToast(success: boolean, code: string): string` — `'Room code copied'` or `` `Couldn't copy — code is ${code}` ``. Same extraction rationale as `isParticipantViewer`.

**Tests**
- `packages/client/src/app/lobby/lobby.page.test.ts` — `describe('buildCopyRoomCodeToast', …)` covering success, failure, code-string preservation.
- `packages/e2e/tests/copy-room-code.spec.ts` *(new)* — grant `clipboard-read`/`clipboard-write`, tap room-code button, assert toast `'Room code copied'` + `navigator.clipboard.readText()` matches displayed `XXX-XXX`, smoke-assert "Share invite" item still renders. Use fixtures + setup pattern from `qr-display.spec.ts`.

## Reuse

- `formatRoomCode` from `@hnch/shared` (`packages/shared/src/room-code.ts:83`) — already wired via `formattedRoomCode()` signal (`:637`).
- `ToastService.info()` (`packages/client/src/app/services/toast.service.ts:8`) — same 2000ms top toast used by `copyResults` / `copyToClipboard`.
- Ionicon `copy-outline` (ships with `ionicons`).
- `@capacitor/clipboard` is in deps but existing `copyToClipboard` (`:973`) uses raw `navigator.clipboard.writeText` — match that for consistency.

## Out of scope

- Haptic on copy (ux.md §6 haptic map omits it; existing `copyToClipboard` is silent).
- Estimating-screen copy (code not shown there).
- Long-press menu.
- Copy without dash.

## Commits

Branch: `copy-room-code` (single worktree).

1. `refactor(client): extract buildCopyRoomCodeToast helper` — helper + unit tests + this plan file. Pure addition, no caller yet.
2. `feat(client): tap room code in Lobby to copy to clipboard` — template button, `onCopyRoomCode()`, icon registration, styles. Wires to the helper.
3. `test(e2e): cover copy-room-code tap` — new Playwright spec.

PR: `feat(client): tap room code in Lobby to copy to clipboard`.

## Verification

- `pnpm --filter @hnch/client test` — helper unit tests pass.
- `pnpm --filter @hnch/client typecheck && pnpm --filter @hnch/client lint`.
- `pnpm dev:relay` + `pnpm dev:client`, create room, tap code → toast + paste works. "Share invite" unchanged.
- `pnpm --filter @hnch/e2e test -- copy-room-code` green.
- Manual: dark mode toggle — affordance visible; tap target ≥44px (DevTools iPhone SE).
