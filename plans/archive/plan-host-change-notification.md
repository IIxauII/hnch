# Plan: Host Change Notification

**Estimate:** 2

## Context

When host drops and election runs (ADR-0010, 5s debounce → lowest-peer-ID wins), neither platform tells participants what happened. New host doesn't know they're host, others don't know who controls reveal. Adding a transient notification on both platforms closes this gap.

## User Journey

1. Host disconnects (closes app, loses network)
2. 5s debounce passes, election runs
3. Winner writes `hostParticipantId` to doc
4. All connected clients detect `hostParticipantId` changed
5. **New host** sees: "You are now the host"
6. **Other participants** see: "{name} is now the host"
7. Notification auto-dismisses after ~3s
8. Former host reconnects later — no notification (no-reclaim per ADR-0010, host unchanged)

**Edge cases:**
- Creator joins alone → already host, no notification
- Host leaves during active vote → notification appears on voting screen too
- Multiple rapid elections (churn) → each triggers notification, latest wins visually
- Initial session join → skip first `hostParticipantId` value (not a "change")

## UX / UI

**Mobile:** Ionic toast at bottom, duration 2000ms. Same style as existing clipboard toast in lobby (`ToastController.create`). Shown on both lobby and estimating screens.

**CLI:** Transient `<Text>` line in App.tsx (e.g. below StatusBar or above screen content). Auto-clears after 3s via `setTimeout` + state. Yellow or dimColor to distinguish from regular content.

## Decisions

1. **Notification trigger:** Watch `hostParticipantId` changes on doc (not hooked into election logic). Works for both election and future manual handoff.
2. **Message format:** New host only — "You are now the host" / "{name} is now the host". No mention of previous host.

## Acceptance Criteria

- [ ] When host drops and election completes, all remaining clients see a notification with the new host's name
- [ ] New host sees "You are now the host" instead of their own name
- [ ] Notification auto-dismisses (~2-3s)
- [ ] No notification on initial session join (skip first hostParticipantId value)
- [ ] Works on both lobby and voting/estimating screens
- [ ] Mobile uses Ionic toast matching existing toast style
- [ ] CLI uses transient inline text that auto-clears
- [ ] `pnpm build` passes for all packages

## Tasks

- [ ] **T1: Add `onHostChange` callback to CLI SessionHandle**
  - File(s): `packages/cli/src/session.ts`
  - What: Observe `hostParticipantId` on settings Y.Map. Track previous value; fire callback when it changes (skip initial set on session join). Callback signature: `(newHostId: string) => void`. Wire into SessionHandle return object.
  - AC: Notification trigger works, no false fire on join

- [ ] **T2: CLI host change notification UI**
  - File(s): `packages/cli/src/ui/App.tsx`
  - What: Subscribe to `onHostChange` in App. On fire, resolve new host's displayName from projection participants. Set transient state string ("You are now the host" or "{name} is now the host"). Render as `<Text color="yellow">` below StatusBar. Auto-clear after 3s via setTimeout. Clear on new notification (latest wins).
  - AC: Notification shows on host change, auto-dismisses, correct message for self vs other

- [ ] **T3: Mobile host change notification**
  - File(s): `packages/client/src/app/lobby/lobby.page.ts`
  - What: Watch `docService.settings()` signal. Track previous `hostParticipantId` in a field. When it changes (and previous was set — skip initial), show toast: "You are now the host" if self, else "{displayName} is now the host". Use existing `toast()` helper method with ~2000ms duration. Must work on lobby screen; estimating screen navigates back to lobby on reveal so lobby coverage is sufficient.
  - AC: Toast shows on host change, correct message, no false fire on join

- [ ] **T4: Build + verify**
  - `pnpm build` passes for shared, cli, client
  - Manual test: simulate host drop → verify notification appears on remaining clients

## Key Files Reference

- `packages/cli/src/session.ts` — SessionHandle, doc observers, onChange pattern (line 325)
- `packages/cli/src/host-election.ts` — election logic, settings map observation pattern
- `packages/cli/src/ui/App.tsx` — root component, state management, screen routing
- `packages/cli/src/ui/components/StatusBar.tsx` — positioning reference
- `packages/client/src/app/lobby/lobby.page.ts` — lobby page, existing toast helper (line 657), ToastController usage
- `packages/client/src/app/core/doc/doc.service.ts` — `settings()` signal
- `packages/client/src/app/core/host-election.service.ts` — election logic on mobile side
