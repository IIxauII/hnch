/**
 * Unit tests for LastSessionService v2 (ADR-0044 map shape).
 *
 * Mocks Capacitor Preferences; exercises list/recordJoin/clearPasswordHash/
 * removeByUuid/clearAll, v1-migration, TTL clamping and eviction.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Capacitor Preferences
// ---------------------------------------------------------------------------

const store: Record<string, string> = {};

const mockPreferences = {
  get: vi.fn(async ({ key }: { key: string }) => ({ value: store[key] ?? null })),
  set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
    store[key] = value;
  }),
  remove: vi.fn(async ({ key }: { key: string }) => {
    delete store[key];
  }),
};

vi.mock('@capacitor/preferences', () => ({ Preferences: mockPreferences }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KEY = 'hnch.lastSession';
const TTL = 24 * 60 * 60 * 1000;

function makeV1(overrides: Partial<Record<string, unknown>> = {}) {
  return JSON.stringify({
    roomCode: 'AAA111',
    roomUuid: 'uuid-v1',
    lastSeenAt: Date.now(),
    lastScreen: 'lobby',
    ...overrides,
  });
}

function makeV2(entries: Record<string, unknown>) {
  return JSON.stringify({ version: 2, entries });
}

async function createService() {
  const mod = await import('./last-session.service');
  return new mod.LastSessionService();
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('LastSessionService v2', () => {
  beforeEach(() => {
    // Clear in-memory store and reset mocks
    for (const k of Object.keys(store)) delete store[k];
    mockPreferences.get.mockClear();
    mockPreferences.set.mockClear();
    mockPreferences.remove.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // list() — empty initial state
  // -------------------------------------------------------------------------

  describe('list()', () => {
    it('returns empty array when Preferences has no entry', async () => {
      const svc = await createService();
      const result = await svc.list();
      expect(result).toEqual([]);
    });

    it('returns entry after one recordJoin', async () => {
      const svc = await createService();
      const now = 1_000_000;
      await svc.recordJoin(
        { roomCode: 'ABC123', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => now },
      );
      const result = await svc.list({ now: () => now });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        roomCode: 'ABC123',
        roomUuid: 'u1',
        lastScreen: 'lobby',
        lastSeenAt: now,
      });
    });

    it('sorts by lastSeenAt desc', async () => {
      const svc = await createService();
      const t1 = 1_000_000;
      const t2 = 2_000_000;
      await svc.recordJoin(
        { roomCode: 'AAA111', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => t1 },
      );
      await svc.recordJoin(
        { roomCode: 'BBB222', roomUuid: 'u2', lastScreen: 'estimating' },
        { now: () => t2 },
      );
      const result = await svc.list({ now: () => t2 + 1000 });
      expect(result[0]!.roomUuid).toBe('u2');
      expect(result[1]!.roomUuid).toBe('u1');
    });

    it('writes back cache when some (not all) entries expire', async () => {
      const now = 1_000_000;
      store[KEY] = makeV2({
        u1: { roomCode: 'EXPIRED', roomUuid: 'u1', lastSeenAt: now - TTL - 1 },
        u2: { roomCode: 'FRESH', roomUuid: 'u2', lastSeenAt: now - 1000 },
      });
      const svc = await createService();
      const result = await svc.list({ now: () => now });
      // Only fresh entry survives
      expect(result).toHaveLength(1);
      expect(result[0]!.roomUuid).toBe('u2');
      // Written back (not removed — remaining entries exist)
      expect(mockPreferences.set).toHaveBeenCalled();
    });

    it('clamps future-dated lastSeenAt to now', async () => {
      const now = 1_000_000;
      const future = now + 999_999;
      store[KEY] = makeV2({
        u1: { roomCode: 'ABC123', roomUuid: 'u1', lastSeenAt: future },
      });
      const svc = await createService();
      const result = await svc.list({ now: () => now });
      expect(result[0]!.lastSeenAt).toBe(now);
    });

    it('drops expired entries and clears key when all expire', async () => {
      const now = 1_000_000;
      store[KEY] = makeV2({
        u1: { roomCode: 'AAA111', roomUuid: 'u1', lastSeenAt: now - TTL - 1 },
      });
      const svc = await createService();
      const result = await svc.list({ now: () => now });
      expect(result).toEqual([]);
      expect(mockPreferences.remove).toHaveBeenCalledWith({ key: KEY });
      expect(store[KEY]).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // recordJoin() — upsert + dedup + cap
  // -------------------------------------------------------------------------

  describe('recordJoin()', () => {
    it('records a new entry', async () => {
      const svc = await createService();
      const now = 5_000_000;
      await svc.recordJoin(
        { roomCode: 'ABC123', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => now },
      );
      const result = await svc.list({ now: () => now });
      expect(result[0]).toMatchObject({
        roomCode: 'ABC123',
        roomUuid: 'u1',
        lastScreen: 'lobby',
        lastSeenAt: now,
      });
    });

    it('re-recording same roomUuid overwrites lastSeenAt and lastScreen', async () => {
      const svc = await createService();
      const t1 = 1_000_000;
      const t2 = 2_000_000;
      await svc.recordJoin(
        { roomCode: 'ABC123', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => t1 },
      );
      await svc.recordJoin(
        { roomCode: 'ABC123', roomUuid: 'u1', lastScreen: 'estimating' },
        { now: () => t2 },
      );
      const result = await svc.list({ now: () => t2 });
      expect(result).toHaveLength(1);
      expect(result[0]!.lastScreen).toBe('estimating');
      expect(result[0]!.lastSeenAt).toBe(t2);
    });

    it('preserves existing passwordHash when payload provides none', async () => {
      const svc = await createService();
      const now = 1_000_000;
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'lobby', passwordHash: 'hash-abc' },
        { now: () => now },
      );
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'estimating' },
        { now: () => now + 1000 },
      );
      const result = await svc.list({ now: () => now + 2000 });
      expect(result[0]!.passwordHash).toBe('hash-abc');
    });

    it('consumes pending hash set by setPendingPasswordHash', async () => {
      const svc = await createService();
      const now = 1_000_000;
      svc.setPendingPasswordHash('u1', 'pending-hash');
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => now },
      );
      const result = await svc.list({ now: () => now });
      expect(result[0]!.passwordHash).toBe('pending-hash');
    });

    it('pending hash consumed (deleted) after first recordJoin', async () => {
      const svc = await createService();
      const now = 1_000_000;
      svc.setPendingPasswordHash('u1', 'one-time-hash');
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => now },
      );
      // Second recordJoin without explicit hash — pending already consumed, existing hash preserved
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'estimating' },
        { now: () => now + 1000 },
      );
      const result = await svc.list({ now: () => now + 2000 });
      expect(result[0]!.passwordHash).toBe('one-time-hash');
    });

    it('replaces passwordHash when new payload provides one', async () => {
      const svc = await createService();
      const now = 1_000_000;
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'lobby', passwordHash: 'old-hash' },
        { now: () => now },
      );
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'lobby', passwordHash: 'new-hash' },
        { now: () => now + 1000 },
      );
      const result = await svc.list({ now: () => now + 2000 });
      expect(result[0]!.passwordHash).toBe('new-hash');
    });

    it('evicts oldest entry when 6th is added (cap=5)', async () => {
      const svc = await createService();
      const base = 1_000_000;
      for (let i = 1; i <= 5; i++) {
        await svc.recordJoin(
          { roomCode: `R${i}XXXX`, roomUuid: `u${i}`, lastScreen: 'lobby' },
          { now: () => base + i * 1000 },
        );
      }
      // 6th entry — oldest (u1) should be evicted
      await svc.recordJoin(
        { roomCode: 'R6XXXX', roomUuid: 'u6', lastScreen: 'lobby' },
        { now: () => base + 6000 },
      );
      const result = await svc.list({ now: () => base + 7000 });
      expect(result).toHaveLength(5);
      expect(result.find((e) => e.roomUuid === 'u1')).toBeUndefined();
      expect(result.find((e) => e.roomUuid === 'u6')).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // clearPasswordHash()
  // -------------------------------------------------------------------------

  describe('clearPasswordHash()', () => {
    it('removes passwordHash but keeps all other fields', async () => {
      const svc = await createService();
      const now = 1_000_000;
      await svc.recordJoin(
        { roomCode: 'ABC123', roomUuid: 'u1', lastScreen: 'lobby', passwordHash: 'h' },
        { now: () => now },
      );
      await svc.clearPasswordHash('u1');
      const result = await svc.list({ now: () => now });
      expect(result[0]!.passwordHash).toBeUndefined();
      expect(result[0]!.roomCode).toBe('ABC123');
      expect(result[0]!.lastScreen).toBe('lobby');
    });

    it('is a no-op when roomUuid not found', async () => {
      const svc = await createService();
      await expect(svc.clearPasswordHash('unknown')).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // removeByUuid()
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // The hash the device keeps, and the one waiting to be kept
  //
  // A hash handed over before the session has an entry waits for the entry's
  // first record. It must not outlive being given up: a hash left waiting is
  // written back by the next record, for a session whose password the host
  // has since removed.
  // -------------------------------------------------------------------------

  describe('rememberPasswordHash()', () => {
    const now = 1_000_000;

    it('writes the hash to the entry straight away when there is one', async () => {
      const svc = await createService();
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => now },
      );

      await svc.rememberPasswordHash('u1', 'new-hash');

      const [entry] = await svc.list({ now: () => now });
      expect(entry!.passwordHash).toBe('new-hash');
    });

    it('replaces the hash the entry had', async () => {
      const svc = await createService();
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'lobby', passwordHash: 'old-hash' },
        { now: () => now },
      );

      await svc.rememberPasswordHash('u1', 'new-hash');

      const [entry] = await svc.list({ now: () => now });
      expect(entry!.passwordHash).toBe('new-hash');
    });

    it('keeps everything else about the entry', async () => {
      const svc = await createService();
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'estimating' },
        { now: () => now },
      );

      await svc.rememberPasswordHash('u1', 'new-hash');

      const [entry] = await svc.list({ now: () => now });
      expect(entry).toMatchObject({ roomCode: 'A', lastScreen: 'estimating', lastSeenAt: now });
    });

    it('holds the hash for the first record when there is no entry yet', async () => {
      const svc = await createService();

      await svc.rememberPasswordHash('u1', 'first-hash');
      expect(await svc.list({ now: () => now })).toEqual([]);

      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => now },
      );
      const [entry] = await svc.list({ now: () => now });
      expect(entry!.passwordHash).toBe('first-hash');
    });
  });

  describe('a hash that is given up stays given up', () => {
    const now = 1_000_000;
    const record = (svc: Awaited<ReturnType<typeof createService>>) =>
      svc.recordJoin({ roomCode: 'A', roomUuid: 'u1', lastScreen: 'lobby' }, { now: () => now });

    // The host sets a password, then removes it. The next record is the
    // reconnect that follows the removal.
    it('clearPasswordHash drops the one that was waiting', async () => {
      const svc = await createService();
      svc.setPendingPasswordHash('u1', 'waiting');

      await svc.clearPasswordHash('u1');
      await record(svc);

      const [entry] = await svc.list({ now: () => now });
      expect(entry!.passwordHash).toBeUndefined();
    });

    it('clearPasswordHash drops it even when there is no entry to clear', async () => {
      const svc = await createService();
      await svc.rememberPasswordHash('u1', 'waiting');

      await svc.clearPasswordHash('u1');
      await record(svc);

      const [entry] = await svc.list({ now: () => now });
      expect(entry!.passwordHash).toBeUndefined();
    });

    it('removeByUuid drops it', async () => {
      const svc = await createService();
      svc.setPendingPasswordHash('u1', 'waiting');

      await svc.removeByUuid('u1');
      await record(svc);

      const [entry] = await svc.list({ now: () => now });
      expect(entry!.passwordHash).toBeUndefined();
    });

    it('clearAll drops every one of them', async () => {
      const svc = await createService();
      svc.setPendingPasswordHash('u1', 'waiting');
      svc.setPendingPasswordHash('u2', 'waiting-too');

      await svc.clearAll();
      await record(svc);
      await svc.recordJoin(
        { roomCode: 'B', roomUuid: 'u2', lastScreen: 'lobby' },
        { now: () => now },
      );

      const entries = await svc.list({ now: () => now });
      expect(entries.map((e) => e.passwordHash)).toEqual([undefined, undefined]);
    });

    it('leaves the hash of another session alone', async () => {
      const svc = await createService();
      svc.setPendingPasswordHash('u2', 'theirs');

      await svc.clearPasswordHash('u1');
      await svc.recordJoin(
        { roomCode: 'B', roomUuid: 'u2', lastScreen: 'lobby' },
        { now: () => now },
      );

      const [entry] = await svc.list({ now: () => now });
      expect(entry!.passwordHash).toBe('theirs');
    });
  });

  describe('removeByUuid()', () => {
    it('removes one entry from a multi-entry cache', async () => {
      const svc = await createService();
      const now = 1_000_000;
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => now },
      );
      await svc.recordJoin(
        { roomCode: 'B', roomUuid: 'u2', lastScreen: 'lobby' },
        { now: () => now + 1000 },
      );
      await svc.removeByUuid('u1');
      const result = await svc.list({ now: () => now + 2000 });
      expect(result).toHaveLength(1);
      expect(result[0]!.roomUuid).toBe('u2');
    });

    it('clears Preferences key when last entry removed', async () => {
      const svc = await createService();
      const now = 1_000_000;
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => now },
      );
      await svc.removeByUuid('u1');
      expect(store[KEY]).toBeUndefined();
    });

    it('is a no-op when roomUuid not found', async () => {
      const svc = await createService();
      await expect(svc.removeByUuid('ghost')).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // clearAll()
  // -------------------------------------------------------------------------

  describe('clearAll()', () => {
    it('removes the Preferences key', async () => {
      const svc = await createService();
      const now = 1_000_000;
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => now },
      );
      await svc.clearAll();
      expect(store[KEY]).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Changes take turns
  // -------------------------------------------------------------------------

  // Every change writes back what it read. Leaving a session and being
  // refused by it can reach the cache in the same moment, and so can the
  // password sheet and the page that records the session.
  describe('changes made at the same moment', () => {
    const now = 1_000_000;
    const entry = (roomUuid: string) => ({
      roomCode: roomUuid.toUpperCase(),
      roomUuid,
      lastSeenAt: now,
      lastScreen: 'lobby',
    });

    it('do not undo each other', async () => {
      store[KEY] = makeV2({ u1: entry('u1'), u2: entry('u2'), u3: entry('u3') });
      const svc = await createService();

      await Promise.all([svc.removeByUuid('u1'), svc.removeByUuid('u2')]);

      const left = await svc.list({ now: () => now });
      expect(left.map((e) => e.roomUuid)).toEqual(['u3']);
    });

    it('keep a record and a forgotten password apart', async () => {
      store[KEY] = makeV2({ u1: { ...entry('u1'), passwordHash: 'old' } });
      const svc = await createService();

      await Promise.all([
        svc.clearPasswordHash('u1'),
        svc.recordJoin({ roomCode: 'U2', roomUuid: 'u2', lastScreen: 'lobby' }, { now: () => now }),
      ]);

      const left = await svc.list({ now: () => now });
      expect(left.map((e) => e.roomUuid).toSorted()).toEqual(['u1', 'u2']);
      expect(left.find((e) => e.roomUuid === 'u1')!.passwordHash).toBeUndefined();
    });

    it('happen in the order they were asked for', async () => {
      const svc = await createService();

      // Given up first, handed over second: the second one counts.
      const cleared = svc.clearPasswordHash('u1');
      svc.setPendingPasswordHash('u1', 'newer');
      await cleared;
      await svc.recordJoin(
        { roomCode: 'U1', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => now },
      );

      const [recorded] = await svc.list({ now: () => now });
      expect(recorded!.passwordHash).toBe('newer');
    });

    it('show a list that has all of them in it', async () => {
      store[KEY] = makeV2({ u1: entry('u1'), u2: entry('u2') });
      const svc = await createService();

      void svc.removeByUuid('u1');
      const left = await svc.list({ now: () => now });

      expect(left.map((e) => e.roomUuid)).toEqual(['u2']);
    });

    it('go on after one of them failed', async () => {
      store[KEY] = makeV2({ u1: entry('u1'), u2: entry('u2') });
      const svc = await createService();
      mockPreferences.set.mockRejectedValueOnce(new Error('disk full'));

      const failed = svc.removeByUuid('u1');
      const next = svc.removeByUuid('u2');

      await expect(failed).rejects.toThrow('disk full');
      await expect(next).resolves.toBeUndefined();
      const left = await svc.list({ now: () => now });
      expect(left.map((e) => e.roomUuid)).toEqual(['u1']);
    });
  });

  // -------------------------------------------------------------------------
  // v1 → v2 migration
  // -------------------------------------------------------------------------

  describe('v1 migration', () => {
    it('migrates v1 single-object shape to single-entry list on list()', async () => {
      store[KEY] = makeV1({
        roomCode: 'V1CODE',
        roomUuid: 'uuid-v1',
        lastSeenAt: Date.now(),
        lastScreen: 'lobby',
      });
      const svc = await createService();
      const result = await svc.list();
      expect(result).toHaveLength(1);
      expect(result[0]!.roomCode).toBe('V1CODE');
      expect(result[0]!.roomUuid).toBe('uuid-v1');
    });

    it('v1 migration works even without lastScreen field', async () => {
      const now = Date.now();
      store[KEY] = JSON.stringify({ roomCode: 'V1CODE', roomUuid: 'uuid-v1', lastSeenAt: now });
      const svc = await createService();
      const result = await svc.list({ now: () => now });
      expect(result).toHaveLength(1);
      expect(result[0]!.roomCode).toBe('V1CODE');
    });
  });

  // -------------------------------------------------------------------------
  // Back-compat: get() / record() / clear()
  // -------------------------------------------------------------------------

  describe('back-compat methods', () => {
    it('get() returns first entry from list', async () => {
      const svc = await createService();
      const now = 1_000_000;
      await svc.recordJoin(
        { roomCode: 'X', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => now },
      );
      const result = await svc.get({ now: () => now });
      expect(result?.roomUuid).toBe('u1');
    });

    it('get() returns null when no entries', async () => {
      const svc = await createService();
      const result = await svc.get();
      expect(result).toBeNull();
    });

    it('record() delegates to recordJoin()', async () => {
      const svc = await createService();
      const now = 1_000_000;
      await svc.record(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'estimating' },
        { now: () => now },
      );
      const entries = await svc.list({ now: () => now });
      expect(entries[0]!.lastScreen).toBe('estimating');
    });

    it('clear() delegates to clearAll()', async () => {
      const svc = await createService();
      const now = 1_000_000;
      await svc.recordJoin(
        { roomCode: 'A', roomUuid: 'u1', lastScreen: 'lobby' },
        { now: () => now },
      );
      await svc.clear();
      expect(store[KEY]).toBeUndefined();
    });
  });
});
