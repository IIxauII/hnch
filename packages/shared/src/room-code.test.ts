import { describe, it, expect } from 'vitest';
import {
  generateRoomCode,
  normalizeRoomCode,
  isValidRoomCode,
  formatRoomCode,
  parseInviteContent,
} from './room-code.js';

describe('room code alphabet', () => {
  it('never contains look-alike characters (0/O/1/I/L)', () => {
    // Statistical check: sample 1,000 codes and verify no look-alikes appear.
    // Pool is 31 characters; 1k samples × 6 chars = 6,000 chars, so any
    // accidental inclusion would appear with overwhelming probability.
    const joined = Array.from({ length: 1000 }, () => generateRoomCode()).join('');
    for (const ch of '0O1IL') {
      expect(joined.includes(ch)).toBe(false);
    }
  });
});

describe('generateRoomCode', () => {
  it('produces 6-character codes', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateRoomCode()).toHaveLength(6);
    }
  });

  it('produces codes that pass isValidRoomCode', () => {
    for (let i = 0; i < 100; i++) {
      expect(isValidRoomCode(generateRoomCode())).toBe(true);
    }
  });
});

describe('normalizeRoomCode', () => {
  it('strips dashes', () => {
    expect(normalizeRoomCode('K7P-9MR')).toBe('K7P9MR');
    expect(normalizeRoomCode('k-7-p-9-m-r')).toBe('K7P9MR');
  });

  it('uppercases', () => {
    expect(normalizeRoomCode('k7p9mr')).toBe('K7P9MR');
  });

  it('handles already-normalized input idempotently', () => {
    expect(normalizeRoomCode('K7P9MR')).toBe('K7P9MR');
  });

  it('baseline: uppercase only', () => {
    expect(normalizeRoomCode('k7p9mr')).toBe('K7P9MR');
  });

  it('dash strip preserved', () => {
    expect(normalizeRoomCode('k7p-9mr')).toBe('K7P9MR');
  });

  it('trim only', () => {
    expect(normalizeRoomCode('  k7p9mr  ')).toBe('K7P9MR');
  });

  it('trim + dash', () => {
    expect(normalizeRoomCode('  k7p-9mr  ')).toBe('K7P9MR');
  });

  it('all-whitespace returns empty', () => {
    expect(normalizeRoomCode('   ')).toBe('');
  });

  it('empty stays empty', () => {
    expect(normalizeRoomCode('')).toBe('');
  });

  it('embedded space preserved, only outer whitespace trimmed', () => {
    expect(normalizeRoomCode('k7p 9mr')).toBe('K7P 9MR');
  });
});

describe('isValidRoomCode', () => {
  it('accepts valid codes', () => {
    expect(isValidRoomCode('K7P9MR')).toBe(true);
    expect(isValidRoomCode('A2B3C4')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidRoomCode('K7P9M')).toBe(false);
    expect(isValidRoomCode('K7P9MRR')).toBe(false);
    expect(isValidRoomCode('')).toBe(false);
  });

  it('rejects look-alike characters', () => {
    expect(isValidRoomCode('K0P9MR')).toBe(false); // 0
    expect(isValidRoomCode('KOP9MR')).toBe(false); // O
    expect(isValidRoomCode('K1P9MR')).toBe(false); // 1
    expect(isValidRoomCode('KIP9MR')).toBe(false); // I
    expect(isValidRoomCode('KLP9MR')).toBe(false); // L
  });

  it('rejects lowercase (caller must normalize first)', () => {
    expect(isValidRoomCode('k7p9mr')).toBe(false);
  });

  it('rejects dashes (caller must normalize first)', () => {
    expect(isValidRoomCode('K7P-9MR')).toBe(false);
  });
});

describe('formatRoomCode', () => {
  it('inserts a dash between the first and last three chars by default', () => {
    expect(formatRoomCode('K7P9MR')).toBe('K7P-9MR');
  });

  it('can omit the dash', () => {
    expect(formatRoomCode('K7P9MR', false)).toBe('K7P9MR');
  });

  it('normalizes input first', () => {
    expect(formatRoomCode('k7p-9mr')).toBe('K7P-9MR');
  });

  it('passes through shorter input without dashing (safe on partial input)', () => {
    expect(formatRoomCode('K7P')).toBe('K7P');
  });
});

describe('parseInviteContent', () => {
  it('extracts code from a valid invite URL', () => {
    expect(parseInviteContent('https://hnch.app/join?code=K7P9MR')).toBe('K7P9MR');
  });

  it('extracts code from a localhost invite URL', () => {
    expect(parseInviteContent('http://localhost:4200/join?code=K7P9MR')).toBe('K7P9MR');
  });

  it('normalizes the code from a URL', () => {
    expect(parseInviteContent('https://hnch.app/join?code=k7p9mr')).toBe('K7P9MR');
  });

  it('returns null for a URL with missing code param', () => {
    expect(parseInviteContent('https://hnch.app/join')).toBeNull();
  });

  it('returns null for a URL with an invalid code', () => {
    expect(parseInviteContent('https://hnch.app/join?code=BADCODE')).toBeNull();
  });

  it('accepts a bare valid code', () => {
    expect(parseInviteContent('K7P9MR')).toBe('K7P9MR');
  });

  it('accepts a bare code with dash', () => {
    expect(parseInviteContent('K7P-9MR')).toBe('K7P9MR');
  });

  it('accepts a bare lowercase code', () => {
    expect(parseInviteContent('k7p9mr')).toBe('K7P9MR');
  });

  it('returns null for an arbitrary string', () => {
    expect(parseInviteContent('hello world')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseInviteContent('')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(parseInviteContent('  K7P9MR  ')).toBe('K7P9MR');
  });
});
