# Plan: CLI In-Session Lobby Settings (Host)

## Context

CLI hosts have no way to modify room settings after creation. Mobile client supports changing scale mid-session. Room name editing exists in neither platform (schema supports it, no UI). This plan adds a host-only settings panel to the CLI Lobby screen for: **room name** and **estimation scale**.

Password management explicitly excluded from scope.

## Current State

| Setting | Yjs schema | Mobile UI | CLI |
|---------|-----------|-----------|-----|
| Room name (`settings.name`) | Yes | No | No |
| Scale (`settings.defaultScale`) | Yes | Yes (`patchSettings`) | No |

Key existing pieces:
- `patchSettings(doc, patch)` in `@hnch/shared` — shallow-merges into settings map, `undefined` deletes key
- `StatusBar.tsx` already reads `projection.settings.name` reactively
- Lobby.tsx uses `useInput` with keybindings `[s]` `[n]` `[v]` `[q]`
- `CardPicker.tsx` demonstrates `useInput` + cursor state pattern

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UX pattern | Sub-screen via `[e]` | Clean input isolation; no conflict between text typing and lobby hotkeys |
| Text input | Custom `TextInput` component | Zero new deps; same `useInput` pattern as CardPicker |
| Scale picker | Vertical radio list (↑↓) | Consistent with parent menu navigation |
| Empty room name | Remove (`undefined`) | StatusBar falls back to room code only |
| `[e]` availability | Anytime host is in Lobby | Before rounds, between rounds, after reveal |

## Implementation Steps

### 1. `packages/cli/src/session.ts` — Extend SessionHandle

Add to interface + `wireSession` implementation:

- `updateName(name: string | undefined): void` — calls `patchSettings(doc, { name })`
- `updateScale(scale: Scale): void` — calls `patchSettings(doc, { defaultScale: scale })`

Import `patchSettings` from `@hnch/shared`.

### 2. `packages/cli/src/ui/components/TextInput.tsx` — New file

Minimal controlled text input using `useInput`:

```typescript
interface TextInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  placeholder?: string
  isActive?: boolean
}
```

No external dependencies. Handles printable chars, backspace, return. Shows cursor at end of value.

### 3. `packages/cli/src/ui/components/SettingsPanel.tsx` — New file

Host-only settings sub-screen. State machine:

- **idle** — cursor-based menu (↑↓ select, Enter edit, Esc close)
- **editing-name** — TextInput active for room name
- **picking-scale** — vertical radio list (↑↓ select, Enter confirm, Esc cancel)

Menu layout:
```
── Settings ──
> Room name     [Sprint 42]
  Scale         [Fibonacci]

↑↓ select  ⏎ edit  esc close
```

Scale picker (when editing):
```
  > Fibonacci
    T-shirt

↑↓ select  ⏎ confirm  esc cancel
```

Props:
```typescript
interface SettingsPanelProps {
  currentName: string | undefined
  currentScale: Scale
  onChangeName: (name: string | undefined) => void
  onChangeScale: (scale: Scale) => void
  onClose: () => void
}
```

Empty name submission → calls `onChangeName(undefined)` to remove.

### 4. `packages/cli/src/ui/Lobby.tsx` — Integrate settings panel

- Add `[e]` keybinding (host-only, always available in Lobby)
- Add props: `settingsOpen`, `onOpenSettings`, `onCloseSettings`, `onChangeName`, `onChangeScale`
- When `settingsOpen`: render `SettingsPanel`, disable lobby keybindings via `useInput({ isActive: !settingsOpen })`
- Keybinding hints:
  - Before rounds: `[s] Start round  [e] Settings  [q] Quit`
  - After reveal: `[v] Re-vote  [n] Next round  [e] Settings  [q] Quit`

### 5. `packages/cli/src/ui/App.tsx` — Wire state + callbacks

- `settingsOpen` state (boolean)
- Callbacks: `handleChangeName` → `session.updateName()`, `handleChangeScale` → `session.updateScale()`, toggle handlers
- Disable `[q]` quit when settings open: `useInput(…, { isActive: !settingsOpen })`
- Pass all as props to `Lobby`

## Input Isolation Matrix

| Component | Settings open | Settings closed |
|-----------|:---:|:---:|
| App.tsx `[q]` quit | inactive | active |
| Lobby.tsx `[s/n/v/e]` | inactive | active |
| SettingsPanel menu nav | active (idle state) | not mounted |
| SettingsPanel scale picker | active (picking-scale state) | not mounted |
| TextInput | active (editing-name state) | not mounted |

## Edge Cases

- **Scale change during active round**: only affects next round (scale snapshotted at round creation)
- **Empty room name**: treated as remove → `patchSettings(doc, { name: undefined })` → StatusBar shows room code only
- **Concurrent edits**: Yjs CRDT last-write-wins. Acceptable.

## Files Modified
- `packages/cli/src/session.ts` — extend `SessionHandle` with `updateName`, `updateScale`
- `packages/cli/src/ui/Lobby.tsx` — add `[e]` keybinding, settings panel integration
- `packages/cli/src/ui/App.tsx` — wire settings state + callbacks

## Files Created
- `packages/cli/src/ui/components/TextInput.tsx` — minimal text input component
- `packages/cli/src/ui/components/SettingsPanel.tsx` — settings sub-screen

## Verification

1. `pnpm --filter @hnch/cli build` — compiles clean
2. Start relay: `pnpm --filter @hnch/relay dev`
3. Create session: `hnch create --name "Test"`
4. In Lobby, press `[e]` → settings panel appears
5. Edit room name → StatusBar updates immediately
6. Clear room name → StatusBar shows room code only
7. Change scale → start new round → verify new scale cards shown
8. Escape → returns to normal Lobby keybindings
9. Non-host joins → verify `[e]` not shown / inactive
10. Open settings during active round (from Voting back to Lobby after reveal) → works
