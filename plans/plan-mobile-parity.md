# Plan: Mobile Parity — 4 Missing Features

**Estimate:** 8 SP

## Context

Mobile (packages/client) lacks 4 features the CLI has: room name editing in session settings, default session name preference, default password preference, and relay URL override. Two items listed in the divergence doc (preset overrides UI, custom scale persistence) are already implemented — doc is stale. Manual host handoff was also shipped (commit 1418ef6). This plan closes the remaining gaps and updates the divergence doc.

## User Journey

### Room name edit (in-session)
1. Host opens Session Settings sheet in Lobby
2. New "Room name" row visible above Scale row
3. Tap → inline text input expands (ion-input, no sub-sheet)
4. Type name, blur/enter → `docService.updateSettings({ name })` fires immediately
5. Non-host: row visible but disabled (host-only per schema.md)
6. Empty input → clears name (`undefined`)

### Default session name (app preference)
1. User opens Settings page
2. New "Session Defaults" section between Scales and About
3. "Default session name" row shows current value or "None"
4. Tap → half-sheet text editor (reuse display-name-editor pattern)
5. Save → stored in Capacitor Preferences via AppPreferenceService
6. Next `onCreateRoom()` → name auto-applied to new session's `settings.name`

### Default password (app preference)
1. User opens Settings page
2. "Password by default" toggle in "Session Defaults" section
3. Toggle on → stored in Preferences
4. Next `onCreateRoom()`:
   - Room minted on relay as usual
   - Password entry sheet presented before navigating to lobby
   - User enters password → hash via `hashPassword()` → `patchRoomAccess()`
   - Cancel → room created without password (open mode), navigate to lobby anyway
5. Toggle off → normal create flow (no prompt)

### Relay URL override (app preference)
1. User opens Settings page
2. New "Advanced" section after Session Defaults
3. "Relay URL" row shows current URL or "Default"
4. Tap → half-sheet text editor pre-filled with current URL
5. Save → stored in Preferences; WS URL auto-derived (http→ws, https→wss)
6. Clear → reverts to environment default
7. All relay-api calls read from AppPreferenceService instead of hardcoded environment

## UX / UI

### Session Settings sheet (in-session, Lobby)
- Add "Room name" row at top of ion-list (before Scale)
- Row: ion-item with ion-input (text, placeholder "Session name", clearInput)
- Host-only: `[disabled]="!isHost()"` on the ion-item
- Value bound to `docService.settings()?.name`
- On ionInput/ionBlur → `docService.updateSettings({ name: trimmed || undefined })`

### Settings page (app-level)
Current sections: Profile, Appearance, Scales, About

Add two new sections:

**Session Defaults** (between Scales and About):
- "Default session name" — ion-item button, ion-note slot=end showing current value or "None", opens half-sheet editor
- "Password by default" — ion-item with ion-toggle slot=end, bound to `appPrefs.defaultPassword()`

**Advanced** (between Session Defaults and About):
- "Relay URL" — ion-item button, ion-note slot=end showing current URL or "Default", opens half-sheet editor

## Decisions

1. **D1: Room name edit UI** → Inline text field in session-settings sheet (no sub-sheet). Simple, one tap.
2. **D2: App preferences architecture** → New `AppPreferenceService` for all non-scale device prefs, parallel to `ScalePreferenceService`.
3. **D3: Relay URL input** → Single HTTP URL input; WS URL auto-derived (`http://` → `ws://`, `https://` → `wss://`).
4. **D4: Password prompt on create** → Password entry sheet opens after room mint, before nav to lobby. Cancel skips password (open mode).

## Acceptance Criteria

- [ ] AC1: Host can edit room name from session settings sheet; non-host sees disabled row
- [ ] AC2: Room name change propagates to peers via Yjs doc
- [ ] AC3: "Default session name" preference persists across app restarts
- [ ] AC4: New sessions auto-apply default session name when set
- [ ] AC5: "Password by default" toggle persists across app restarts
- [ ] AC6: When toggled on, room creation prompts for password before entering lobby
- [ ] AC7: Password cancel creates room without password (open mode)
- [ ] AC8: "Relay URL" preference persists across app restarts
- [ ] AC9: Custom relay URL used for all relay HTTP and WS calls
- [ ] AC10: Clearing relay URL reverts to environment default
- [ ] AC11: WS URL auto-derived from HTTP URL
- [ ] AC12: Divergence doc updated to reflect current state
- [ ] AC13: `pnpm build` passes with no type errors

## Tasks

- [ ] **T1: Create AppPreferenceService**
  - File(s): `packages/client/src/app/core/app-preference.service.ts`
  - What: New injectable service with signals for `defaultSessionName`, `defaultPassword` (boolean), `relayHttpUrl`, `relayWsUrl` (derived). Persistence via Capacitor Preferences keys `hnch.defaultSessionName`, `hnch.defaultPassword`, `hnch.relayUrl`. `ensureLoaded()` method for `APP_INITIALIZER`. Auto-derive WS URL from HTTP URL (http→ws, https→wss).
  - AC: AC3, AC5, AC8, AC10, AC11

- [ ] **T2: Register AppPreferenceService in APP_INITIALIZER**
  - File(s): `packages/client/src/app/app.config.ts`
  - What: Add `AppPreferenceService.ensureLoaded()` to the existing initializer factory alongside `ScalePreferenceService`.
  - AC: AC3, AC5, AC8

- [ ] **T3: Room name row in session-settings sheet**
  - File(s): `packages/client/src/app/session-settings/session-settings.sheet.ts`
  - What: Add ion-item with ion-input at top of list for room name. Host-only guard via `isHost` input. Bind to current `settings().name`. On change → `docService.updateSettings({ name })`. Import IonInput.
  - AC: AC1, AC2

- [ ] **T4: Wire isHost into session-settings sheet**
  - File(s): `packages/client/src/app/session-settings/session-settings.sheet.ts`, `packages/client/src/app/lobby/lobby.page.ts`
  - What: Add `isHost` input to SessionSettingsSheetComponent. Pass from LobbyPage where host status is already known.
  - AC: AC1

- [ ] **T5: Settings page — Session Defaults section**
  - File(s): `packages/client/src/app/settings/settings.page.ts`
  - What: Add "Session Defaults" section with "Default session name" (button → half-sheet) and "Password by default" (toggle). Inject AppPreferenceService. Create or reuse text-editor sheet for session name.
  - AC: AC3, AC5

- [ ] **T6: Settings page — Advanced section**
  - File(s): `packages/client/src/app/settings/settings.page.ts`
  - What: Add "Advanced" section with "Relay URL" row (button → half-sheet). Show current URL or "Default". Reuse text-editor sheet pattern.
  - AC: AC8, AC10

- [ ] **T7: Wire relay URL override into relay-api calls**
  - File(s): `packages/client/src/app/core/relay/relay-api.ts`, `packages/client/src/app/home/home.page.ts`, `packages/client/src/app/session-settings/session-settings.sheet.ts`, `packages/client/src/app/core/doc/doc.service.ts` (or wherever `connect()` builds WS URL)
  - What: Replace hardcoded `environment.relayHttpUrl` / `environment.relayWsUrl` with AppPreferenceService signals. Fallback to environment defaults when pref is empty.
  - AC: AC9, AC10, AC11

- [ ] **T8: Wire session defaults into onCreateRoom()**
  - File(s): `packages/client/src/app/home/home.page.ts`
  - What: Read `appPrefs.defaultSessionName()` and pass to `createSession()`. Read `appPrefs.defaultPassword()` — if true, after room mint show password prompt sheet, hash + `patchRoomAccess()`, then navigate. Cancel → navigate without password.
  - AC: AC4, AC6, AC7

- [ ] **T9: Password prompt sheet for create flow**
  - File(s): `packages/client/src/app/home/password-prompt.sheet.ts` (new)
  - What: Half-sheet with password input + confirm button + cancel. Emits password string or cancel. Reuse styling from access-picker.sheet password input if applicable.
  - AC: AC6, AC7

- [ ] **T10: Update divergence doc**
  - File(s): `docs/cli-mobile-divergences.md`
  - What: Mark preset overrides UI + custom scale persistence as done. Mark manual host handoff as done. Update remaining items status. Add "Updated" date.
  - AC: AC12

- [ ] **T11: Build + verify**
  - `pnpm build` passes
  - Manual test: create room with default name, verify name appears; toggle default password, create room, verify prompt; set relay URL in settings, verify used; edit room name in-session as host
  - AC: AC13

## Key Files Reference

- `packages/client/src/app/settings/settings.page.ts` — app settings page (add sections)
- `packages/client/src/app/session-settings/session-settings.sheet.ts` — in-session settings (add room name)
- `packages/client/src/app/home/home.page.ts` — room creation flow (wire defaults)
- `packages/client/src/app/core/scale-preference.service.ts` — pattern reference for new service
- `packages/client/src/app/core/relay/relay-api.ts` — relay HTTP calls (wire URL override)
- `packages/client/src/app/core/doc/doc.service.ts` — Yjs doc service (connect + updateSettings)
- `packages/client/src/app/session-settings/access-picker.sheet.ts` — password input pattern reference
- `packages/client/src/app/settings/display-name-editor.sheet.ts` — text editor sheet pattern reference
- `packages/client/src/app/app.config.ts` — APP_INITIALIZER registration
- `packages/client/src/environments/environment.ts` — hardcoded relay URLs (fallback source)
- `packages/shared/src/doc.ts` — Settings type (name field)
- `docs/cli-mobile-divergences.md` — divergence doc to update
