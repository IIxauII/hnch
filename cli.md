# cli.md — CLI conventions for hnch

The CLI (`packages/cli`, package `@hnch/cli`) is a shipping surface alongside the mobile/PWA client. It targets developers and automation users who prefer a terminal workflow, and serves as a parity smoke-test client — it speaks the same Yjs-over-WebSocket protocol as the mobile client with no feature delta in core session behavior.

Consult [`angular.md`](angular.md) and [`ionic.md`](ionic.md) when working on the mobile client. This document covers the CLI surface only.

## Stack

| Layer | Tech |
|---|---|
| UI rendering | [Ink](https://github.com/vadimdemedes/ink) — React for terminal |
| Argument parsing | yargs |
| State/sync | Yjs (same `@hnch/shared` doc types as mobile client) |
| Sync transport | y-websocket (same relay, same protocol) |
| Config persistence | `~/.config/hnch/config.json` |
| Runtime | Node.js (ESM) |

## Running

```
# development
pnpm --filter @hnch/cli dev

# built binary
pnpm --filter @hnch/cli build
node packages/cli/dist/index.js <command>
```

Once linked globally (`npm link` or similar), the binary is `hnch`.

## Commands

### `hnch create`

Creates a new room and drops into the session UI as host.

```
hnch create [--name "Sprint 42"] [--password] [--scale <id>]
```

| Option | Description |
|---|---|
| `--name` | Session name (falls back to `config.defaultSessionName`) |
| `--password` | Prompt for a password to protect the room |
| `--scale` | Estimation scale ID: `fibonacci`, `t-shirt`, `powers-of-2`, `linear`, `risk`, or `custom-<id>` (falls back to `config.defaultScale`, then `fibonacci`) |

### `hnch join <code>`

Joins an existing room by 6-character code.

```
hnch join K7P9MR [--password]
```

If the room is password-protected and `--password` is not passed, the CLI prompts automatically after resolving the room code.

### `hnch resume`

Rejoins the most recent session from the last-session cache (`~/.config/hnch/last-session.json`). Exits cleanly if the session is no longer active on the relay.

### `hnch config`

Views or updates the CLI config file at `~/.config/hnch/config.json`. With no flags, opens the interactive config UI (Ink component). With flags, writes directly.

```
hnch config [--name "Alice"] [--relay-url http://...] [--scale <id>] [--session-name "..."] [--password | --no-password]
```

| Flag | Description |
|---|---|
| `--name` | Display name used in sessions |
| `--relay-url` | Override the relay URL (default: `http://localhost:1234`) |
| `--scale` | Default scale ID for `create` (empty string clears) |
| `--session-name` | Default session name for `create` (empty string clears) |
| `--password` / `--no-password` | Whether `create` prompts for a password by default |

## Protocol parity

The CLI uses the same `@hnch/shared` Yjs doc schema, the same `hashPassword()` function, and the same relay WebSocket handshake (`GET /rooms/:code` → `WS /ws/:uuid?did=...&pw=...`) as the mobile client. There is no feature delta in core session behavior: rounds (ADR-0013), voting and reveal (ADR-0018, ADR-0020), host election (ADR-0010), and access control (ADR-0009, ADR-0017) all behave identically.

Scale customization (preset overrides, custom scales) is persisted in `config.json` under `presetOverrides` and `customScales` keys, matching the `PresetOverrides` / `CustomScale` types from `@hnch/shared` (ADR-0019).

## Source layout

```
packages/cli/
  src/
    index.ts                  — entry point, yargs command wiring
    session.ts                — createSession / joinSession / wireSession / reconnect
    sync.ts                   — y-websocket provider setup
    relay-api.ts              — HTTP client for GET /rooms/:code and POST /rooms
    config.ts                 — config read/write helpers
    last-session.ts           — last-session cache read/write
    host-election.ts          — host-election observer (shared logic with mobile)
    room-code-input.ts        — room-code input normalization / validation
    session-end-observer.ts   — observes meta.sessionEndedAt and navigates home
    session-expired.ts        — handles relay-reported unknown-room on resume
    share.ts                  — invite URL / room code sharing helpers
    ui/
      App.tsx                 — root Ink component (Lobby / Voting screens)
      Lobby.tsx
      Voting.tsx
      hooks/
        useTransientNotice.ts — ephemeral notice state hook
      components/
        AccessPicker.tsx
        CardPicker.tsx
        ConfigSettings.tsx
        CustomScaleEditor.tsx
        HostActionsMenu.tsx
        LobbySettings.tsx
        MenuList.tsx
        ParticipantList.tsx
        PresetEditor.tsx
        ScalePicker.tsx
        SharePicker.tsx
        StatusBar.tsx
        TextInput.tsx
```

## Testing

```
pnpm --filter @hnch/cli test
```

Unit tests are spread across `src/` (e.g. `session.test.ts`, `config.test.ts`, `host-election.test.ts`, `relay-api.test.ts`, `share.test.ts`, and others) and `src/ui/components/settings.test.ts`. The CLI is also exercised by the Playwright e2e suite in `packages/e2e` as a parity smoke client.
