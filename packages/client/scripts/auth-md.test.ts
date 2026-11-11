import { pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  formatRoomCode,
  hashPassword,
  isValidRoomCode,
  JOIN_REJECTION_CLOSE_CODES,
  MAX_ROOM_PARTICIPANTS,
} from '@hnch/shared';
import { describe, expect, it } from 'vitest';

// src/auth.md restates access facts by hand for agents. These pin them to the
// code, so the file breaks a test before it misleads a client.

const AUTH_MD = readFileSync(resolve(import.meta.dirname, '../src/auth.md'), 'utf8');

describe('auth.md', () => {
  it('opens with an H1 naming auth.md, which is how agents and scanners recognise it', () => {
    expect(AUTH_MD.split('\n')[0]).toMatch(/^# .*auth\.md/u);
  });

  it('states the participant cap', () => {
    expect(AUTH_MD).toContain(`Up to ${MAX_ROOM_PARTICIPANTS} people per session`);
  });

  it('uses a valid example session code, in its displayed form too', () => {
    expect(isValidRoomCode('K7P9MR')).toBe(true);
    expect(AUTH_MD).toContain(`\`${formatRoomCode('K7P9MR')}\``);
  });

  it('states the close codes the relay sends a refused client', () => {
    for (const reason of ['wrong-password', 'room-full'] as const) {
      expect(AUTH_MD).toContain(`\`${JOIN_REJECTION_CLOSE_CODES[reason]}\` (\`${reason}\`)`);
    }
  });

  it('states a hash recipe that gives the hash the clients send', async () => {
    expect(AUTH_MD).toContain(
      'PBKDF2-SHA-256 over the password (Unicode NFC, surrounding whitespace removed), salt the session UUID from step 1 as UTF-8, 100000 iterations, 32 bytes, lowercase hex.',
    );
    const uuid = '3f2b8c1e-9d4a-4e7b-a6c5-0b1d2e3f4a5b';
    const typed = ' café ';
    const byRecipe = pbkdf2Sync(typed.trim().normalize('NFC'), uuid, 100_000, 32, 'sha256');
    expect(await hashPassword(typed, uuid)).toBe(byRecipe.toString('hex'));
  });
});
