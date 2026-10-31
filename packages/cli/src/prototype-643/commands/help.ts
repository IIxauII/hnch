/**
 * PROTOTYPE (#643). Examples-first help per command (UX-090), the exit-code table
 * (UX-091) and the narrowed parity contract (UX-082).
 */
import { EXIT_TABLE } from './errors.js';
import { STORE_DIR } from './store.js';

export const VERSION = '1.19.0';
export const VERSION_LABEL = `${VERSION} (prototype #643: the 1.x deprecation release)`;

const PROTO = `Prototype only
  --as hana|ana|eve        who you are: host, voter, viewer (create: hana, join: ana)
  --fixture <name>         start the Room in a fixture, e.g. voting-partial, revealed-close
  --simulate <what>        relay-down, room-full, or an exit path: quit, leave, ended,
                           removed, interrupted (skips the Room, prints the summary)
  Fake rooms: K7P-9MR Sprint 42 · Q2M-4TT Retro (password retro42) · anything else
  is "not found". Wipe the prototype's state with: hnch proto reset
  State: ${STORE_DIR}`;

const DISPLAY = `Display
  --plain                  screen-reader / log mode: no boxes, one line per change
                           (also --screen-reader)
  --no-color               no colour; glyphs and words keep every meaning
                           (also NO_COLOR=1, FORCE_COLOR=0, TERM=dumb)
  HNCH_ASCII=1             ASCII glyphs (automatic on TERM=linux)
  --json                   machine output for --version, resume --list, agenda list,
                           config, and the exit summary
  -h, --help               help for any command   ·   -v, --version`;

export const HELP: Record<string, string> = {
  main: `hnch — pointing poker in your terminal

Examples
  hnch                                      pick: resume a recent room, start, or join
  hnch create --name "Sprint 42"            start a room and open it
  pbpaste | hnch create --stories -         start a room with your backlog queued
  hnch join K7P-9MR                         join by code (K7P9MR and k7p-9mr work too)
  hnch join "https://hnch.dev/join?code=K7P9MR"   …or paste the invite link
  npx -y @xauyxau/hnch join K7P-9MR         no install, no y/N prompt
  hnch resume                               back into the room you left

Commands
  hnch                      launcher (in a terminal); help and exit 2 without one
  create                    start a room: --name, --stories <file|->, --password
  join <code|link>          join a room: --name, --watch, --password-stdin
  resume [code]             rejoin a recent room; --list [--json] to see them
  config                    your name, colour, default scale, relay
  agenda …                  deprecated, goes away in 2.0.0 (see hnch agenda -h)
  help parity|exit-codes    the CLI's parity contract; what each exit code means

${DISPLAY}

${PROTO}

Exit codes: ${EXIT_TABLE.map((e) => e.code).join(' ')} (hnch help exit-codes)
Source code: https://github.com/IIxauII/hnch (AGPL-3.0-only)`,

  create: `hnch create — start a room and open it as the host

Examples
  hnch create
  hnch create --name "Sprint 42" --stories backlog.txt
  pbpaste | hnch create --stories -
  hnch create --password

Options
  --name <room name>       defaults to "<your name>'s room"
  --stories <file|->       one story per line ("PROJ-101 Login form validation");
                           - reads stdin. Replaces "hnch agenda add"
  --password               ask for a room password (masked); people joining need it,
                           and this device remembers it so resume never asks
  --password-stdin         read the password from stdin (scripts; never in argv)

You're asked for your name once, prefilled from last time. ⏎ keeps it.

${DISPLAY}

${PROTO}`,

  join: `hnch join — join a room by code or invite link

Examples
  hnch join K7P-9MR
  hnch join k7p9mr --name Ana
  hnch join "https://hnch.dev/join?code=K7P9MR" --watch
  npx -y @xauyxau/hnch join K7P-9MR
  printf '%s' "$PW" | hnch join Q2M-4TT --password-stdin

Only the code is used. A link to another site prints a warning and joins on your
relay (change relays with: hnch config --relay-url <url>).

Options
  --name <your name>       skip the name prompt
  --watch                  join as a viewer (no card deck); press o to vote instead
  --password-stdin         read the password from stdin. In a terminal you're asked:
                           "Room password", masked, 3 tries, then exit 4

${DISPLAY}

${PROTO}`,

  resume: `hnch resume — rejoin a room you were in

Examples
  hnch resume                  the most recent room (a picker if you have several)
  hnch resume K7P-9MR          a specific one
  hnch resume --list --json    what this device remembers

Quitting the Room (q, Leave, or Ctrl+C) keeps the room here, so resume always works
until the room ends. Password rooms don't ask again: the device remembers.

${DISPLAY}

${PROTO}`,

  config: `hnch config — your settings (the only place the CLI has them)

Examples
  hnch config                              editor: ↑↓ move, ⏎ change/select, esc done
  hnch config --name Ana                   save for this folder
  hnch config --scale t-shirt --global     save for every folder
  hnch config --json                       values and where each comes from

Options
  --name <s>  --color <palette|#rrggbb>  --scale <id>  --relay-url <url>
  --global                 save to the global config instead of this folder's

HNCH_RELAY_URL wins over the saved relay; the editor says "(overridden by …)".
Custom scales and presets are edited on the web; the CLI uses them.

${DISPLAY}`,

  agenda: `hnch agenda — DEPRECATED, goes away in hnch 2.0.0

Use instead
  hnch create --stories backlog.txt     queue stories when you start the room
  pbpaste | hnch create --stories -
  +  in the Room                         paste many stories at once

Until 2.0.0 (each runs, prints, and exits; it never joins the room, so nobody sees it)
  hnch agenda list [--json]             numbered list of what's up next
  hnch agenda add "PROJ-106 Audit log"  or: pbpaste | hnch agenda add -
  hnch agenda skip 2                    by number from list, or by key: skip PROJ-103
  hnch agenda cancel PROJ-105
  hnch agenda mv 3 1                    move story 3 to position 1
  --room <code>                         which room (default: your most recent)

${PROTO}`,

  parity: `hnch help parity — what the CLI must match the web on

parity = wire protocol + core loop (vote, pass, reveal, accept/next, re-vote,
skip story, add stories, invite, watch, hand off, leave, end) + shared key registry.

Management UIs may be web-only: custom scale and preset editors, profile and
appearance, story editing beyond add/skip. The CLI reads what the web saves.

This narrows ADR-0021 Decision 2 (lockstep parity). A new ADR (ADR-0053 in the
plan) would supersede it before any CLI cut lands; hnch agenda and the Ink config
editors go in 2.0.0, after this deprecation release.`,

  'exit-codes': `hnch help exit-codes

${EXIT_TABLE.map((e) => `  ${String(e.code).padStart(3)}  ${e.meaning}`).join('\n')}

Errors go to stderr in three parts: what happened, why, what to do next.
Try: pnpm proto:643:cli join ZZZ-ZZZ; echo $?`,
};
