# cli.md — CLI conventions for hnch

The CLI (`packages/cli`, package `@xauyxau/hnch`) is a shipping surface alongside the mobile/PWA client. It targets developers and automation users who prefer a terminal workflow, and serves as a parity smoke-test client — it speaks the same Yjs-over-WebSocket protocol as the mobile client with no feature delta in core session behavior.

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
pnpm --filter @xauyxau/hnch dev

# built binary
pnpm --filter @xauyxau/hnch build
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
| `--relay-url` | Override the relay URL (default: `https://hnch.dev`) |
| `--scale` | Default scale ID for `create` (empty string clears) |
| `--session-name` | Default session name for `create` (empty string clears) |
| `--password` / `--no-password` | Whether `create` prompts for a password by default |

### `hnch agenda`

Manage the pre-session story agenda for the most recently joined session. Subcommands operate against the agenda stored in the session doc; the CLI reads the last-session cache to locate the active room.

```
hnch agenda <subcommand>
```

| Subcommand | Description |
|---|---|
| `add [--title "..."] [--ticket "..."] [--description "..."]` | Add a story. At least one of `--title` or `--ticket` is required. |
| `list` | List all agenda items in display order. |
| `skip <id>` | Mark an item as skipped (terminal — no round will be created for it). |
| `cancel <id>` | Soft-delete an item (terminal — removed from active agenda views). |
| `mv <id> [--before <id> \| --after <id>]` | Reorder an item relative to another item by ID. |

## Keyboard

The CLI is keyboard-driven end to end via Ink's input handling.

### Card picker

| Key | Action |
| --- | --- |
| `←` / `→` | Move focus between cards (wraps) |
| `Enter` | Cast vote on the focused card (re-press to clear) |
| `⌫` / `Del` | Clear vote |

### In-session shortcuts (Voting screen)

| Key | Action |
| --- | --- |
| `A` | Abstain / un-abstain (voters only) |
| `W` | Toggle your role: voter ↔ viewer |
| `E` | Open settings |
| `C` | Copy invite link |
| `R` | Reveal round (host only) |
| `S` | Skip round (host only) |
| `D` | Discard round (host only) |
| `Q` | Leave session |

## Protocol parity

The CLI uses the same `@hnch/shared` Yjs doc schema, the same `hashPassword()` function, and the same relay WebSocket handshake (`GET /rooms/:code` → `WS /ws/:uuid?did=...&pw=...`) as the mobile client. There is no feature delta in core session behavior: rounds (ADR-0013), voting and reveal (ADR-0018, ADR-0020), host election (ADR-0010), and access control (ADR-0009, ADR-0017) all behave identically.

Scale customization (preset overrides, custom scales) is persisted in `config.json` under `presetOverrides` and `customScales` keys, matching the `PresetOverrides` / `CustomScale` types from `@hnch/shared` (ADR-0019).

## Source layout

```
packages/cli/
  src/
    index.ts                  — entry point, yargs command wiring
    commands/
      agenda.ts               — hnch agenda subcommand handlers
    session.ts                — createSession / joinSession / wireSession / reconnect
    sync.ts                   — y-websocket provider setup
    relay-api.ts              — HTTP client for GET /rooms/:code and POST /rooms
    config.ts                 — config read/write helpers
    last-session.ts           — last-session cache read/write
    host-election.ts          — host-election observer (shared logic with mobile)
    room-code-input.ts        — room-code parsing / formatting helpers
    session-end-observer.ts   — observer for meta.sessionEndedAt (ADR-0023)
    session-expired.ts        — expired-room error handling
    share.ts                  — invite-URL generation for terminal output
    ui/
      App.tsx         — root Ink component (Lobby / Voting screens)
      Lobby.tsx
      Voting.tsx
      lobby-helpers.ts        — pure export and round-display helpers used by Lobby.tsx
      round-prompt-flow.ts    — two-step round-start prompt helpers (title/ticketId trim, agenda pre-fill)
      components/     — AccessPicker, CardPicker, ConfigSettings, CustomScaleEditor,
                        HostActionsMenu, LobbySettings, MenuList, ParticipantList,
                        PresetEditor, ScalePicker, SharePicker, StatusBar, TextInput, etc.
      hooks/
        useTransientNotice.ts — hook for transient status messages
```

## Testing

```
pnpm --filter @xauyxau/hnch test
```

Unit tests span `src/*.test.ts` files (`session`, `config`, `host-election`, `last-session`, `relay-api`, `room-code-input`, `session-end-observer`, `session-expired`, `share`, `sync`), `src/commands/agenda.test.ts`, and render tests throughout `src/ui/` (App, Lobby, Voting) and `src/ui/components/` (AccessPicker, CardPicker, CustomScaleEditor, HostActionsMenu, MenuList, ParticipantList, PresetEditor, ScalePicker, SharePicker, StatusBar, TextInput, and settings). A terminal-level e2e harness (node-pty + vitest, covering `create`/`join`/`resume` against a live relay) is planned but not yet implemented — see `docs/backlog.md` §5.2.
