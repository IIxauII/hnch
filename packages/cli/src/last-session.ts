/**
 * Last session cache stored at `~/.config/hnch/last-session.json`.
 *
 * Multi-entry v2 cache keyed by roomUuid. Supports up to
 * LAST_SESSION_MAX_ENTRIES rooms, evicting the oldest on overflow.
 * Entries older than LAST_SESSION_TTL_MS are pruned on read.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  migrateLastSessionCache,
  pruneLastSessionEntries,
  LAST_SESSION_MAX_ENTRIES,
  type LastSessionEntry,
} from '@hnch/shared';
import { configDir } from './config.js';

export type { LastSessionEntry };

function lastSessionPath(): string {
  return join(configDir(), 'last-session.json');
}

function atomicWrite(path: string, data: string): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  writeFileSync(path, data, { encoding: 'utf-8', mode: 0o600 });
  chmodSync(path, 0o600);
}

function deleteFile(): void {
  const path = lastSessionPath();
  try {
    unlinkSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}

/** Load raw entries from file, migrating v1→v2. Returns {} on missing/corrupt file. */
function loadRawEntries(): Record<string, LastSessionEntry> {
  const path = lastSessionPath();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    return { ...migrateLastSessionCache(raw).entries };
  } catch {
    return {};
  }
}

function persistEntries(entries: Record<string, LastSessionEntry>): void {
  const cache = { version: 2 as const, entries };
  atomicWrite(lastSessionPath(), JSON.stringify(cache, null, 2) + '\n');
}

/**
 * Read, migrate (v1→v2), prune expired entries, clamp future timestamps.
 * Returns entries sorted by lastSeenAt descending. Deletes file when
 * zero valid entries remain after pruning.
 */
export function readEntries(opts?: { now?: () => number }): LastSessionEntry[] {
  const now = opts?.now?.() ?? Date.now();
  if (!existsSync(lastSessionPath())) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(lastSessionPath(), 'utf-8'));
  } catch {
    return [];
  }

  const migrated = migrateLastSessionCache(raw);
  const pruned = pruneLastSessionEntries(migrated, now);

  const entries = Object.values(pruned.entries);
  if (entries.length === 0) {
    deleteFile();
    return [];
  }

  return entries.toSorted((a, b) => b.lastSeenAt - a.lastSeenAt);
}

/** Resolve the passwordHash to keep when upserting an entry. */
function resolvePasswordHash(
  payloadHash: string | undefined,
  existingHash: string | undefined,
): { passwordHash: string } | Record<never, never> {
  if (payloadHash !== undefined) return { passwordHash: payloadHash };
  if (existingHash !== undefined) return { passwordHash: existingHash };
  return {};
}

/**
 * Upsert an entry by roomUuid. Refreshes lastSeenAt. Replaces passwordHash
 * only when payload provides one (never clobbers to undefined).
 * Enforces LAST_SESSION_MAX_ENTRIES cap by evicting lowest lastSeenAt.
 */
export function recordEntry(payload: {
  roomCode: string;
  roomUuid: string;
  lastSeenAt?: number;
  passwordHash?: string;
}): void {
  const now = Date.now();
  const entries = loadRawEntries();
  const existing = entries[payload.roomUuid];

  entries[payload.roomUuid] = {
    roomCode: payload.roomCode,
    roomUuid: payload.roomUuid,
    lastSeenAt: payload.lastSeenAt ?? now,
    ...resolvePasswordHash(payload.passwordHash, existing?.passwordHash),
  };

  // Cap enforcement: evict lowest lastSeenAt until within limit
  const keys = Object.keys(entries);
  if (keys.length > LAST_SESSION_MAX_ENTRIES) {
    const toEvict = keys
      .toSorted((a, b) => (entries[a]?.lastSeenAt ?? 0) - (entries[b]?.lastSeenAt ?? 0))
      .slice(0, keys.length - LAST_SESSION_MAX_ENTRIES);
    for (const k of toEvict) {
      delete entries[k];
    }
  }

  persistEntries(entries);
}

/**
 * Remove a single entry by roomUuid. Deletes file if it was the last entry.
 */
export function removeEntry(roomUuid: string): void {
  if (!existsSync(lastSessionPath())) return;
  const entries = loadRawEntries();

  delete entries[roomUuid];

  if (Object.keys(entries).length === 0) {
    deleteFile();
    return;
  }

  persistEntries(entries);
}

/**
 * Delete the entire cache file.
 */
export function clearAll(): void {
  deleteFile();
}

/**
 * Clear only the passwordHash for one entry. Keeps all other fields.
 * No-op if entry doesn't exist.
 */
export function clearPasswordHash(roomUuid: string): void {
  if (!existsSync(lastSessionPath())) return;
  const entries = loadRawEntries();

  const entry = entries[roomUuid];
  if (!entry) return;

  const { passwordHash: _dropped, ...rest } = entry;
  entries[roomUuid] = rest as LastSessionEntry;

  persistEntries(entries);
}

// ---------------------------------------------------------------------------
// Legacy shims — kept for callers that haven't migrated yet.
// Deprecated; prefer readEntries / recordEntry / clearAll.
// ---------------------------------------------------------------------------

/** @deprecated Use readEntries()[0] or iterate entries. */
export function readLastSession(): LastSessionEntry | null {
  const entries = readEntries();
  return entries[0] ?? null;
}

/** @deprecated Use recordEntry(). */
export function writeLastSession(cache: {
  roomCode: string;
  roomUuid: string;
  lastSeenAt?: number;
  passwordHash?: string;
}): void {
  recordEntry(cache);
}

/** @deprecated Use clearAll(). */
export function clearLastSession(): void {
  clearAll();
}
