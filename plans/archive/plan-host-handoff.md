# Plan: Manual Host Handoff

**Estimate:** 3

## Context

ADR-0010 explicitly considered and deferred manual handoff (Option C) as a v2 feature. The mechanism is trivial — write `hostParticipantId` to settings Y.Map — and host change notifications (just shipped) already handle the feedback loop. No new ADR needed since ADR-0010 already scoped this as an extension of the existing decision.

## User Journey

1. Host is on Lobby screen, wants to pass host role to another participant
2. **Mobile:** Host taps a participant in the list → confirmation alert "Make {name} the host?" → confirm → `hostParticipantId` written
3. **CLI:** Host presses `[h]` → numbered list of online participants → selects by number → confirmation prompt → `hostParticipantId` written
4. Existing host change notifications fire on all clients ("You are now the host" / "{name} is now the host")
5. Former host's UI updates — host-only actions (Start Round, Reveal) disappear, replaced with "Waiting for host..."
6. New host's UI updates — host-only actions appear

**Edge cases:**
- Only online participants shown as handoff targets (can't hand off to offline)
- Only current host sees handoff affordance
- Can't hand off to self (filtered out)
- Handoff during active vote → works fine, new host gets Reveal button
- Rapid handoff (A→B→C) → each write triggers notification, latest wins
- Solo host (no other online participants) → hotkey/tap disabled or no targets shown

## UX / UI

**Mobile:** Tapping a participant item in the lobby list triggers a confirmation alert ("Make {name} the host?"). Only the current host sees the tap affordance. Offline participants and self are not tappable for handoff. Uses standard `AlertController.create` with Cancel/Confirm buttons.

**CLI:** Host presses `[h]` in Lobby → numbered list of online participants (excluding self) rendered inline → host types number to select → "Hand off to {name}? [y/n]" confirmation → writes on `y`. Hotkey hint shown in host-only action bar: `[h] Hand off host`.

## Decisions

1. **Confirmation before handoff:** Yes on both platforms. Mobile uses alert dialog, CLI uses y/n prompt. Prevents accidental role changes.
2. **Screen scope:** Lobby only. Participant list lives there; mid-vote handoff is rare and adding it to Estimating is scope creep.

## Acceptance Criteria

- [ ] Host can hand off to any online participant from the Lobby screen
- [ ] Confirmation prompt shown before handoff on both platforms
- [ ] Only the current host sees the handoff affordance
- [ ] Offline participants and self are excluded from handoff targets
- [ ] After handoff, host change notifications fire for all clients (existing behavior)
- [ ] Former host loses host-only UI actions, new host gains them
- [ ] If no other online participants, handoff is unavailable (no targets)
- [ ] `pnpm build` passes for all packages

## Tasks

- [ ] **T1: Add `handoffHost(targetId)` to CLI SessionHandle**
  - File(s): `packages/cli/src/session.ts`
  - What: New method on SessionHandle. Guard: caller must be current host, target must exist in participants and be online (check awareness). Writes `patchSettings(doc, { hostParticipantId: targetId })`.
  - AC: Host can hand off, guards prevent invalid handoff

- [ ] **T2: CLI lobby hotkey and participant picker**
  - File(s): `packages/cli/src/ui/Lobby.tsx`
  - What: Add `[h]` hotkey (host-only). On press, render numbered list of online participants (excluding self). Accept number input to select. Show "Hand off to {name}? [y/n]" confirmation. On `y`, call `session.handoffHost(targetId)`. Show hotkey hint in host action bar. If no valid targets, show brief "No other online participants" message.
  - AC: Full handoff flow from keyboard, confirmation, edge cases handled

- [ ] **T3: Mobile lobby participant tap-to-handoff**
  - File(s): `packages/client/src/app/lobby/lobby.page.ts`
  - What: Add tap handler on participant `ion-item` in lobby list. Only active when current user is host, target is online, and target is not self. On tap, show `AlertController` confirmation: "Make {name} the host?" with Cancel/Confirm. On confirm, call `docService.updateSettings({ hostParticipantId: targetId })`. Add haptic feedback on confirm (`impactMedium`).
  - AC: Toast shows on host change, correct message, confirmation flow, haptic feedback

- [ ] **T4: Build + verify**
  - `pnpm build` passes for shared, cli, client
  - `pnpm --filter cli test` passes
  - Manual test: host hands off → verify notifications, UI updates, former host loses actions

## Key Files Reference

- `packages/cli/src/session.ts` — SessionHandle, `patchSettings`, `isHost()`, awareness access
- `packages/cli/src/ui/Lobby.tsx` — host-only hotkeys, action bar rendering
- `packages/cli/src/ui/App.tsx` — `isHost` derivation, props passed to Lobby
- `packages/client/src/app/lobby/lobby.page.ts` — participant list rendering, `isHost` computed, existing toast helper
- `packages/client/src/app/core/doc/doc.service.ts` — `updateSettings()`, `settings()` signal, `onlineParticipantIds()`
- `packages/client/src/app/core/haptic.service.ts` — haptic feedback methods
