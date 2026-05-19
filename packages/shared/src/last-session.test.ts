import { describe, expect, it } from 'vitest';
import {
  LAST_SESSION_MAX_ENTRIES,
  LAST_SESSION_TTL_MS,
  migrateLastSessionCache,
  pruneLastSessionEntries,
} from './last-session.js';

const NOW = 1_700_000_000_000;

describe('constants', () => {
  it('LAST_SESSION_TTL_MS equals 24 h', () => {
    expect(LAST_SESSION_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('LAST_SESSION_MAX_ENTRIES equals 5', () => {
    expect(LAST_SESSION_MAX_ENTRIES).toBe(5);
  });
});

describe('migrateLastSessionCache', () => {
  describe('v1 → v2', () => {
    it('wraps single entry keyed by roomUuid, preserves lastSeenAt', () => {
      const result = migrateLastSessionCache({
        roomCode: 'ABC123',
        roomUuid: 'uuid-1',
        lastSeenAt: NOW,
      });

      expect(result.version).toBe(2);
      expect(result.entries['uuid-1']).toMatchObject({
        roomCode: 'ABC123',
        roomUuid: 'uuid-1',
        lastSeenAt: NOW,
      });
    });

    it('folds top-level passwordHash onto entry (CLI v1 shape)', () => {
      const result = migrateLastSessionCache({
        roomCode: 'ABC123',
        roomUuid: 'uuid-1',
        lastSeenAt: NOW,
        passwordHash: 'deadbeef',
      });

      expect(result.entries['uuid-1']?.passwordHash).toBe('deadbeef');
    });

    it('drops lastScreen field (mobile v1 shape — shared migration does not propagate it)', () => {
      const result = migrateLastSessionCache({
        roomCode: 'ABC123',
        roomUuid: 'uuid-1',
        lastSeenAt: NOW,
        lastScreen: 'estimating',
      });

      expect('lastScreen' in (result.entries['uuid-1'] ?? {})).toBe(false);
    });
  });

  describe('v2 round-trip', () => {
    it('returns v2 object as-is when structurally valid', () => {
      const input = {
        version: 2 as const,
        entries: {
          'uuid-1': { roomCode: 'ABC123', roomUuid: 'uuid-1', lastSeenAt: NOW },
          'uuid-2': {
            roomCode: 'DEF456',
            roomUuid: 'uuid-2',
            lastSeenAt: NOW - 1000,
            passwordHash: 'cafebabe',
          },
        },
      };

      const result = migrateLastSessionCache(input);

      expect(result.version).toBe(2);
      expect(Object.keys(result.entries)).toHaveLength(2);
      expect(result.entries['uuid-1']).toMatchObject(input.entries['uuid-1']);
      expect(result.entries['uuid-2']).toMatchObject(input.entries['uuid-2']);
    });

    it('drops structurally-bad entries, preserves valid ones', () => {
      const result = migrateLastSessionCache({
        version: 2,
        entries: {
          'uuid-good': {
            roomCode: 'ABC123',
            roomUuid: 'uuid-good',
            lastSeenAt: NOW,
          },
          'uuid-bad': { roomCode: 123, roomUuid: null, lastSeenAt: 'oops' },
          'uuid-missing-fields': { something: 'else' },
        },
      });

      expect(Object.keys(result.entries)).toEqual(['uuid-good']);
    });
  });

  describe('junk inputs → empty v2', () => {
    it.each([
      ['null', null],
      ['string', 'some-string'],
      ['number', 42],
      ['array', [1, 2, 3]],
      ['missing version', { roomCode: undefined, roomUuid: undefined }],
      ['wrong version type', { version: '2', entries: {} }],
      ['entries is not object', { version: 2, entries: 'bad' }],
      ['entries is array', { version: 2, entries: [] }],
    ])('%s', (_label, input) => {
      const result = migrateLastSessionCache(input);
      expect(result).toEqual({ version: 2, entries: {} });
    });
  });
});

describe('pruneLastSessionEntries', () => {
  const TTL = LAST_SESSION_TTL_MS;

  function makeCache(overrides: Record<string, { lastSeenAt: number; passwordHash?: string }>) {
    const entries: Record<
      string,
      { roomCode: string; roomUuid: string; lastSeenAt: number; passwordHash?: string }
    > = {};
    for (const [uuid, fields] of Object.entries(overrides)) {
      entries[uuid] = { roomCode: 'CODE', roomUuid: uuid, ...fields };
    }
    return { version: 2 as const, entries };
  }

  it('removes entries past TTL', () => {
    const cache = makeCache({
      old: { lastSeenAt: NOW - TTL - 1 },
      fresh: { lastSeenAt: NOW - 1000 },
    });

    const result = pruneLastSessionEntries(cache, NOW);

    expect('old' in result.entries).toBe(false);
    expect('fresh' in result.entries).toBe(true);
  });

  it('keeps non-expired entries unchanged', () => {
    const cache = makeCache({
      fresh: { lastSeenAt: NOW - 1000, passwordHash: 'abc' },
    });

    const result = pruneLastSessionEntries(cache, NOW);

    expect(result.entries['fresh']).toMatchObject({ lastSeenAt: NOW - 1000, passwordHash: 'abc' });
  });

  it('clamps future-dated lastSeenAt to now', () => {
    const cache = makeCache({
      future: { lastSeenAt: NOW + 5000 },
    });

    const result = pruneLastSessionEntries(cache, NOW);

    expect(result.entries['future']?.lastSeenAt).toBe(NOW);
  });

  it('returns empty entries map when all entries expired', () => {
    const cache = makeCache({
      old1: { lastSeenAt: NOW - TTL - 1 },
      old2: { lastSeenAt: NOW - TTL - 9999 },
    });

    const result = pruneLastSessionEntries(cache, NOW);

    expect(result.entries).toEqual({});
  });

  it('respects custom ttlMs parameter', () => {
    const shortTtl = 5000;
    const cache = makeCache({
      recent: { lastSeenAt: NOW - 3000 },
      old: { lastSeenAt: NOW - 6000 },
    });

    const result = pruneLastSessionEntries(cache, NOW, shortTtl);

    expect('recent' in result.entries).toBe(true);
    expect('old' in result.entries).toBe(false);
  });

  it('does not mutate original cache', () => {
    const cache = makeCache({
      future: { lastSeenAt: NOW + 5000 },
    });
    const originalLastSeenAt = cache.entries['future']?.lastSeenAt;

    pruneLastSessionEntries(cache, NOW);

    expect(cache.entries['future']?.lastSeenAt).toBe(originalLastSeenAt);
  });
});
