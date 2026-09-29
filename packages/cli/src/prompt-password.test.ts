/**
 * Unit tests for `promptPassword`'s two paths. Streams are injected so
 * neither path needs a real terminal:
 *  - TTY path uses a `PassThrough` stubbed with `isTTY` + `setRawMode`, which
 *    is enough for `readHidden` — the rest (`on`/`removeListener`/`resume`/
 *    `pause`/`setEncoding`) is the real stream implementation.
 *  - Non-TTY path uses a plain `PassThrough` (no `isTTY`), exercising the
 *    `readline`-based fallback used for piped input.
 */

import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { promptPassword } from './prompt-password.js';

function ttyStdin(): NodeJS.ReadStream & { setRawMode: ReturnType<typeof vi.fn> } {
  const stream = new PassThrough();
  const withTty = stream as unknown as NodeJS.ReadStream & {
    setRawMode: ReturnType<typeof vi.fn>;
  };
  Object.assign(withTty, { isTTY: true, setRawMode: vi.fn() });
  return withTty;
}

function fakeStderr(): NodeJS.WriteStream & { text: () => string } {
  const chunks: string[] = [];
  const write = vi.fn((chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  return Object.assign(
    { write },
    { text: () => chunks.join('') },
  ) as unknown as NodeJS.WriteStream & {
    text: () => string;
  };
}

/** Yield a macrotask, letting a synchronous stream write's 'data' land. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('promptPassword — TTY path', () => {
  it('does not echo typed characters, and Enter resolves with what was typed', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    stdin.write('s3c\r');

    await expect(result).resolves.toBe('s3c');
    // Exactly the prompt text plus the post-Enter newline — nothing typed.
    expect(stderr.text()).toBe('Password: \n');
  });

  it('Backspace removes the last character', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    stdin.write('ab\x7fc\r'); // a, b, <backspace>, c, Enter → "ac"

    await expect(result).resolves.toBe('ac');
  });

  it('puts raw mode on while reading and restores it afterwards', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    await flush();
    expect(stdin.listenerCount('data')).toBe(1);
    stdin.write('x\r');
    await result;

    expect(stdin.setRawMode).toHaveBeenNthCalledWith(1, true);
    expect(stdin.setRawMode).toHaveBeenNthCalledWith(2, false);
    // Whoever reads the terminal next — the session UI — reads it alone
    expect(stdin.listenerCount('data')).toBe(0);
    expect(stdin.isPaused()).toBe(true);
  });

  it('Ctrl+C exits with code 130 and restores the terminal first', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();
    const exit = vi.fn();

    void promptPassword({ stdin, stderr, exit: exit as unknown as (code: number) => never });
    stdin.write('ab\x03'); // typed characters, then Ctrl+C — never resolves
    await flush();

    expect(exit).toHaveBeenCalledExactlyOnceWith(130);
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
    // First: a process that ends in raw mode leaves a terminal that does not echo
    const restored = stdin.setRawMode.mock.invocationCallOrder.at(-1)!;
    expect(restored).toBeLessThan(exit.mock.invocationCallOrder[0]!);
    expect(stdin.listenerCount('data')).toBe(0);
    // Nothing typed was echoed here either.
    expect(stderr.text()).toBe('Password: \n');
  });

  it('types nothing more after Ctrl+C, whatever came with it', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();
    const exit = vi.fn();
    let settled = false;

    void promptPassword({
      stdin,
      stderr,
      exit: exit as unknown as (code: number) => never,
    }).then(() => {
      settled = true;
    });
    stdin.write('ab\x03cd\r');
    await flush();

    expect(exit).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
  });

  it('Ctrl+D mid-input is a no-op — typing continues', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    stdin.write('ab\x04c\r'); // Ctrl+D after "ab" is ignored — not the empty line it needs to be

    await expect(result).resolves.toBe('abc');
  });

  it('Ctrl+D on an empty line ends input with whatever was typed so far (nothing)', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    stdin.write('\x04');

    await expect(result).resolves.toBe('');
  });

  // Over a slow link, or with a key held down, what was typed arrives in
  // one piece.
  it('tells a key that types nothing from the characters it arrived with', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    // x, arrow left, a, b, F1, c, Alt+z, d, Enter
    stdin.write('x\x1b[Dab\x1bOPc\x1bzd\r');

    await expect(result).resolves.toBe('xabcd');
  });

  it('does not take the next key for the rest of an Escape', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    stdin.write('a');
    await flush();
    stdin.write('\x1b'); // the Escape key, by itself
    await flush();
    stdin.write('b\r');

    await expect(result).resolves.toBe('ab');
  });

  // With nothing on screen, starting over is the one way to be sure.
  it('Ctrl+U starts over', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    stdin.write('wrong\x15right\r');

    await expect(result).resolves.toBe('right');
  });

  it('Ctrl+W takes the last word back', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    stdin.write('correct horse\x17battery\r');

    await expect(result).resolves.toBe('correct battery');
  });

  // The app keeps a tab that is pasted into a password. The same password
  // has to be the same password here.
  it('keeps a tab inside the password', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    stdin.write('a\tb\r');

    await expect(result).resolves.toBe('a\tb');
  });

  // An arrow key shows nothing on screen. In the password it would be three
  // characters nobody knows they typed.
  it('leaves keys that type nothing out of the password', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    stdin.write('ab');
    await flush();
    stdin.write('\x1b[D'); // arrow left
    await flush();
    stdin.write('\x1b[3~'); // delete
    await flush();
    stdin.write('c\x01'); // c, ctrl+a
    await flush();
    stdin.write('\r');

    await expect(result).resolves.toBe('abc');
  });

  it('Backspace removes a whole character, not half of an emoji', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    stdin.write('a\u{1F600}');
    await flush();
    stdin.write('\x7f');
    await flush();
    stdin.write('b\r');

    await expect(result).resolves.toBe('ab');
  });

  it('normalizes the resolved password (trims surrounding whitespace)', async () => {
    const stdin = ttyStdin();
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    stdin.write('  hi  \r');

    await expect(result).resolves.toBe('hi');
  });
});

describe('promptPassword — non-TTY path, input that ends', () => {
  // `printf %s "$PW" | hnch create --password`: no newline at the end.
  it('takes a last line that has no newline', async () => {
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    (stdin as unknown as PassThrough).end('secret');

    await expect(result).resolves.toBe('secret');
  });

  // `hnch create --password </dev/null`. It used to wait for a line that
  // could not come, and the process ended without a word.
  it('answers with nothing when there is nothing', async () => {
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    (stdin as unknown as PassThrough).end();

    await expect(result).resolves.toBe('');
  });

  it('takes the first line of several', async () => {
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    (stdin as unknown as PassThrough).end('first\nsecond\n');

    await expect(result).resolves.toBe('first');
  });
});

describe('promptPassword — non-TTY path', () => {
  it('reads one line without entering raw mode', async () => {
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream; // isTTY left unset
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    stdin.write('piped-secret\n');

    await expect(result).resolves.toBe('piped-secret');
  });

  it('still prompts on stderr and returns the normalized value', async () => {
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
    const stderr = fakeStderr();

    const result = promptPassword({ stdin, stderr });
    stdin.write('  spaced  \n');

    await expect(result).resolves.toBe('spaced');
    expect(stderr.text()).toBe('Password: ');
  });
});
