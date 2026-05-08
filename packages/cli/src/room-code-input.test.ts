import { describe, it, expect } from 'vitest';
import { normalizeAndValidateRoomCode } from './room-code-input.js';

describe('normalizeAndValidateRoomCode', () => {
  it('returns null for whitespace-only input', () => {
    expect(normalizeAndValidateRoomCode('   ')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeAndValidateRoomCode('')).toBeNull();
  });

  it('trims, strips dashes, uppercases valid code', () => {
    expect(normalizeAndValidateRoomCode('  k7p-9mr  ')).toBe('K7P9MR');
  });

  it('passes through already-normalized code', () => {
    expect(normalizeAndValidateRoomCode('K7P9MR')).toBe('K7P9MR');
  });
});
