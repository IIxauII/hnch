/**
 * PROTOTYPE (#643). Room-code input (code or invite link, UX-090 / UX-026 CLI side),
 * prototype identity and fixture flags, and the in-memory RoomModel factory.
 */
import { RoomModel, type FixtureName } from '../room-model.js';
import { bool, str, type ParsedArgs } from './args.js';
import { CliError, EXIT } from './errors.js';
import { savedStories } from './store.js';

const FIXTURES = [
  'host-alone',
  'waiting',
  'waiting-empty-queue',
  'voting-fresh',
  'voting-partial',
  'voting-all-in',
  'revealed-close',
  'revealed-split',
  'revealed-agreed',
  'revealed-one',
  'revealed-none',
  'revote',
  'queue-done',
  'ended',
] as const satisfies readonly FixtureName[];
// compile-time check that the list covers every fixture in room-model.ts
const _allFixtures: Exclude<FixtureName, (typeof FIXTURES)[number]> extends never ? true : never =
  true;
void _allFixtures;

export const PEOPLE = { hana: 'host', ana: 'voter', eve: 'viewer' } as const;
export type Who = keyof typeof PEOPLE;

export function whoFlag(a: ParsedArgs, dflt: Who): Who {
  const v = str(a, 'as');
  if (v === undefined) return dflt;
  if (v in PEOPLE) return v as Who;
  throw new CliError(
    EXIT.usage,
    `--as ${v} isn't one of the prototype people.`,
    'Pick hana (host), ana (voter) or eve (viewer).',
    'For example: pnpm proto:643:cli join K7P-9MR --as eve',
  );
}

export function fixtureFlag(a: ParsedArgs, dflt: FixtureName): FixtureName {
  const v = str(a, 'fixture');
  if (v === undefined) return dflt;
  if ((FIXTURES as readonly string[]).includes(v)) return v as FixtureName;
  throw new CliError(
    EXIT.usage,
    `--fixture ${v} doesn't exist.`,
    `Fixtures: ${FIXTURES.join(', ')}.`,
    'For example: pnpm proto:643:cli resume K7P-9MR --fixture revealed-close',
  );
}

export const SIMULATIONS = [
  'relay-down',
  'room-full',
  'quit',
  'leave',
  'ended',
  'removed',
  'interrupted',
] as const;
export type Simulation = (typeof SIMULATIONS)[number];

export function simulateFlag(a: ParsedArgs): Simulation | undefined {
  const v = str(a, 'simulate');
  if (v === undefined) return undefined;
  if ((SIMULATIONS as readonly string[]).includes(v)) return v as Simulation;
  throw new CliError(
    EXIT.usage,
    `--simulate ${v} isn't a simulation.`,
    `Simulations: ${SIMULATIONS.join(', ')}.`,
    'For example: pnpm proto:643:cli create --simulate relay-down',
  );
}

// ── Code or link (only the code is used; ADR-0053 / CP-9) ─────────────────

const CODE_CHARS = /^[A-Z0-9]{6}$/u;

export interface ParsedCode {
  code: string; // 'K7P-9MR'
  /** The link's origin when it differs from the relay in use: warn, never follow it. */
  foreignOrigin?: string | undefined;
}

export function parseCodeOrLink(raw: string, relayUrl: string): ParsedCode {
  const input = raw.trim();
  let candidate = input;
  let origin: string | undefined;
  if (/^(https?:\/\/|[a-z0-9.-]+\.[a-z]{2,}\/)/iu.test(input)) {
    try {
      const url = new URL(/^https?:/iu.test(input) ? input : `https://${input}`);
      origin = url.origin;
      candidate = url.searchParams.get('code') ?? url.pathname.split('/').findLast(Boolean) ?? '';
    } catch {
      candidate = '';
    }
  }
  const compact = candidate.replace(/[\s-]/gu, '').toUpperCase();
  if (!CODE_CHARS.test(compact))
    throw new CliError(
      EXIT.usage,
      `"${raw}" isn't a room code or invite link.`,
      'A code is 6 letters or digits, like K7P-9MR; a link looks like https://hnch.dev/join?code=K7P9MR.',
      'Try: hnch join K7P-9MR',
    );
  const code = `${compact.slice(0, 3)}-${compact.slice(3)}`;
  const relayOrigin = new URL(relayUrl).origin;
  return { code, foreignOrigin: origin && origin !== relayOrigin ? origin : undefined };
}

/** `hnch K7P9MR` and `hnch https://…` are a join (UX-090: today both are "Unknown argument"). */
export function looksLikeCodeOrLink(s: string): boolean {
  return /^[A-Za-z0-9]{3}-?[A-Za-z0-9]{3}$/u.test(s) || /^https?:\/\//iu.test(s);
}

// ── Model ──────────────────────────────────────────────────────────────────

export function makeModel(opts: {
  fixture: FixtureName;
  who: Who;
  code: string;
  roomName: string;
  password: boolean;
  watch?: boolean;
}): RoomModel {
  const m = new RoomModel(opts.fixture, opts.who);
  m.state.code = opts.code;
  m.state.name = opts.roomName;
  m.state.password = opts.password;
  // stories edited by `hnch agenda` / `create --stories` show up in the waiting fixtures
  const saved = savedStories(opts.code);
  if (saved && (opts.fixture === 'waiting' || opts.fixture === 'host-alone'))
    m.state.stories = saved;
  if (opts.watch) m.setRole('viewer');
  return m;
}

export function webUrl(code: string): string {
  return `https://hnch.dev/join?code=${code.replace('-', '')}`;
}

export function watchFlag(a: ParsedArgs): boolean {
  return bool(a, 'watch');
}
