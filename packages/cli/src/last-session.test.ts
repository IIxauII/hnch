import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readEntries,
  recordEntry,
  removeEntry,
  clearAll,
  clearPasswordHash,
} from './last-session.js';

let tmpBase: string;

beforeEach(() => {
  tmpBase = mkdtempSync(join(tmpdir(), 'hnch-test-'));
  process.env['XDG_CONFIG_HOME'] = tmpBase;
});

afterEach(() => {
  delete process.env['XDG_CONFIG_HOME'];
  rmSync(tmpBase, { recursive: true, force: true });
});

function filePath(): string {
  return join(tmpBase, 'hnch', 'last-session.json');
}

describe('readEntries', () => {
  it('returns [] when no file exists', () => {
    expect(readEntries()).toEqual([]);
  });

  it('returns [] and does not throw on unparseable file', () => {
    mkdirSync(join(tmpBase, 'hnch'), { recursive: true });
    writeFileSync(filePath(), 'not json', 'utf-8');
    expect(readEntries()).toEqual([]);
  });

  it('returns [] and does not throw on junk JSON shape', () => {
    mkdirSync(join(tmpBase, 'hnch'), { recursive: true });
    writeFileSync(filePath(), JSON.stringify([1, 2, 3]), 'utf-8');
    expect(readEntries()).toEqual([]);
  });
});

describe('recordEntry — single room', () => {
  it('creates an entry that readEntries returns', () => {
    recordEntry({ roomCode: 'ABC123', roomUuid: 'uuid-1', lastSeenAt: 1000 });
    const entries = readEntries({ now: () => 1000 });
    expect(entries).toHaveLength(1);
    expect(entries[0].roomCode).toBe('ABC123');
    expect(entries[0].roomUuid).toBe('uuid-1');
  });

  it('writes file with mode 0600', () => {
    recordEntry({ roomCode: 'ABC123', roomUuid: 'uuid-1', lastSeenAt: 1000 });
    const st = statSync(filePath());
    if (process.platform !== 'win32') {
      expect(st.mode & 0o777).toBe(0o600);
    }
  });

  it('creates parent dir with mode 0700', () => {
    recordEntry({ roomCode: 'ABC123', roomUuid: 'uuid-1', lastSeenAt: 1000 });
    const st = statSync(join(tmpBase, 'hnch'));
    if (process.platform !== 'win32') {
      expect(st.mode & 0o777).toBe(0o700);
    }
  });
});

describe('recordEntry — same-room rejoin', () => {
  it('updates in place (no duplicate entries)', () => {
    const now = Date.now();
    recordEntry({ roomCode: 'ABC123', roomUuid: 'uuid-1', lastSeenAt: now - 5000 });
    recordEntry({ roomCode: 'ABC123', roomUuid: 'uuid-1', lastSeenAt: now });
    const entries = readEntries({ now: () => now });
    expect(entries).toHaveLength(1);
  });

  it('refreshes lastSeenAt on second record', () => {
    const t1 = 1_000_000;
    const t2 = 2_000_000;
    recordEntry({ roomCode: 'ABC123', roomUuid: 'uuid-1', lastSeenAt: t1 });
    recordEntry({ roomCode: 'ABC123', roomUuid: 'uuid-1', lastSeenAt: t2 });
    const entries = readEntries({ now: () => t2 });
    expect(entries[0].lastSeenAt).toBe(t2);
  });

  it('replaces passwordHash when provided on update', () => {
    const t = 1_000_000;
    recordEntry({ roomCode: 'ABC123', roomUuid: 'uuid-1', lastSeenAt: t, passwordHash: 'hash-1' });
    recordEntry({ roomCode: 'ABC123', roomUuid: 'uuid-1', lastSeenAt: t, passwordHash: 'hash-2' });
    const entries = readEntries({ now: () => t });
    expect(entries[0].passwordHash).toBe('hash-2');
  });

  it('does not clobber passwordHash when not provided on update', () => {
    const t = 1_000_000;
    recordEntry({ roomCode: 'ABC123', roomUuid: 'uuid-1', lastSeenAt: t, passwordHash: 'hash-1' });
    recordEntry({ roomCode: 'ABC123', roomUuid: 'uuid-1', lastSeenAt: t });
    const entries = readEntries({ now: () => t });
    expect(entries[0].passwordHash).toBe('hash-1');
  });
});

describe('recordEntry — 5-entry cap', () => {
  it('evicts oldest entry when 6th room recorded', () => {
    const base = 1_000_000;
    for (let i = 1; i <= 5; i++) {
      recordEntry({ roomCode: `R${i}`, roomUuid: `uuid-${i}`, lastSeenAt: base + i * 1000 });
    }
    // 6th room — oldest is uuid-1 (lastSeenAt = base+1000)
    recordEntry({ roomCode: 'R6', roomUuid: 'uuid-6', lastSeenAt: base + 6000 });
    const entries = readEntries({ now: () => base + 6000 });
    expect(entries).toHaveLength(5);
    expect(entries.some((e) => e.roomUuid === 'uuid-1')).toBe(false);
    expect(entries.some((e) => e.roomUuid === 'uuid-6')).toBe(true);
  });
});

describe('readEntries — pruning and clamping', () => {
  it('prunes entries past TTL (24h)', () => {
    const TTL = 24 * 60 * 60 * 1000;
    const stale = 1_000_000;
    recordEntry({ roomCode: 'OLD', roomUuid: 'uuid-old', lastSeenAt: stale });
    const entries = readEntries({ now: () => stale + TTL + 1 });
    expect(entries).toHaveLength(0);
  });

  it('deletes file when all entries expire', () => {
    const TTL = 24 * 60 * 60 * 1000;
    const stale = 1_000_000;
    recordEntry({ roomCode: 'OLD', roomUuid: 'uuid-old', lastSeenAt: stale });
    readEntries({ now: () => stale + TTL + 1 });
    // Second read should return [] without throwing
    expect(readEntries({ now: () => stale + TTL + 1 })).toEqual([]);
  });

  it('clamps future lastSeenAt to now', () => {
    const now = 1_000_000;
    const future = now + 999_999;
    recordEntry({ roomCode: 'ABC', roomUuid: 'uuid-f', lastSeenAt: future });
    const entries = readEntries({ now: () => now });
    // Entry survives (not expired), but lastSeenAt clamped
    expect(entries[0].lastSeenAt).toBeLessThanOrEqual(now);
  });
});

describe('removeEntry', () => {
  it('removes the specified entry', () => {
    const t = 1_000_000;
    recordEntry({ roomCode: 'A', roomUuid: 'uuid-a', lastSeenAt: t });
    recordEntry({ roomCode: 'B', roomUuid: 'uuid-b', lastSeenAt: t });
    removeEntry('uuid-a');
    const entries = readEntries({ now: () => t });
    expect(entries).toHaveLength(1);
    expect(entries[0].roomUuid).toBe('uuid-b');
  });

  it('deletes file when last entry removed', () => {
    const t = 1_000_000;
    recordEntry({ roomCode: 'A', roomUuid: 'uuid-a', lastSeenAt: t });
    removeEntry('uuid-a');
    // File gone — readEntries returns []
    expect(readEntries({ now: () => t })).toEqual([]);
  });

  it('is a no-op when entry does not exist', () => {
    expect(() => removeEntry('nonexistent')).not.toThrow();
  });

  it('is a no-op when file does not exist', () => {
    expect(() => removeEntry('uuid-x')).not.toThrow();
  });
});

describe('clearAll', () => {
  it('removes all entries', () => {
    const t = 1_000_000;
    recordEntry({ roomCode: 'A', roomUuid: 'uuid-a', lastSeenAt: t });
    recordEntry({ roomCode: 'B', roomUuid: 'uuid-b', lastSeenAt: t });
    clearAll();
    expect(readEntries({ now: () => t })).toEqual([]);
  });

  it('is a no-op when no file exists', () => {
    expect(() => clearAll()).not.toThrow();
  });
});

describe('clearPasswordHash', () => {
  it('clears passwordHash, keeps other fields', () => {
    const t = 1_000_000;
    recordEntry({ roomCode: 'A', roomUuid: 'uuid-a', lastSeenAt: t, passwordHash: 'secret' });
    clearPasswordHash('uuid-a');
    const entries = readEntries({ now: () => t });
    expect(entries).toHaveLength(1);
    expect(entries[0].roomCode).toBe('A');
    expect(entries[0].passwordHash).toBeUndefined();
  });

  it('does not affect other entries', () => {
    const t = 1_000_000;
    recordEntry({ roomCode: 'A', roomUuid: 'uuid-a', lastSeenAt: t, passwordHash: 'hash-a' });
    recordEntry({ roomCode: 'B', roomUuid: 'uuid-b', lastSeenAt: t, passwordHash: 'hash-b' });
    clearPasswordHash('uuid-a');
    const entries = readEntries({ now: () => t });
    const b = entries.find((e) => e.roomUuid === 'uuid-b');
    expect(b?.passwordHash).toBe('hash-b');
  });

  it('is a no-op when entry does not exist', () => {
    const t = 1_000_000;
    recordEntry({ roomCode: 'A', roomUuid: 'uuid-a', lastSeenAt: t });
    expect(() => clearPasswordHash('nonexistent')).not.toThrow();
    expect(readEntries({ now: () => t })).toHaveLength(1);
  });

  it('is a no-op when file does not exist', () => {
    expect(() => clearPasswordHash('uuid-x')).not.toThrow();
  });
});

describe('v1 migration', () => {
  it('reads old CLI v1 shape {roomCode,roomUuid,lastSeenAt,passwordHash}', () => {
    const t = 1_000_000;
    mkdirSync(join(tmpBase, 'hnch'), { recursive: true });
    writeFileSync(
      filePath(),
      JSON.stringify({
        roomCode: 'OLD1',
        roomUuid: 'uuid-v1',
        lastSeenAt: t,
        passwordHash: 'old-hash',
      }),
      'utf-8',
    );
    const entries = readEntries({ now: () => t });
    expect(entries).toHaveLength(1);
    expect(entries[0].roomCode).toBe('OLD1');
    expect(entries[0].roomUuid).toBe('uuid-v1');
    expect(entries[0].passwordHash).toBe('old-hash');
  });

  it('reads old CLI v1 shape without passwordHash', () => {
    const t = 1_000_000;
    mkdirSync(join(tmpBase, 'hnch'), { recursive: true });
    writeFileSync(
      filePath(),
      JSON.stringify({ roomCode: 'OLD2', roomUuid: 'uuid-v1b', lastSeenAt: t }),
      'utf-8',
    );
    const entries = readEntries({ now: () => t });
    expect(entries).toHaveLength(1);
    expect(entries[0].passwordHash).toBeUndefined();
  });
});

describe('readEntries — sort order', () => {
  it('returns entries most-recent first', () => {
    recordEntry({ roomCode: 'A', roomUuid: 'uuid-a', lastSeenAt: 1000 });
    recordEntry({ roomCode: 'B', roomUuid: 'uuid-b', lastSeenAt: 3000 });
    recordEntry({ roomCode: 'C', roomUuid: 'uuid-c', lastSeenAt: 2000 });
    const entries = readEntries({ now: () => 3000 });
    expect(entries.map((e) => e.roomUuid)).toEqual(['uuid-b', 'uuid-c', 'uuid-a']);
  });
});
