/** PROTOTYPE (#643). Coverage entries owned by the cli-commands area. */
import type { CoverageEntry } from './coverage';

export const CLI_COMMANDS_COVERAGE: CoverageEntry[] = [
  {
    ux: 'UX-009',
    kind: 'cli',
    how: 'Quitting the Room (q, Leave, or Ctrl+C) leaves the room (writes leftAt, hands off host) and keeps only that room in Recent, then prints "Left Sprint 42 · resume with: hnch resume K7P-9MR". The other cached rooms are never wiped.',
    try: 'pnpm proto:643:cli resume K7P-9MR, press q then y, then run pnpm proto:643:cli resume --list',
  },
  {
    ux: 'UX-082',
    kind: 'note',
    how: 'Not visual: the plan narrows ADR-0021 Decision 2 to "parity = wire protocol + core loop (vote, pass, reveal, accept/next, re-vote, skip story, add stories, invite, watch, hand off, leave, end) + shared registry; management UIs may be web-only". A new ADR (ADR-0053) would supersede ADR-0021 before any CLI cut.',
  },
  {
    ux: 'UX-082',
    kind: 'cli',
    how: '`hnch help parity` prints the narrowed parity contract and the ADR note; `hnch config` says custom scales are edited on the web.',
    try: 'pnpm proto:643:cli help parity',
  },
  {
    ux: 'UX-087',
    kind: 'cli',
    how: 'With 2+ cached rooms, `hnch` and `hnch resume` show an Ink picker (↑↓ ⏎ or a digit) with "Resume Sprint 42 · K7P-9MR · 5 min ago" rows; `hnch resume <code>` picks directly, and `resume --list --json` lists them. Without a terminal it names the codes instead of failing.',
    try: 'pnpm proto:643:cli resume',
  },
  {
    ux: 'UX-088',
    kind: 'cli',
    how: '`hnch agenda list|add|skip|cancel|mv` are kept only as a deprecation release: each prints "deprecated, goes away in 2.0.0, use create --stories or + in the Room", does its job and exits at once ("exited in 1 ms").',
    try: 'pnpm proto:643:cli agenda list',
  },
  {
    ux: 'UX-089',
    kind: 'cli',
    how: 'The name prompt is Ink, prefilled from the cache (⏎ keeps it). The password prompt is labelled "Room password", masked with •, cleared after submit; a wrong one says "That password didn\'t work. 2 tries left.", and after 3 tries it exits 4. A right one shows "● live · Retro · 5 people here", not a stuck "connecting". Scripts use --password-stdin.',
    try: 'pnpm proto:643:cli join Q2M-4TT   (the password is retro42; type a wrong one first)',
  },
  {
    ux: 'UX-090',
    kind: 'cli',
    how: '`join` accepts K7P-9MR, k7p9mr and https://hnch.dev/join?code=K7P9MR (only the code is used; a link to another site warns), `hnch K7P9MR` works too. `-v/--version` (with --json), `-h` on every command with examples first, `--json` on the non-interactive paths, and the help shows `npx -y @xauyxau/hnch join …`.',
    try: 'pnpm proto:643:cli join https://hnch.dev/join?code=K7P9MR',
  },
  {
    ux: 'UX-091',
    kind: 'cli',
    how: 'One exit-code table (0 ok, 1 runtime, 2 usage, 3 not found, 4 wrong password, 5 removed, 6 relay unreachable, 130 Ctrl+C) and one three-part error on stderr: what happened, why, the next command. Flags, codes, files and the terminal are checked before any prompt or network work.',
    try: 'pnpm proto:643:cli join ZZZ-ZZZ; echo $?   (also: pnpm proto:643:cli create --simulate relay-down; echo $?)',
  },
  {
    ux: 'UX-092',
    kind: 'cli',
    how: 'Agenda one-shots never join the fake room: no presence entry, no role change, no election or auto-reveal; each says "(not shown to others: read and written without joining)" and echoes the room code.',
    try: 'pnpm proto:643:cli agenda skip 2',
  },
  {
    ux: 'UX-093',
    kind: 'cli',
    how: '`agenda list` numbers what is up next, and skip/cancel/mv take that number or a key (`agenda skip 2`, `agenda mv 3 1`, `agenda cancel PROJ-105`); --room names the room, defaulting to your most recent. The real fix is the 2.0.0 cut to `create --stories <file|->`.',
    try: 'pnpm proto:643:cli agenda mv 3 1',
  },
  {
    ux: 'UX-100',
    kind: 'cli',
    how: '--no-color, NO_COLOR, FORCE_COLOR=0 and TERM=dumb all turn colour off (measured: 0 colour SGR codes with NO_COLOR=1, 64 without); every status keeps its glyph + word. HNCH_ASCII=1 or TERM=linux switches to ASCII glyphs.',
    try: 'NO_COLOR=1 pnpm proto:643:cli resume K7P-9MR',
  },
  {
    ux: 'UX-102',
    kind: 'cli',
    how: '`hnch config` is the only place with settings (none inside the Room): Enter always selects, Esc always goes back, text rows have readline keys (←→, ctrl+a/e/u/k), it writes the local (this folder) config unless --global, and it says "overridden by HNCH_RELAY_URL".',
    try: 'HNCH_RELAY_URL=http://localhost:8787 pnpm proto:643:cli config',
  },
  {
    ux: 'UX-103',
    kind: 'cli',
    how: 'On every exit path (quit, leave, ended, removed, Ctrl+C) the alternate screen is gone and a plain summary goes to scrollback: headline, one row per story, "Still to estimate", "1 estimated · 5 pts · 1 hnch\'d · 18 min", and the resume (or next) line. --json prints it as JSON.',
    try: 'pnpm proto:643:cli resume K7P-9MR --fixture ended --simulate ended --json',
  },
  {
    ux: 'UX-104',
    kind: 'cli',
    how: '--plain (alias --screen-reader) switches prompts to numbered/line questions and the Room to one line per change; without a terminal the Room says so and suggests --plain instead of crashing.',
    try: 'pnpm proto:643:cli join K7P9MR --plain',
  },
  {
    ux: 'UX-007',
    kind: 'cli',
    how: 'CLI side: `hnch create --password` asks once (masked), and the device remembers it, so the host\'s `hnch resume` never re-prompts ("Password remembered on this device").',
    try: 'pnpm proto:643:cli create --password',
  },
  {
    ux: 'UX-024',
    kind: 'cli',
    how: 'CLI side: create shows "Connecting to https://hnch.dev…", and an unreachable relay ends with a three-part error, "nothing was created", exit 6.',
    try: 'pnpm proto:643:cli create --simulate relay-down; echo $?',
  },
  {
    ux: 'UX-026',
    kind: 'cli',
    how: "CLI side: a pasted invite link joins (the code is taken from ?code=), a bad one says what a code looks like instead of yielding a bogus code; the launcher's Join row takes a code or a link.",
    try: 'pnpm proto:643:cli join "https://hnch.dev/join?code=K7P9MR"',
  },
  {
    ux: 'UX-031',
    kind: 'cli',
    how: 'CLI side: resuming the password room Retro (Q2M-4TT) skips the prompt because the hash is cached; the picker row says "password remembered".',
    try: 'pnpm proto:643:cli resume Q2M-4TT',
  },
];
