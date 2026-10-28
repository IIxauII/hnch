/**
 * Unit tests for shouldRecordCache.
 *
 * Verifies the dedup logic that prevents the last-session cache from
 * being written on every Yjs doc mutation (votes, awareness, etc.)
 * while the WS is connected to the same room.
 */

import { describe, expect, it } from 'vitest';
import { shouldRecordCache } from './cache-record-guard';

describe('shouldRecordCache', () => {
  // Joined is "up and synced". An open socket alone is not: the relay takes
  // the socket before it refuses a wrong password (ADR-0035), and a record
  // made then would store the hash it is about to reject.
  it('returns false until the session is joined', () => {
    expect(shouldRecordCache('ABC123', 'uuid-1', false, null)).toBe(false);
    expect(shouldRecordCache('ABC123', 'uuid-1', false, 'uuid-0')).toBe(false);
  });

  it('returns false when code is falsy', () => {
    expect(shouldRecordCache(null, 'uuid-1', true, null)).toBe(false);
    expect(shouldRecordCache(undefined, 'uuid-1', true, null)).toBe(false);
    expect(shouldRecordCache('', 'uuid-1', true, null)).toBe(false);
  });

  it('returns false when uuid is falsy', () => {
    expect(shouldRecordCache('ABC123', null, true, null)).toBe(false);
    expect(shouldRecordCache('ABC123', undefined, true, null)).toBe(false);
    expect(shouldRecordCache('ABC123', '', true, null)).toBe(false);
  });

  it('returns true on first connect (lastRecordedUuid is null)', () => {
    expect(shouldRecordCache('ABC123', 'uuid-1', true, null)).toBe(true);
  });

  it('returns false when uuid matches lastRecordedUuid (same room, no re-write)', () => {
    // Simulates vote/awareness ticks with same uuid — must NOT re-trigger write
    expect(shouldRecordCache('ABC123', 'uuid-1', true, 'uuid-1')).toBe(false);
  });

  it('returns true when uuid changes (user joined a different room)', () => {
    expect(shouldRecordCache('DEF456', 'uuid-2', true, 'uuid-1')).toBe(true);
  });

  it('effect write-once semantics: first call true, subsequent calls false', () => {
    let lastRecordedUuid: string | null = null;
    const code = 'ABC123';
    const uuid = 'uuid-1';
    const joined = true;

    // First check — should write
    const first = shouldRecordCache(code, uuid, joined, lastRecordedUuid);
    expect(first).toBe(true);
    lastRecordedUuid = uuid; // simulate what the effect does after writing

    // Subsequent checks with same uuid (vote ticks, awareness pings, etc.)
    expect(shouldRecordCache(code, uuid, joined, lastRecordedUuid)).toBe(false);
    expect(shouldRecordCache(code, uuid, joined, lastRecordedUuid)).toBe(false);
    expect(shouldRecordCache(code, uuid, joined, lastRecordedUuid)).toBe(false);
  });

  it('reconnect scenario: disconnect resets lastRecordedUuid to null, reconnect re-writes', () => {
    let lastRecordedUuid: string | null = 'uuid-1';
    const code = 'ABC123';
    const uuid = 'uuid-1';

    // Disconnect → effect body sets lastRecordedUuid = null
    lastRecordedUuid = null;

    // Reconnect — should write again (TTL bump per ADR-0022 §5)
    expect(shouldRecordCache(code, uuid, true, lastRecordedUuid)).toBe(true);
  });

  it('screen transition: lobby then estimating both write (different component instances)', () => {
    // Each page has its own lastRecordedUuid starting at null
    const lobbyLastUuid: string | null = null;
    const estimatingLastUuid: string | null = null;

    expect(shouldRecordCache('ABC123', 'uuid-1', true, lobbyLastUuid)).toBe(true);
    expect(shouldRecordCache('ABC123', 'uuid-1', true, estimatingLastUuid)).toBe(true);
  });
});
