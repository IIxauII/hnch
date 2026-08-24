import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import {
  LAST_SESSION_MAX_ENTRIES,
  LAST_SESSION_TTL_MS,
  migrateLastSessionCache,
  pruneLastSessionEntries,
  type LastSessionEntry,
  type Screen,
} from '@hnch/shared';

export const LAST_SESSION_KEY = 'hnch.lastSession';

/**
 * The screens that count as "inside a session" for route restoration
 * (ADR-0022, ADR-0044). An alias of the shared `Screen` union so the cache,
 * the routes, and both surfaces speak one word (issue #508) — same two
 * members, so no cache migration and the structural validation on read is
 * unaffected. The field itself stays a client-only extension on the cache
 * entry; the shared entry shape deliberately excludes it.
 */
export type LastSessionScreen = Screen;

/**
 * Mobile-extended last-session entry. Adds `lastScreen` for route
 * restoration on rejoin. The shared `LastSessionEntry` base type
 * holds `roomCode`, `roomUuid`, `lastSeenAt`, and optional
 * `passwordHash` (ADR-0044 reverses ADR-0022 §3 on mobile).
 */
export interface ClientLastSessionEntry extends LastSessionEntry {
  readonly lastScreen?: LastSessionScreen;
}

// ---------------------------------------------------------------------------
// Back-compat type alias — old consumers imported `LastSessionCache`
// ---------------------------------------------------------------------------

/** @deprecated Use `ClientLastSessionEntry` directly. */
export type LastSessionCache = ClientLastSessionEntry;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Thin Preferences wrapper backing the Home-screen room history list
 * and Jump-back-in banner (ADR-0044). Stores up to
 * `LAST_SESSION_MAX_ENTRIES` (5) per-room entries keyed by `roomUuid`,
 * TTL-aligned to ADR-0012's 24 h relay snapshot window.
 *
 * All mutations read–migrate–prune–write so the v1 single-object cache
 * is silently upgraded on first touch.
 */
@Injectable({ providedIn: 'root' })
export class LastSessionService {
  /**
   * In-memory transient map from roomUuid → passwordHash, set by the
   * join page / session-resume guard after a successful password-based
   * join. Consumed (and cleared) by the first `recordJoin` call for
   * that uuid, so the hash is persisted without the lobby/estimating
   * pages needing to know about it.
   */
  private readonly pendingHashes = new Map<string, string>();
  /** @deprecated Use the module-level `LAST_SESSION_KEY` constant. */
  static readonly LAST_SESSION_KEY = LAST_SESSION_KEY;
  /** @deprecated Use `LAST_SESSION_TTL_MS` from `@hnch/shared`. */
  static readonly TTL_MS = LAST_SESSION_TTL_MS;

  // -------------------------------------------------------------------------
  // Read helpers
  // -------------------------------------------------------------------------

  private async readCache(): Promise<{
    version: 2;
    entries: Record<string, ClientLastSessionEntry>;
  }> {
    const { value } = await Preferences.get({ key: LAST_SESSION_KEY });
    let parsed: unknown = null;
    if (value) {
      try {
        parsed = JSON.parse(value);
      } catch {
        // Bad JSON → treat as empty
      }
    }

    // migrateLastSessionCache validates the base LastSessionEntry fields but
    // strips mobile-specific extension fields (e.g. lastScreen) since shared
    // doesn't know about them. We re-merge from the raw parsed data so
    // ClientLastSessionEntry fields are preserved.
    const migrated = migrateLastSessionCache(parsed);
    const rawEntries: Record<string, unknown> =
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed as Record<string, unknown>)['version'] === 2
        ? (((parsed as Record<string, unknown>)['entries'] as Record<string, unknown>) ?? {})
        : {};

    const clientEntries: Record<string, ClientLastSessionEntry> = {};
    for (const [uuid, base] of Object.entries(migrated.entries)) {
      const raw = rawEntries[uuid];
      const lastScreen =
        raw !== null &&
        typeof raw === 'object' &&
        !Array.isArray(raw) &&
        ((raw as Record<string, unknown>)['lastScreen'] === 'lobby' ||
          (raw as Record<string, unknown>)['lastScreen'] === 'estimating')
          ? ((raw as Record<string, unknown>)['lastScreen'] as LastSessionScreen)
          : undefined;
      clientEntries[uuid] = {
        ...base,
        ...(lastScreen !== undefined ? { lastScreen } : {}),
      };
    }

    return { version: 2, entries: clientEntries };
  }

  private async writeCache(entries: Record<string, ClientLastSessionEntry>): Promise<void> {
    if (Object.keys(entries).length === 0) {
      await Preferences.remove({ key: LAST_SESSION_KEY });
      return;
    }
    await Preferences.set({
      key: LAST_SESSION_KEY,
      value: JSON.stringify({ version: 2, entries }),
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Read cache, migrate from v1 if needed, prune expired entries, sort
   * by `lastSeenAt` desc, and return. Writes back if pruning changed the
   * cache; clears the Preferences key if all entries expired (ADR-0044
   * decision §11).
   */
  async list(opts: { now?: () => number } = {}): Promise<ClientLastSessionEntry[]> {
    const now = opts.now?.() ?? Date.now();
    const migrated = await this.readCache();
    const pruned = pruneLastSessionEntries(migrated, now);

    const entries = pruned.entries as Record<string, ClientLastSessionEntry>;

    // Write back only if something changed (entries dropped or clamped)
    const prunedCount = Object.keys(entries).length;
    const origCount = Object.keys(migrated.entries).length;
    if (prunedCount !== origCount) {
      await this.writeCache(entries);
    }

    return Object.values(entries).toSorted((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  /**
   * Store a password hash to be consumed by the next `recordJoin` for the
   * given `roomUuid`. Called by the join page and session-resume guard after
   * a successful password-based join so the hash reaches the cache without
   * the lobby/estimating pages needing to know about it.
   *
   * The stored value is cleared on first use (see `recordJoin`).
   */
  setPendingPasswordHash(roomUuid: string, passwordHash: string): void {
    this.pendingHashes.set(roomUuid, passwordHash);
  }

  /**
   * Upsert a room entry. On re-record (same `roomUuid`), refreshes
   * `lastSeenAt` and `lastScreen`; replaces `passwordHash` only when
   * the payload provides one or a pending hash exists for this uuid.
   * Does not clobber to undefined. Enforces 5-entry cap via LRU eviction.
   */
  async recordJoin(
    payload: {
      roomCode: string;
      roomUuid: string;
      lastScreen: LastSessionScreen;
      passwordHash?: string;
    },
    opts: { now?: () => number } = {},
  ): Promise<void> {
    const now = opts.now?.() ?? Date.now();
    const migrated = await this.readCache();
    const pruned = pruneLastSessionEntries(migrated, now);
    const entries = { ...pruned.entries } as Record<string, ClientLastSessionEntry>;

    const existing = entries[payload.roomUuid] as ClientLastSessionEntry | undefined;

    // Consume pending hash (set by join page / guard) if no explicit payload hash
    const pendingHash = this.pendingHashes.get(payload.roomUuid);
    if (pendingHash !== undefined) {
      this.pendingHashes.delete(payload.roomUuid);
    }

    const resolvedHash = payload.passwordHash ?? pendingHash ?? existing?.passwordHash;

    const updated: ClientLastSessionEntry = {
      roomCode: payload.roomCode,
      roomUuid: payload.roomUuid,
      lastSeenAt: now,
      lastScreen: payload.lastScreen,
      ...(resolvedHash !== undefined ? { passwordHash: resolvedHash } : {}),
    };

    entries[payload.roomUuid] = updated;

    // Enforce cap: evict lowest-lastSeenAt entries if over limit
    const sorted = Object.values(entries).toSorted((a, b) => b.lastSeenAt - a.lastSeenAt);
    const capped: Record<string, ClientLastSessionEntry> = {};
    for (const entry of sorted.slice(0, LAST_SESSION_MAX_ENTRIES)) {
      capped[entry.roomUuid] = entry;
    }

    await this.writeCache(capped);
  }

  /**
   * Clear only the `passwordHash` field on a specific entry (ADR-0044
   * decision §6 — wrong-password/4002 handling). Keeps all other fields.
   */
  async clearPasswordHash(roomUuid: string): Promise<void> {
    const migrated = await this.readCache();
    const entries = { ...migrated.entries } as Record<string, ClientLastSessionEntry>;

    const existing = entries[roomUuid];
    if (!existing) return;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _dropped, ...rest } = existing as ClientLastSessionEntry & {
      passwordHash?: string;
    };
    entries[roomUuid] = rest as ClientLastSessionEntry;

    await this.writeCache(entries);
  }

  /**
   * Remove a single entry by UUID. Clears Preferences key entirely if
   * this was the last entry.
   */
  async removeByUuid(roomUuid: string): Promise<void> {
    const migrated = await this.readCache();
    const entries = { ...migrated.entries } as Record<string, ClientLastSessionEntry>;

    if (!(roomUuid in entries)) return;
    delete entries[roomUuid];

    await this.writeCache(entries);
  }

  /** Remove the Preferences key entirely. */
  async clearAll(): Promise<void> {
    await Preferences.remove({ key: LAST_SESSION_KEY });
  }

  // -------------------------------------------------------------------------
  // Back-compat methods kept for existing callers during migration
  // -------------------------------------------------------------------------

  /**
   * @deprecated Use `list()` and take `[0]` or use `recordJoin()`.
   * Legacy single-entry getter — returns first (most-recent) entry, or null.
   */
  async get(opts: { now?: () => number } = {}): Promise<ClientLastSessionEntry | null> {
    const entries = await this.list(opts);
    return entries[0] ?? null;
  }

  /**
   * @deprecated Use `recordJoin()`.
   * Legacy single-entry write.
   */
  async record(
    payload: {
      roomCode: string;
      roomUuid: string;
      lastScreen: LastSessionScreen;
      passwordHash?: string;
    },
    opts: { now?: () => number } = {},
  ): Promise<void> {
    return this.recordJoin(payload, opts);
  }

  /**
   * @deprecated Use `clearAll()` or `removeByUuid()`.
   * Legacy clear — removes Preferences key.
   */
  async clear(): Promise<void> {
    return this.clearAll();
  }
}
