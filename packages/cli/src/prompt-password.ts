/**
 * Ask for a password without echoing what is typed — the one thing
 * `readline`'s `question()` cannot do: it writes every keystroke straight
 * back to the output, into scrollback and into any screen share watching
 * the terminal.
 *
 * TTY path: raw mode, no echo. This module reads one keystroke at a time
 * and owns just enough line editing for a password — typed characters,
 * Backspace, Enter, Ctrl+C, Ctrl+D — instead of leaving it to the
 * terminal's own line discipline, which is exactly what echoes.
 *
 * Non-TTY path: piped input (scripts, and this module's own tests) has no
 * terminal to keep quiet for and no raw mode to enter, so it falls back to
 * a single `readline` line read — the old inline prompt's behavior.
 *
 * Streams (and the process-exit hook) are injectable so both paths are
 * unit-testable without a real terminal. What comes back is normalized
 * (`normalizePassword`), same contract as the prompt this replaces.
 */

import { createInterface } from 'node:readline';
import { normalizePassword } from '@hnch/shared';

export interface PromptPasswordOptions {
  readonly stdin?: NodeJS.ReadStream | undefined;
  readonly stderr?: NodeJS.WriteStream | undefined;
  readonly exit?: ((code: number) => never) | undefined;
}

/** Narrowed for the TTY path: `setRawMode` is real, not the optional stub. */
type TtyStdin = NodeJS.ReadStream & {
  readonly isTTY: true;
  setRawMode(mode: boolean): unknown;
};

function isTtyStdin(stdin: NodeJS.ReadStream): stdin is TtyStdin {
  return stdin.isTTY === true && typeof stdin.setRawMode === 'function';
}

const ENTER = '\r';
const NEWLINE = '\n';
const BACKSPACE = '\x7f';
const BACKSPACE_ALT = '\b';
const TAB = '\t';
const CTRL_C = '\x03';
const CTRL_D = '\x04';
const CTRL_U = '\x15';
const CTRL_W = '\x17';
const ESCAPE = '\x1b';

/** Keys that type nothing: the control characters. A tab is a character. */
function isControl(char: string): boolean {
  return char < ' ' && char !== TAB;
}

/**
 * How many characters of `chars`, from `at` on, belong to the escape
 * sequence that begins there: an arrow key, Home, F5, Alt+x. Nothing on
 * screen says that one was pressed, so it must not end up in the password.
 *
 * - `ESC [ … final` (CSI): parameters, then one character from `@` to `~`
 * - `ESC O x` (SS3): the keypad and F1–F4
 * - `ESC x`: Alt+x
 * - `ESC` alone: the Escape key
 *
 * A sequence is taken to end with the chunk it arrived in. A terminal sends
 * one in a single write; to wait for the rest of one that is cut short would
 * be to swallow whatever is typed next.
 */
function escapeSequenceLength(chars: readonly string[], at: number): number {
  const next = chars[at + 1];
  if (next === undefined) return 1;
  if (next === 'O') return Math.min(3, chars.length - at);
  if (next !== '[') return 2;
  for (let i = at + 2; i < chars.length; i++) {
    const char = chars[i]!;
    if (char >= '@' && char <= '~') return i - at + 1;
  }
  return chars.length - at;
}

export async function promptPassword(options: PromptPasswordOptions = {}): Promise<string> {
  const stdin = options.stdin ?? process.stdin;
  const stderr = options.stderr ?? process.stderr;
  const exit = options.exit ?? process.exit;

  stderr.write('Password: ');

  const raw = isTtyStdin(stdin) ? await readHidden(stdin, stderr, exit) : await readLine(stdin);

  return normalizePassword(raw);
}

/**
 * Non-TTY path: one line, no raw mode. Input that ends without a line —
 * nothing piped in at all — is an empty answer, not a wait without end:
 * `question()` would never call back, and the process would end without a
 * word once there was nothing left to wait for.
 */
function readLine(stdin: NodeJS.ReadStream): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin });
    let answered = false;
    const answer = (line: string): void => {
      if (answered) return;
      answered = true;
      rl.close();
      resolve(line);
    };
    rl.once('line', answer);
    rl.once('close', () => answer(''));
  });
}

/**
 * TTY path. Resolves on Enter or on Ctrl+D against an empty line (both
 * "done, here's what was typed" — possibly nothing); calls `exit(130)` on
 * Ctrl+C, after restoring the terminal, without ever resolving.
 *
 * Ctrl+U clears what was typed and Ctrl+W the last word of it, as in every
 * other password prompt: with nothing on screen, starting over is the one
 * way to be sure of what is in there.
 */
function readHidden(
  stdin: TtyStdin,
  stderr: NodeJS.WriteStream,
  exit: (code: number) => never,
): Promise<string> {
  return new Promise((resolve) => {
    let buffer = '';
    // Set by whatever ends the prompt. What arrived in the same chunk after
    // it is not read any more.
    let over = false;

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const cleanup = (): void => {
      over = true;
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (chunk: string): void => {
      const chars = Array.from(chunk);
      for (let i = 0; i < chars.length; i++) {
        if (over) break;
        const char = chars[i]!;
        if (char === CTRL_C) {
          cleanup();
          stderr.write('\n');
          exit(130);
        }
        if (char === ENTER || char === NEWLINE) {
          cleanup();
          stderr.write('\n');
          resolve(buffer);
          return;
        }
        if (char === CTRL_D) {
          if (buffer.length === 0) {
            cleanup();
            stderr.write('\n');
            resolve(buffer);
            return;
          }
          continue; // Ctrl+D mid-input is a no-op, matching canonical tty behavior.
        }
        if (char === ESCAPE) {
          i += escapeSequenceLength(chars, i) - 1;
          continue;
        }
        if (char === BACKSPACE || char === BACKSPACE_ALT) {
          // One character as it was typed, not half of an emoji.
          buffer = Array.from(buffer).slice(0, -1).join('');
          continue;
        }
        if (char === CTRL_U) {
          buffer = '';
          continue;
        }
        if (char === CTRL_W) {
          buffer = buffer.replace(/\S*\s*$/u, '');
          continue;
        }
        if (isControl(char)) continue;
        buffer += char;
      }
    };

    stdin.on('data', onData);
  });
}
