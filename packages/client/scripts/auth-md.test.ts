import { pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashPassword, isValidRoomCode, JOIN_REJECTION_CLOSE_CODES } from '@hnch/shared';
import { describe, expect, it } from 'vitest';

// src/auth.md restates access facts by hand for agents. These pin them to the
// code, so the file breaks a test before it misleads a client.

const AUTH_MD = readFileSync(resolve(import.meta.dirname, '../src/auth.md'), 'utf8');

describe('auth.md', () => {
  it('opens with an H1 naming auth.md, which is how agents and scanners recognise it', () => {
    expect(AUTH_MD.split('\n')[0]).toMatch(/^# .*auth\.md/u);
  });

  it('is plain ASCII, since the assets serve it as text/markdown without a charset', () => {
    expect(AUTH_MD).toMatch(/^[\t\n\x20-\x7e]*$/u);
  });

  it('uses a valid example session code', () => {
    expect(AUTH_MD).toContain('K7P9MR');
    expect(isValidRoomCode('K7P9MR')).toBe(true);
  });

  it('states the close codes the relay sends a refused client', () => {
    for (const reason of ['wrong-password', 'room-full'] as const) {
      expect(AUTH_MD).toContain(`close \`${JOIN_REJECTION_CLOSE_CODES[reason]}\` (\`${reason}\`)`);
    }
  });

  it('states a hash recipe that gives the hash the clients send', async () => {
    expect(AUTH_MD).toContain(
      'PBKDF2-SHA-256 over the password (Unicode NFC, then whitespace and the zero-width characters U+200B to U+200D and U+2060 removed from both ends), salt the session UUID as UTF-8, 100000 iterations, 32 bytes, lowercase hex.',
    );
    const uuid = '3f2b8c1e-9d4a-4e7b-a6c5-0b1d2e3f4a5b';
    const typed = '\u200B cafe\u0301 \u2060';
    const stripped = typed
      .normalize('NFC')
      .replaceAll(/^[\s\u200B-\u200D\u2060]+|[\s\u200B-\u200D\u2060]+$/gu, '');
    expect(stripped).toBe('caf\u00E9');
    const byRecipe = pbkdf2Sync(stripped, uuid, 100_000, 32, 'sha256');
    expect(await hashPassword(typed, uuid)).toBe(byRecipe.toString('hex'));
  });
});
