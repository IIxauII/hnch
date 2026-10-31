/**
 * PROTOTYPE (#643). `hnch agenda list|add|skip|cancel|mv` as the 1.x deprecation
 * release would ship them (O10 / D16: cut in 2.0.0). Each prints a deprecation
 * line, does its job against the fake room, and EXITS (UX-088). None joins as a
 * participant: no presence, no role change, no election (UX-092). Stories are
 * picked by the index `list` prints or by key (UX-093). The room is named with
 * --room, or is your most recent one, and is echoed back on success.
 */
import { readFileSync } from 'node:fs';

import { RoomModel, type Story } from '../room-model.js';
import { bool, str, type DisplayOpts, type ParsedArgs } from './args.js';
import { CliError, EXIT, okLine, warnLine } from './errors.js';
import { parseCodeOrLink } from './rooms.js';
import {
  DEFAULT_RELAY,
  findRoom,
  recent,
  savedStories,
  saveStories,
  type FakeRoom,
} from './store.js';

const say = (line: string) => process.stderr.write(`${line}\n`);

function target(a: ParsedArgs): FakeRoom {
  const raw = str(a, 'room');
  const code = raw ? parseCodeOrLink(raw, DEFAULT_RELAY).code : recent()[0]?.code;
  if (!code)
    throw new CliError(
      EXIT.usage,
      'Which room?',
      'You have no recent rooms, so there is no default.',
      'Name it: hnch agenda list --room K7P-9MR',
    );
  const room = findRoom(code);
  if (!room)
    throw new CliError(
      EXIT.notFound,
      `Room ${code} not found.`,
      'It has ended or expired.',
      'See your rooms: hnch resume --list',
    );
  return room;
}

function load(room: FakeRoom): Story[] {
  return savedStories(room.code) ?? new RoomModel('waiting', 'hana').state.stories;
}

const queued = (s: Story[]) => s.filter((x) => x.status === 'queued');
const label = (x: Story) => (x.key ? `${x.key} ${x.title}` : x.title);

function resolve(stories: Story[], ref: string | undefined, room: FakeRoom, verb: string): Story {
  if (!ref)
    throw new CliError(
      EXIT.usage,
      `hnch agenda ${verb} needs a story.`,
      'Use the number from `hnch agenda list`, or a key like PROJ-103.',
      `For example: hnch agenda ${verb} 2`,
    );
  const q = queued(stories);
  if (/^\d+$/u.test(ref)) {
    const hit = q[Number(ref) - 1];
    if (hit) return hit;
    throw new CliError(
      EXIT.usage,
      `There is no story ${ref} in ${room.name}.`,
      q.length ? `${q.length} are up next, numbered 1–${q.length}.` : 'Nothing is up next.',
      `See them: hnch agenda list --room ${room.code}`,
    );
  }
  const hit = stories.find((x) => x.key.toLowerCase() === ref.toLowerCase());
  if (hit) return hit;
  throw new CliError(
    EXIT.usage,
    `No story ${ref} in ${room.name}.`,
    'Keys match what `hnch agenda list` shows.',
    `See them: hnch agenda list --room ${room.code}`,
  );
}

export function cmdAgenda(a: ParsedArgs, d: DisplayOpts): never {
  const t0 = performance.now();
  const [, sub, ...rest] = a.positionals;
  say(
    warnLine(
      'hnch agenda is deprecated and goes away in hnch 2.0.0. Queue stories with: hnch create --stories <file|->, or press + in the Room.',
      d,
    ),
  );
  if (!sub || !['list', 'add', 'skip', 'cancel', 'mv'].includes(sub))
    throw new CliError(
      EXIT.usage,
      sub ? `hnch agenda ${sub} isn't a command.` : 'hnch agenda needs a subcommand.',
      'Subcommands: list, add, skip, cancel, mv.',
      'For example: hnch agenda list',
    );
  const room = target(a);
  const stories = load(room);
  const where = `${room.name} · ${room.code}`;
  const done = (msg: string) => {
    say(okLine(`${msg} · ${where}`, d));
    say(
      `(not shown to others: read and written without joining · exited in ${Math.round(performance.now() - t0)} ms)`,
    );
    process.exit(EXIT.ok);
  };

  if (sub === 'list') {
    const q = queued(stories);
    if (bool(a, 'json')) {
      process.stdout.write(
        `${JSON.stringify({ room: { code: room.code, name: room.name }, upNext: q.map((x, i) => ({ n: i + 1, key: x.key, title: x.title })), done: stories.filter((x) => x.status === 'done').map((x) => ({ key: x.key, title: x.title, value: x.value })), skipped: stories.filter((x) => x.status === 'skipped').map((x) => ({ key: x.key, title: x.title })) }, null, 2)}\n`,
      );
    } else {
      const out = [`${where} · ${q.length} up next`];
      q.forEach((x, i) =>
        out.push(`  ${String(i + 1).padStart(2)}  ${x.key.padEnd(9)} ${x.title}`),
      );
      const dn = stories.filter((x) => x.status === 'done');
      const sk = stories.filter((x) => x.status === 'skipped');
      if (dn.length)
        out.push(`  Done: ${dn.map((x) => `${x.key || x.title} → ${x.value ?? '–'}`).join(' · ')}`);
      if (sk.length) out.push(`  Skipped: ${sk.map((x) => x.key || x.title).join(' · ')}`);
      process.stdout.write(`${out.join('\n')}\n`);
    }
    return done('Listed');
  }

  if (sub === 'add') {
    const text = rest.length === 1 && rest[0] === '-' ? readStdin() : rest.join(' ');
    const parsed = RoomModel.parseStories(text);
    if (!parsed.length)
      throw new CliError(
        EXIT.usage,
        'Nothing to add.',
        'Give a story, or pipe one per line with -.',
        'For example: hnch agenda add "PROJ-106 Audit log"   or   pbpaste | hnch agenda add -',
      );
    const added: Story[] = parsed.map((p, i) => ({
      id: `s-${Date.now()}-${i}`,
      key: p.key,
      title: p.title,
      status: 'queued',
    }));
    saveStories(room.code, [...stories, ...added]);
    const n = queued(stories).length;
    return done(
      `Added ${added.map(label).join(', ')} as ${added.length === 1 ? `story ${n + 1}` : `stories ${n + 1}–${n + added.length}`}`,
    );
  }

  const story = resolve(stories, rest[0], room, sub);
  if (sub === 'skip') {
    story.status = 'skipped';
    saveStories(room.code, stories);
    return done(`Skipped ${label(story)}`);
  }
  if (sub === 'cancel') {
    saveStories(
      room.code,
      stories.filter((x) => x !== story),
    );
    return done(`Cancelled ${label(story)}`);
  }
  // mv <story> <position>
  const q = queued(stories);
  const to = Number(rest[1]);
  if (!Number.isInteger(to) || to < 1 || to > q.length)
    throw new CliError(
      EXIT.usage,
      `Move ${story.key || story.title} where?`,
      `Give a position from 1 to ${q.length}.`,
      `For example: hnch agenda mv ${rest[0]} 1`,
    );
  if (story.status !== 'queued')
    throw new CliError(
      EXIT.usage,
      `${label(story)} isn't up next.`,
      'Only stories still to estimate can move.',
      `See them: hnch agenda list --room ${room.code}`,
    );
  const nextQ = q.filter((x) => x !== story);
  nextQ.splice(to - 1, 0, story);
  saveStories(room.code, [...stories.filter((x) => x.status !== 'queued'), ...nextQ]);
  return done(`Moved ${label(story)} to ${to} of ${q.length}`);
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}
