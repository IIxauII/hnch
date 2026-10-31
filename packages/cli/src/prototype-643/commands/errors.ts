/**
 * PROTOTYPE (#643). One exit-code table and one error formatter (UX-091).
 * Every error is three parts: what happened, why, what to do next. Errors go to stderr.
 */

export const EXIT = {
  ok: 0,
  runtime: 1,
  usage: 2,
  notFound: 3,
  wrongPassword: 4,
  removed: 5,
  relayDown: 6,
  interrupted: 130,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** Shown by `hnch help exit-codes` and at the end of `hnch -h`. */
export const EXIT_TABLE: { code: ExitCode; meaning: string }[] = [
  { code: EXIT.ok, meaning: 'ok (you quit, left, or the session ended)' },
  { code: EXIT.runtime, meaning: 'something else went wrong (room full, file unreadable mid-run)' },
  { code: EXIT.usage, meaning: 'usage: bad flag, bad code, missing terminal or password input' },
  { code: EXIT.notFound, meaning: 'room not found or expired' },
  { code: EXIT.wrongPassword, meaning: 'wrong password, 3 tries used' },
  { code: EXIT.removed, meaning: 'the host removed you from the room' },
  { code: EXIT.relayDown, meaning: 'relay unreachable: nothing was created or joined' },
  { code: EXIT.interrupted, meaning: 'interrupted (Ctrl+C)' },
];

export class CliError extends Error {
  constructor(
    readonly code: ExitCode,
    readonly what: string,
    readonly why: string,
    readonly next: string,
  ) {
    super(what);
  }
}

export interface Glyphs {
  ok: string;
  fail: string;
  warn: string;
  dot: string;
  sel: string;
}

export function glyphs(ascii: boolean): Glyphs {
  return ascii
    ? { ok: '+', fail: 'x', warn: '!', dot: '*', sel: '>' }
    : { ok: '✓', fail: '✗', warn: '!', dot: '●', sel: '▸' };
}

/** Red only as an accent; the glyph and the words carry the meaning (UX-100). */
export function formatError(e: CliError, opts: { color: boolean; ascii: boolean }): string {
  const g = glyphs(opts.ascii);
  const head = opts.color ? `\x1b[31m${g.fail}\x1b[39m` : g.fail;
  return [`${head} ${e.what}`, `  ${e.why}`, `  ${e.next}`].join('\n');
}

export function warnLine(text: string, opts: { color: boolean; ascii: boolean }): string {
  const g = glyphs(opts.ascii);
  const head = opts.color ? `\x1b[33m${g.warn}\x1b[39m` : g.warn;
  return `${head} ${text}`;
}

export function okLine(text: string, opts: { color: boolean; ascii: boolean }): string {
  const g = glyphs(opts.ascii);
  const head = opts.color ? `\x1b[32m${g.ok}\x1b[39m` : g.ok;
  return `${head} ${text}`;
}
