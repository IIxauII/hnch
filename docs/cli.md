# cli.md — CLI conventions for hnch

The CLI (`packages/cli`, package `@xauyxau/hnch`) is a shipping surface alongside the mobile/PWA client. It targets developers and automation users who prefer a terminal workflow, and serves as a parity smoke-test client — it speaks the same Yjs-over-WebSocket protocol as the mobile client with no feature delta in core session behavior — except that quitting writes no `leave` yet (ADR-0036).

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

### Passwords

The prompt does not show what is typed — not in the terminal, its scrollback, or a screen share. Enter submits, Backspace edits, Ctrl+C aborts (exit code 130). Piped input is read as one line.

A password is compared without the whitespace around it, the same as in the app (see [ux.md](ux.md)). One that was asked for and comes back empty is refused — `Password cannot be empty.`, exit code 1 — rather than taken for "no password": `hnch create --password` never opens a room that was meant to be protected. One longer than 120 characters is refused as well; the app's fields end there.

### When the relay turns a session away

A connection that drops is retried. One the relay refuses for good ends the session in the terminal, whichever command started it:

| The relay says | The CLI |
|---|---|
| The room is gone | prints `Session expired (room no longer exists). Cached session cleared.`, forgets the session, exits with code 1 |
| The password that was just typed is wrong | prints `That password is incorrect.`, exits with code 1 |
| A password is needed by now, or the one this device had is no longer right | prints `Password changed — rejoin with: hnch join <code> --password`, forgets the stored password, exits with code 0 |
| The room is full | prints `This room is full (max 20 participants).`, exits with code 1. The session stays remembered for `hnch resume` if this device had been in it |

What is forgotten is the one session, never the others this device remembers. The same goes for leaving a session and for a session that ends.

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

Manage the pre-session story agenda for the most recently joined session. Subcommands operate against the agenda stored in the session doc; the CLI reads the last-session cache to locate the active room. Each one joins the room like `hnch join` would, acts once the room's state has arrived (or after 2 s if the relay does not answer), then closes.

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

The CLI uses the same `@hnch/shared` Yjs doc schema, the same `hashPassword()` function, and the same relay WebSocket handshake (`GET /rooms/:code` → `WS /ws/:uuid?did=...&pw=...`) as the mobile client. There is no feature delta in core session behavior: rounds (ADR-0013), voting and reveal (ADR-0018, ADR-0020), host election (ADR-0010), session end (ADR-0023), removal by the host (ADR-0036 §5), host-change notices, and access control (ADR-0009, ADR-0017) all behave identically, because both surfaces run the same shared drivers and command set. Both run them through the shared live session (`live-session` in `@hnch/shared`: the doc, presence, the relay connection, the drivers and the command set). One delta remains: `Q` disconnects without writing a `leave`, so peers see the CLI as offline rather than gone (ADR-0036 Trade-offs).

Scale customization (preset overrides, custom scales) is persisted in `config.json` under `presetOverrides` and `customScales` keys, matching the `PresetOverrides` / `CustomScale` types from `@hnch/shared` (ADR-0019).

## Source layout

```
packages/cli/
  src/
    index.ts                  — entry point, yargs command wiring
    about.ts                  — version, source link and license for --help / --version (AGPL-3.0 §13)
    commands/
      agenda.ts               — hnch agenda subcommand handlers
    session.ts                — createSession / joinSession / openSession: the adapter over the shared live session
    session-exit.ts           — the one way out of a live session: quit, ended, removed, refused
    refusal.ts                — what a refusal does: when it ends the session, and its verdict
    config.ts                 — config read/write helpers
    last-session.ts           — last-session cache read/write
    room-code-input.ts        — room-code parsing / formatting helpers
    session-expired.ts        — expired-room error handling
    share.ts                  — invite-URL generation for terminal output
    ui/
      App.tsx         — root Ink component (Lobby / Voting screens)
      Lobby.tsx
      Voting.tsx
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

Unit tests are spread across `src/*.test.ts` files (`session` — against the run's relay, which `vitest.relay-setup.ts` starts once through the `@hnch/relay/testing` harness, `session-exit`, `refusal`, `about`, `config`, `last-session`, `room-code-input`, `session-expired`, `share`), `src/commands/agenda.test.ts`, and `src/ui/components/settings.test.ts`. A terminal-level e2e harness (node-pty + vitest, covering `create`/`join`/`resume` against a live relay) is planned but not yet implemented ([#608](https://github.com/IIxauII/hnch/issues/608)).
