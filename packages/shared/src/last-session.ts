export interface LastSessionEntry {
  readonly roomCode: string;
  readonly roomUuid: string;
  readonly lastSeenAt: number;
  readonly passwordHash?: string;
}

export interface LastSessionCacheV2 {
  readonly version: 2;
  readonly entries: Record<string, LastSessionEntry>;
}

export const LAST_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const LAST_SESSION_MAX_ENTRIES = 5;

// Back-compat shape — referenced by client + cli migration paths only.
export interface LastSessionCacheV1 {
  readonly roomCode: string;
  readonly roomUuid: string;
  readonly lastSeenAt: number;
}

/**
 * Coerce an unknown blob (read from Preferences / JSON file) into a
 * LastSessionCacheV2. Accepts:
 *   - already-v2 shape: returned as-is after structural validation
 *   - v1 shape ({roomCode,roomUuid,lastSeenAt,...}): wrapped into a
 *     single-entry v2 keyed by roomUuid. Any extension fields on the
 *     v1 object (e.g. CLI's top-level passwordHash) are folded onto
 *     the resulting entry; mobile-specific extension fields like
 *     `lastScreen` are intentionally NOT propagated here (consumer
 *     re-records on next join).
 *   - anything else: empty v2 ({version:2, entries:{}}).
 */
export function migrateLastSessionCache(input: unknown): LastSessionCacheV2 {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { version: 2, entries: {} };
  }

  const obj = input as Record<string, unknown>;

  // Detect v2
  if (obj['version'] === 2 && isPlainObject(obj['entries'])) {
    const rawEntries = obj['entries'] as Record<string, unknown>;
    const validatedEntries: Record<string, LastSessionEntry> = {};

    for (const [key, val] of Object.entries(rawEntries)) {
      const entry = validateEntry(val);
      if (entry !== null) {
        validatedEntries[key] = entry;
      }
    }

    return { version: 2, entries: validatedEntries };
  }

  // Detect v1
  if (
    typeof obj['roomCode'] === 'string' &&
    typeof obj['roomUuid'] === 'string' &&
    typeof obj['lastSeenAt'] === 'number'
  ) {
    const entry: LastSessionEntry = {
      roomCode: obj['roomCode'],
      roomUuid: obj['roomUuid'],
      lastSeenAt: obj['lastSeenAt'],
      ...(typeof obj['passwordHash'] === 'string' ? { passwordHash: obj['passwordHash'] } : {}),
    };

    return {
      version: 2,
      entries: { [entry.roomUuid]: entry },
    };
  }

  return { version: 2, entries: {} };
}

// Helper: prune past-TTL entries + clamp future lastSeenAt. Returns
// new map; does not mutate. Caller decides whether to persist.
export function pruneLastSessionEntries(
  cache: LastSessionCacheV2,
  now: number,
  ttlMs: number = LAST_SESSION_TTL_MS,
): LastSessionCacheV2 {
  const pruned: Record<string, LastSessionEntry> = {};

  for (const [key, entry] of Object.entries(cache.entries)) {
    // Drop past-TTL entries
    if (now - entry.lastSeenAt > ttlMs) {
      continue;
    }

    // Clamp future-dated lastSeenAt to now
    if (entry.lastSeenAt > now) {
      pruned[key] = { ...entry, lastSeenAt: now };
    } else {
      pruned[key] = entry;
    }
  }

  return { version: 2, entries: pruned };
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function validateEntry(val: unknown): LastSessionEntry | null {
  if (!isPlainObject(val)) return null;

  const obj = val as Record<string, unknown>;

  if (
    typeof obj['roomCode'] !== 'string' ||
    typeof obj['roomUuid'] !== 'string' ||
    typeof obj['lastSeenAt'] !== 'number'
  ) {
    return null;
  }

  return {
    roomCode: obj['roomCode'],
    roomUuid: obj['roomUuid'],
    lastSeenAt: obj['lastSeenAt'],
    ...(typeof obj['passwordHash'] === 'string' ? { passwordHash: obj['passwordHash'] } : {}),
  };
}
