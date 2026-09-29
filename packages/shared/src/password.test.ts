import { describe, it, expect } from 'vitest';
import { hashPassword, normalizePassword } from './password.js';

describe('normalizePassword', () => {
  it('drops the whitespace around a password', () => {
    expect(normalizePassword('  banana \n')).toBe('banana');
  });

  it('keeps the whitespace inside one', () => {
    expect(normalizePassword(' correct horse ')).toBe('correct horse');
  });

  it('is empty for whitespace alone', () => {
    expect(normalizePassword(' \t ')).toBe('');
  });
});

describe('hashPassword', () => {
  it('returns a 64-character hex string', async () => {
    const hash = await hashPassword('secret', 'room-uuid');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same inputs', async () => {
    const a = await hashPassword('secret', 'room-uuid');
    const b = await hashPassword('secret', 'room-uuid');
    expect(a).toBe(b);
  });

  it('produces different hashes for different passwords', async () => {
    const a = await hashPassword('alpha', 'room-uuid');
    const b = await hashPassword('bravo', 'room-uuid');
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different salts', async () => {
    const a = await hashPassword('secret', 'uuid-1');
    const b = await hashPassword('secret', 'uuid-2');
    expect(a).not.toBe(b);
  });

  // The host sets "banana"; a joiner's keyboard adds a space after the word.
  it('hashes a password the same with or without whitespace around it', async () => {
    const set = await hashPassword('banana', 'room-uuid');
    expect(await hashPassword('banana ', 'room-uuid')).toBe(set);
    expect(await hashPassword('  banana\n', 'room-uuid')).toBe(set);
  });

  it('still tells apart passwords that differ inside', async () => {
    const a = await hashPassword('correct horse', 'room-uuid');
    const b = await hashPassword('correcthorse', 'room-uuid');
    expect(a).not.toBe(b);
  });

  it('handles empty password', async () => {
    const hash = await hashPassword('', 'room-uuid');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles empty salt', async () => {
    const hash = await hashPassword('secret', '');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
