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

  it('drops every kind of whitespace, as trim() does', () => {
    // No-break space, ideographic space, byte-order mark.
    expect(normalizePassword('\u00A0\u3000\uFEFFbanana\uFEFF\u3000\u00A0')).toBe('banana');
  });

  // What comes along with text copied out of a chat.
  it('drops the characters around it that take up no room', () => {
    expect(normalizePassword('\u200Bbanana\u200B')).toBe('banana');
    expect(normalizePassword('\u2060 \u200C banana \u200D\u2060')).toBe('banana');
  });

  it('is empty for nothing but those', () => {
    expect(normalizePassword('\u200B\u200C \u200D\u2060')).toBe('');
  });

  // A joiner inside an emoji is part of the emoji.
  it('leaves them alone inside the password', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    expect(normalizePassword(` ${family} `)).toBe(family);
    expect(normalizePassword('ba\u200Bnana')).toBe('ba\u200Bnana');
  });

  it('makes one password of the two ways to write an accented letter', () => {
    const composed = 'caf\u00E9';
    const decomposed = 'cafe\u0301';
    expect(decomposed).not.toBe(composed);
    expect(normalizePassword(decomposed)).toBe(composed);
    expect(normalizePassword(composed)).toBe(composed);
  });

  // NFKC would: a password is not a search term.
  it('does not fold together what only looks alike', () => {
    expect(normalizePassword('\uFF21')).toBe('\uFF21'); // fullwidth A
    expect(normalizePassword('\u2460')).toBe('\u2460'); // circled 1
    expect(normalizePassword('Banana')).toBe('Banana');
  });
});

describe('hashPassword', () => {
  it('hashes the two ways to write an accented letter alike', async () => {
    const composed = await hashPassword('caf\u00E9', 'room-uuid');
    const decomposed = await hashPassword('cafe\u0301', 'room-uuid');
    expect(decomposed).toBe(composed);
  });

  it('hashes a password pasted with invisible characters around it like the typed one', async () => {
    const typed = await hashPassword('banana', 'room-uuid');
    const pasted = await hashPassword('\u200Bbanana\u2060 ', 'room-uuid');
    expect(pasted).toBe(typed);
  });

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
