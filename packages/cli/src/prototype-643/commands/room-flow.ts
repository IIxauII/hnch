/**
 * PROTOTYPE (#643). create / join / resume / the launcher, and the one path that
 * opens the Room and handles every way out of it (UX-009, UX-103).
 * Everything is fake: the "relay" is the room list in store.ts.
 */
import { closeSync, openSync, readFileSync } from 'node:fs';
import { ReadStream } from 'node:tty';

import type { FixtureName, RoomModel } from '../room-model.js';
import { RoomModel as Model } from '../room-model.js';
import { runRoomTui } from '../room-tui.js';
import { bool, str, type DisplayOpts, type ParsedArgs } from './args.js';
import { CliError, EXIT, formatError, glyphs, okLine, warnLine } from './errors.js';
import { askPassword, askText, pick, type PickItem } from './prompts.js';
import {
  addRoom,
  DEFAULT_RELAY,
  effectiveConfig,
  findRoom,
  forgetRoom,
  recent,
  relTime,
  rememberRoom,
  saveStories,
  type FakeRoom,
  type RecentEntry,
} from './store.js';
import {
  fixtureFlag,
  makeModel,
  parseCodeOrLink,
  simulateFlag,
  watchFlag,
  webUrl,
  whoFlag,
  type Simulation,
  type Who,
} from './rooms.js';
import { decideExit, summaryJson, summaryText, type ExitPath } from './summary.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (line: string) => process.stderr.write(`${line}\n`);
const interactive = () => Boolean(process.stdin.isTTY && process.stderr.isTTY);

function relayUrl(): string {
  return effectiveConfig().relayUrl.value ?? DEFAULT_RELAY;
}

function relayDown(action: string): CliError {
  return new CliError(
    EXIT.relayDown,
    `Can't reach the hnch relay at ${relayUrl()}.`,
    `Your network or the relay is down, so nothing was ${action}.`,
    'Try again in a minute. Using your own relay? Check it with: hnch config --json',
  );
}

function roomFull(r: FakeRoom): CliError {
  return new CliError(
    EXIT.runtime,
    `${r.name} is full (20 people).`,
    'A room holds at most 20 people, and nobody has left yet.',
    'Ask the host to make room, then run the same command again.',
  );
}

function stdinAll(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// ── Name (UX-089: Ink, prefilled from the cache) ───────────────────────────

async function yourName(d: DisplayOpts, a: ParsedArgs | undefined, who: Who, flagName?: string) {
  if (flagName) return flagName;
  // prototype: an explicit --as wins over the cached name, so Ana is not renamed "Hana"
  const cached = a && str(a, 'as') ? undefined : effectiveConfig().name.value;
  const dflt = cached ?? who.charAt(0).toUpperCase() + who.slice(1);
  if (!interactive()) {
    say(
      `Using the name ${dflt}${cached ? ' (from config)' : ''}. Change it: hnch config --name <name>`,
    );
    return dflt;
  }
  const typed = await askText(d, {
    label: 'Your name',
    initial: dflt,
    hint: (v) =>
      `${v === dflt ? `⏎ keep ${dflt}   type to change` : `⏎ use ${v || '…'}`}   ctrl+u clear   esc quit`,
    validate: (x) => (x.trim() ? undefined : 'A name helps people see who voted'),
  });
  if (typed === null)
    throw new CliError(
      EXIT.ok,
      'Cancelled.',
      'Nothing was created or joined.',
      `Start again: hnch ${a?.positionals[0] ?? ''}`.trim(),
    );
  return typed.trim();
}

// ── Password (UX-089: labelled, masked, wrong → re-ask, max 3, exit 4) ─────

async function checkPassword(d: DisplayOpts, a: ParsedArgs, room: FakeRoom): Promise<void> {
  const g = glyphs(d.ascii);
  const hint = `Prototype: the password for ${room.name} is ${room.password}`;
  if (bool(a, 'password-stdin')) {
    const pw = stdinAll().replace(/\r?\n$/u, '');
    say('Checking password…');
    if (pw !== room.password)
      throw new CliError(
        EXIT.wrongPassword,
        `That password didn't work for ${room.name}.`,
        'The password read from stdin does not match.',
        `Check it, then: printf '%s' "$PW" | hnch join ${room.code} --password-stdin`,
      );
    say(okLine('Password accepted', d));
    return;
  }
  if (!interactive())
    throw new CliError(
      EXIT.usage,
      `${room.name} needs a password, and there is no terminal to ask in.`,
      'Passwords are never taken as an argument, so they stay out of your shell history.',
      `In a script: printf '%s' "$PW" | hnch join ${room.code} --password-stdin`,
    );
  say(`${room.name} has a password. ${hint}.`);
  let error: string | undefined;
  for (let tries = 3; tries > 0; tries--) {
    const pw = await askPassword(d, { error, hint: '⏎ join   esc quit' });
    if (pw === null)
      throw new CliError(
        EXIT.ok,
        'Cancelled.',
        'You did not join.',
        `Try again: hnch join ${room.code}`,
      );
    say('Checking password…');
    await sleep(350);
    if (pw === room.password) {
      say(okLine('Password accepted', d));
      return;
    }
    const left = tries - 1;
    error = `${g.fail} That password didn't work. ${left} ${left === 1 ? 'try' : 'tries'} left.`;
  }
  throw new CliError(
    EXIT.wrongPassword,
    `Wrong password for ${room.name}, 3 tries.`,
    'The room was not joined and nothing was cached.',
    `Ask ${room.hostName} for the password, then: hnch join ${room.code}`,
  );
}

// ── The Room and every way out of it ───────────────────────────────────────

/** `pbpaste | hnch create --stories -` used stdin; the Room still needs keys, so read the terminal. */
function ensureKeyboard(): void {
  if (process.stdin.isTTY) return;
  try {
    const tty = new ReadStream(openSync('/dev/tty', 'r'));
    Object.defineProperty(process, 'stdin', { value: tty, configurable: true });
  } catch {
    // no controlling terminal: caught by the check below
  }
}

function hasKeyboard(): boolean {
  if (process.stdin.isTTY) return true;
  try {
    closeSync(openSync('/dev/tty', 'r'));
    return true;
  } catch {
    return false;
  }
}

/** Fail before any prompt or "network" work when the Room could not be drawn (UX-091). */
function needTerminal(d: DisplayOpts, sim: Simulation | undefined, cmd: string): void {
  if (sim && sim !== 'relay-down' && sim !== 'room-full') return; // the Room is skipped
  if (d.plain || (process.stdout.isTTY && hasKeyboard())) return;
  throw new CliError(
    EXIT.usage,
    'The Room needs a terminal.',
    "stdout isn't a terminal or there is no keyboard (a pipe, CI or a log), so nothing was created or joined.",
    `Run it in a terminal, or add --plain for one line per change: hnch ${cmd} --plain`,
  );
}

const ALT_OFF = '\x1b[?25h\x1b[?1049l';

async function openRoom(
  m: RoomModel,
  d: DisplayOpts,
  a: ParsedArgs,
  sim: Simulation | undefined,
  entry: RecentEntry,
): Promise<never> {
  const json = bool(a, 'json');
  const prevHost = m.state.hostId;
  let path: ExitPath;
  let inRoom = false;
  const finish = (p: ExitPath): never => {
    // room-tui.tsx leaves the alternate screen itself; a signal mid-Room has to do it here
    if (inRoom && !d.plain && process.stdout.isTTY) process.stdout.write(ALT_OFF);
    inRoom = false;
    applyExit(m, p);
    const o = decideExit(m, p, prevHost);
    if (o.keepInRecent) rememberRoom({ ...entry, lastSeenAt: Date.now() });
    else forgetRoom(m.state.code);
    saveStories(m.state.code, m.state.stories);
    process.stdout.write(`${json ? summaryJson(m, o) : summaryText(m, o)}\n`);
    process.exit(o.code);
  };

  if (
    sim === 'quit' ||
    sim === 'leave' ||
    sim === 'ended' ||
    sim === 'removed' ||
    sim === 'interrupted'
  ) {
    say(`(prototype) Skipping the Room: simulating "${sim}"`);
    return finish(sim);
  }

  ensureKeyboard();

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
    process.on(sig, () => finish('interrupted'));
  inRoom = true;
  const exit = await runRoomTui({
    model: m,
    plain: d.plain,
    color: d.color,
    ascii: d.ascii,
    webUrl: webUrl(m.state.code),
  });
  inRoom = false;
  const reason: string = exit.reason;
  path =
    reason === 'quit' || reason === 'leave' || reason === 'ended' || reason === 'removed'
      ? reason
      : 'interrupted';
  // the Room may have ended or removed us while it was open, whatever key closed it
  if (m.state.ended) path = 'ended';
  else if (m.self?.removedBy) path = 'removed';
  return finish(path);
}

function applyExit(m: RoomModel, p: ExitPath): void {
  const me = m.self;
  if (p === 'ended' && !m.state.ended) {
    m.state.ended = true;
    m.state.endedAt = Date.now();
  }
  if (p === 'removed' && !me?.removedBy) m.simulateKick();
  // quit and Ctrl+C both leave (writes leftAt, hands off host) and keep the room in Recent (UX-009)
  if ((p === 'quit' || p === 'leave' || p === 'interrupted') && me && !me.leftAt) m.leave();
}

// ── create ─────────────────────────────────────────────────────────────────

function readStories(src: string): { key: string; title: string }[] {
  let text: string;
  if (src === '-') {
    if (process.stdin.isTTY)
      throw new CliError(
        EXIT.usage,
        '--stories - reads the list from stdin, and nothing was piped in.',
        'One story per line, like "PROJ-101 Login form validation".',
        'Pipe it in: pbpaste | hnch create --stories -   (or: hnch create --stories backlog.txt)',
      );
    text = stdinAll();
  } else {
    try {
      text = readFileSync(src, 'utf8');
    } catch (e) {
      throw new CliError(
        EXIT.usage,
        `Can't read ${src}.`,
        (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'There is no such file.' : String(e),
        'Check the path, or pipe the list in: pbpaste | hnch create --stories -',
      );
    }
  }
  const parsed = Model.parseStories(text);
  if (!parsed.length)
    throw new CliError(
      EXIT.usage,
      `${src === '-' ? 'stdin' : src} has no stories.`,
      'Every line was empty.',
      'Write one story per line, like "PROJ-101 Login form validation".',
    );
  return parsed;
}

function newCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const c = () => chars[Math.floor(Math.random() * chars.length)]!;
  return `${c()}${c()}${c()}-${c()}${c()}${c()}`;
}

export async function cmdCreate(a: ParsedArgs, d: DisplayOpts): Promise<never> {
  // validate everything before any prompt or "network" work (UX-091)
  const who = whoFlag(a, 'hana');
  const fixture = fixtureFlag(a, 'host-alone');
  const sim = simulateFlag(a);
  const storiesSrc = str(a, 'stories');
  if (storiesSrc === '-' && bool(a, 'password-stdin'))
    throw new CliError(
      EXIT.usage,
      '--stories - and --password-stdin both read stdin.',
      'stdin can carry only one of them.',
      'Put the stories in a file: hnch create --stories backlog.txt --password-stdin',
    );
  const stories = storiesSrc ? readStories(storiesSrc) : undefined;
  needTerminal(d, sim, 'create');
  if (stories)
    say(
      okLine(
        `${stories.length} ${stories.length === 1 ? 'story' : 'stories'} ready: ${stories
          .slice(0, 3)
          .map((s) => s.key || s.title)
          .join(', ')}${stories.length > 3 ? ', …' : ''}`,
        d,
      ),
    );

  let password: string | undefined;
  if (bool(a, 'password-stdin')) password = stdinAll().replace(/\r?\n$/u, '');
  if (sim === 'relay-down') {
    say(`Connecting to ${relayUrl()}…`);
    await sleep(400);
    throw relayDown('created');
  }
  const name = await yourName(d, a, who);
  if (bool(a, 'password') && !password) {
    if (!interactive())
      throw new CliError(
        EXIT.usage,
        'A password room needs a password, and there is no terminal to ask in.',
        'Passwords are never taken as an argument.',
        `In a script: printf '%s' "$PW" | hnch create --password-stdin`,
      );
    const pw = await askPassword(d, {
      hint: 'people joining will need it · this device remembers it   ⏎ create   esc quit',
    });
    if (pw === null)
      throw new CliError(EXIT.ok, 'Cancelled.', 'Nothing was created.', 'Start again: hnch create');
    password = pw;
  }
  const roomName = str(a, 'name') ?? `${name}'s room`;
  const code = newCode();
  say(`Creating ${roomName}…`);
  await sleep(250);
  addRoom({ code, name: roomName, password, hostName: name, here: 1 });
  if (stories)
    saveStories(
      code,
      stories.map((s, i) => ({ id: `s${i + 1}`, key: s.key, title: s.title, status: 'queued' })),
    );
  const entry: RecentEntry = {
    code,
    name: roomName,
    lastSeenAt: Date.now(),
    passwordHash: Boolean(password),
    as: who,
  };
  rememberRoom(entry);
  const g = glyphs(d.ascii);
  say(
    okLine(
      `Room created · ${roomName} · ${code}${password ? ' · password on (remembered on this device)' : ''}`,
      d,
    ),
  );
  say(`  Link      ${webUrl(code)}`);
  say(`  Terminal  npx -y @xauyxau/hnch join ${code.replace('-', '')}`);
  say(`  ${g.dot} live`);
  const m = makeModel({ fixture, who, code, roomName, password: Boolean(password) });
  m.state.hostId = who; // whoever creates the room hosts it
  m.state.createdAt = Date.now();
  m.renameSelf(name);
  return openRoom(m, d, a, sim, entry);
}

// ── join ───────────────────────────────────────────────────────────────────

export async function cmdJoin(
  a: ParsedArgs,
  d: DisplayOpts,
  raw: string | undefined,
): Promise<never> {
  if (!raw)
    throw new CliError(
      EXIT.usage,
      'hnch join needs a room code or invite link.',
      'There is nothing to join yet.',
      'Try: hnch join K7P-9MR   or   hnch join "https://hnch.dev/join?code=K7P9MR"',
    );
  const relay = relayUrl();
  const { code, foreignOrigin } = parseCodeOrLink(raw, relay);
  const who = whoFlag(a, 'ana');
  const fixture = fixtureFlag(a, 'waiting');
  const sim = simulateFlag(a);
  needTerminal(d, sim, `join ${code}`);
  if (foreignOrigin)
    say(
      warnLine(
        `That link points at ${foreignOrigin}. Only the code ${code} is used, on your relay ${relay}. To use another relay: hnch config --relay-url <url>`,
        d,
      ),
    );
  say(`Looking up ${code}…`);
  await sleep(250);
  if (sim === 'relay-down') throw relayDown('joined');
  const room = findRoom(code);
  if (!room) {
    const wasRecent = recent().some((r) => r.code === code);
    if (wasRecent) forgetRoom(code);
    throw new CliError(
      EXIT.notFound,
      `Room ${code} not found.`,
      `It has ended, expired, or the code has a typo.${wasRecent ? ' Removed it from your recent rooms.' : ''}`,
      'Check the code with whoever invited you, or start your own: hnch create',
    );
  }
  if (sim === 'room-full') throw roomFull(room);
  say(
    `Join ${room.name} · ${room.here} people here · host ${room.hostName}${room.password ? ' · password' : ''}`,
  );
  const name = await yourName(d, a, who, str(a, 'name'));
  if (room.password) await checkPassword(d, a, room);
  say(`${glyphs(d.ascii).dot} live · ${room.name} · ${room.here + 1} people here`);
  const entry: RecentEntry = {
    code,
    name: room.name,
    lastSeenAt: Date.now(),
    passwordHash: Boolean(room.password),
    as: who,
  };
  rememberRoom(entry);
  const m = makeModel({
    fixture,
    who,
    code,
    roomName: room.name,
    password: Boolean(room.password),
    watch: watchFlag(a) || who === 'eve',
  });
  m.renameSelf(name);
  return openRoom(m, d, a, sim, entry);
}

// ── resume ─────────────────────────────────────────────────────────────────

function recentItems(list: RecentEntry[]): PickItem[] {
  return list.map((e) => ({
    label: `Resume ${e.name} · ${e.code}`,
    detail: `${relTime(e.lastSeenAt)}${e.passwordHash ? ' · password remembered' : ''}`,
  }));
}

export async function cmdResume(
  a: ParsedArgs,
  d: DisplayOpts,
  rawCode: string | undefined,
): Promise<never> {
  const list = recent();
  if (bool(a, 'list')) {
    if (bool(a, 'json'))
      process.stdout.write(
        `${JSON.stringify(
          list.map((e) => ({
            code: e.code,
            name: e.name,
            lastSeenAt: new Date(e.lastSeenAt).toISOString(),
            ago: relTime(e.lastSeenAt),
            passwordRemembered: Boolean(e.passwordHash),
            resume: `hnch resume ${e.code}`,
          })),
          null,
          2,
        )}\n`,
      );
    else if (!list.length) process.stdout.write('No recent rooms. Start one: hnch create\n');
    else
      for (const e of list)
        process.stdout.write(
          `${`${e.code}  ${e.name.padEnd(20)}  ${relTime(e.lastSeenAt).padEnd(12)}${e.passwordHash ? '  password remembered' : ''}`.trimEnd()}\n`,
        );
    process.exit(EXIT.ok);
  }
  let entry: RecentEntry | undefined;
  if (rawCode) {
    const { code } = parseCodeOrLink(rawCode, relayUrl());
    entry = list.find((e) => e.code === code);
    if (!entry)
      throw new CliError(
        EXIT.notFound,
        `${code} isn't in your recent rooms.`,
        'This device has not been in it, or forgot it after it ended.',
        `Join it instead: hnch join ${code}`,
      );
  } else if (list.length === 0) {
    throw new CliError(
      EXIT.notFound,
      'No recent rooms to resume.',
      'This device has not been in a room yet, or they all ended.',
      'Start one: hnch create   or join one: hnch join <code>',
    );
  } else if (list.length === 1) {
    entry = list[0];
  } else if (!interactive() && !d.plain) {
    throw new CliError(
      EXIT.usage,
      `You have ${list.length} recent rooms; which one?`,
      'There is no terminal to show a picker in.',
      `Name it: ${list.map((e) => `hnch resume ${e.code}`).join('   ')}`,
    );
  } else {
    const i = await pick(d, 'Resume which room?', recentItems(list));
    if (i === null) process.exit(EXIT.ok);
    entry = list[i];
  }
  return resumeEntry(a, d, entry!);
}

async function resumeEntry(a: ParsedArgs, d: DisplayOpts, entry: RecentEntry): Promise<never> {
  const sim = simulateFlag(a);
  const who = whoFlag(a, (entry.as as Who) ?? 'hana');
  const fixture: FixtureName = fixtureFlag(a, 'waiting');
  needTerminal(d, sim, `resume ${entry.code}`);
  say(`Rejoining ${entry.name} · ${entry.code}…`);
  await sleep(250);
  if (sim === 'relay-down') throw relayDown('rejoined (your recent rooms are kept)');
  const room = findRoom(entry.code);
  if (!room) {
    forgetRoom(entry.code);
    throw new CliError(
      EXIT.notFound,
      `${entry.name} (${entry.code}) has ended or expired.`,
      'Removed it from your recent rooms; the others are kept.',
      `Start the next one: hnch create --name "${entry.name}"`,
    );
  }
  if (sim === 'room-full') throw roomFull(room);
  if (room.password) {
    if (entry.passwordHash)
      say(okLine('Password remembered on this device', d)); // UX-031, UX-007 CLI side
    else await checkPassword(d, a, room);
  }
  say(`${glyphs(d.ascii).dot} live · ${room.name} · ${room.here} people here`);
  const m = makeModel({
    fixture,
    who,
    code: entry.code,
    roomName: entry.name,
    password: Boolean(room.password),
    watch: watchFlag(a) || who === 'eve',
  });
  const cached = str(a, 'as') ? undefined : effectiveConfig().name.value;
  if (cached) m.renameSelf(cached);
  return openRoom(m, d, a, sim, entry);
}

// ── launcher: `hnch` with no arguments ──────────────────────────────────────

export async function cmdLauncher(
  a: ParsedArgs,
  d: DisplayOpts,
  help: () => string,
): Promise<never> {
  if (!interactive() && !d.plain) {
    process.stderr.write(`${help()}\n`);
    process.exit(EXIT.usage); // §6.5: without a TTY, help with examples, exit 2
  }
  const list = recent();
  const items: PickItem[] = [
    ...recentItems(list),
    { label: 'Start a room' },
    { label: 'Join', detail: 'paste a code or link' },
  ];
  const i = await pick(d, 'hnch · pointing poker', items);
  if (i === null) process.exit(EXIT.ok);
  if (i < list.length) return resumeEntry(a, d, list[i]!);
  if (i === list.length) return cmdCreate(a, d);
  const raw = await askText(d, {
    label: 'Code or link',
    initial: '',
    hint: 'K7P-9MR, K7P9MR or https://hnch.dev/join?code=K7P9MR   ⏎ join   esc quit',
    validate: (v) => {
      try {
        parseCodeOrLink(v, relayUrl());
        return undefined;
      } catch (e) {
        return e instanceof CliError ? `${e.what} ${e.why}` : String(e);
      }
    },
  });
  if (raw === null) process.exit(EXIT.ok);
  return cmdJoin(a, d, raw);
}

export function printError(e: unknown, d: DisplayOpts): never {
  if (e instanceof CliError) {
    if (e.code === EXIT.ok) say(e.what);
    else say(formatError(e, d));
    process.exit(e.code);
  }
  say(
    formatError(
      new CliError(
        EXIT.runtime,
        'Something went wrong.',
        e instanceof Error ? e.message : String(e),
        'Run it again; if it keeps happening, file an issue: https://github.com/IIxauII/hnch/issues',
      ),
      d,
    ),
  );
  process.exit(EXIT.runtime);
}
