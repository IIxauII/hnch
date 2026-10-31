/**
 * PROTOTYPE (#643). A small argv parser, so flag errors, exit codes and help
 * text are exactly what the plan's §6.5 says (UX-090, UX-091).
 */
import { CliError, EXIT } from './errors.js';

/** Flags that take a value. `--stories -` keeps the dash as the value. */
const VALUE_FLAGS = new Set([
  'name',
  'stories',
  'as',
  'fixture',
  'simulate',
  'room',
  'color',
  'scale',
  'relay-url',
]);

const BOOL_FLAGS = new Set([
  'help',
  'version',
  'json',
  'plain',
  'screen-reader',
  'no-color',
  'password',
  'password-stdin',
  'watch',
  'global',
  'list',
]);

const SHORT: Record<string, string> = { h: 'help', v: 'version', V: 'version' };

export interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | true>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (VALUE_FLAGS.has(name)) {
        const value = eq > 0 ? a.slice(eq + 1) : argv[++i];
        if (value === undefined || (value.startsWith('--') && value.length > 2))
          throw new CliError(
            EXIT.usage,
            `--${name} needs a value.`,
            `For example: --${name} ${example(name)}`,
            'See the options: hnch -h',
          );
        flags.set(name, value);
      } else if (BOOL_FLAGS.has(name)) {
        flags.set(name, true);
      } else {
        throw new CliError(
          EXIT.usage,
          `Unknown option --${name}.`,
          "hnch doesn't have that option.",
          'See the options: hnch -h',
        );
      }
      continue;
    }
    if (a.startsWith('-') && a.length > 1 && a !== '-') {
      for (const ch of a.slice(1)) {
        const long = SHORT[ch];
        if (!long)
          throw new CliError(
            EXIT.usage,
            `Unknown option -${ch}.`,
            'Short options are -h (help) and -v (version).',
            'See the options: hnch -h',
          );
        flags.set(long, true);
      }
      continue;
    }
    positionals.push(a);
  }
  return { positionals, flags };
}

function example(name: string): string {
  switch (name) {
    case 'stories':
      return 'backlog.txt   (or - to read stdin)';
    case 'as':
      return 'ana';
    case 'fixture':
      return 'voting-partial';
    case 'simulate':
      return 'relay-down';
    case 'room':
      return 'K7P-9MR';
    case 'name':
      return '"Sprint 42"';
    default:
      return '<value>';
  }
}

export function str(a: ParsedArgs, name: string): string | undefined {
  const v = a.flags.get(name);
  return typeof v === 'string' ? v : undefined;
}

export function bool(a: ParsedArgs, name: string): boolean {
  return a.flags.has(name);
}

/** Reject flags that a command does not take, before any prompt or network work (UX-091). */
export function allowOnly(a: ParsedArgs, cmd: string, allowed: string[]): void {
  const ok = new Set([
    ...allowed,
    'help',
    'json',
    'plain',
    'screen-reader',
    'no-color',
    'as',
    'fixture',
    'simulate',
  ]);
  for (const k of a.flags.keys()) {
    if (!ok.has(k))
      throw new CliError(
        EXIT.usage,
        `hnch ${cmd} doesn't take --${k}.`,
        `That option belongs to another command.`,
        `See what ${cmd} takes: hnch ${cmd} -h`,
      );
  }
}

// ── Display options (UX-100, UX-104) ───────────────────────────────────────

export interface DisplayOpts {
  plain: boolean;
  color: boolean;
  ascii: boolean;
}

/**
 * Colour precedence (R-49): --no-color > NO_COLOR > FORCE_COLOR=0 > TERM=dumb > TTY.
 * NO_COLOR is a theme switch: colour goes, inverse and bold stay (the TUI decides).
 */
export function displayOpts(a: ParsedArgs, env = process.env): DisplayOpts {
  const plain = bool(a, 'plain') || bool(a, 'screen-reader');
  let color = Boolean(process.stdout.isTTY);
  if (env['TERM'] === 'dumb') color = false;
  if (env['FORCE_COLOR'] !== undefined) color = env['FORCE_COLOR'] !== '0';
  if (env['NO_COLOR'] !== undefined && env['NO_COLOR'] !== '') color = false;
  if (bool(a, 'no-color')) color = false;
  const ascii = env['HNCH_ASCII'] === '1' || env['TERM'] === 'linux';
  return { plain, color, ascii };
}
