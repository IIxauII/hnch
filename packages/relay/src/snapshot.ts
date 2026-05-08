/**
 * Snapshot TTL sweeper per ADR-0012.
 *
 * Rooms live entirely in RAM. A room with at least one connected peer
 * is kept. A room with zero connections is kept for up to the TTL
 * (default 24h, per ADR-0012) so that a returning peer — the "closed
 * the tab during stand-up, opened it again after lunch" case — still
 * lands in the same session. Once the TTL elapses the sweeper evicts
 * the room: it leaves the indexes, its code is released back to the
 * pool, and the `Y.Doc` / `Awareness` are torn down.
 *
 * The sweeper is driven by `setInterval` for simplicity; the cadence
 * is generous (once per hour by default) because the eviction decision
 * is cheap and "a few minutes of extra retention past the TTL" is
 * within the spirit of the ADR. `sweep()` is also exposed directly so
 * tests can trigger it deterministically with an injected `now`.
 */

import type { RoomStore } from './room-store.js';

/** Default TTL: 24 hours, per ADR-0012. */
export const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
/** Default sweep cadence: once per hour. */
export const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export interface SnapshotSweeperOptions {
  /** Override the retention window. Tests typically set this to a few ms. */
  readonly ttlMs?: number;
  /** Override the sweep cadence. Tests typically pass `start: false` instead. */
  readonly intervalMs?: number;
  /** Wall-clock source, injectable for deterministic tests. */
  readonly now?: () => number;
  /**
   * When `false`, the sweeper does not schedule its own interval; the
   * caller drives sweeps via `sweep()`. Useful in tests.
   */
  readonly start?: boolean;
}

export interface SnapshotSweeper {
  /** Runs a single eviction pass against the store. */
  sweep(): void;
  /** Cancels the scheduled interval, if one was started. */
  stop(): void;
}

export function createSnapshotSweeper(
  store: RoomStore,
  options: SnapshotSweeperOptions = {},
): SnapshotSweeper {
  const ttlMs = options.ttlMs ?? SNAPSHOT_TTL_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  const now = options.now ?? Date.now;

  function sweep(): void {
    const cutoff = now() - ttlMs;
    // Collect first, delete second, so we aren't mutating the map
    // underneath `listRooms()`'s iterator.
    const toDelete: string[] = [];
    for (const record of store.listRooms()) {
      if (
        record.connections === 0 &&
        record.lastEmptyAt !== undefined &&
        record.lastEmptyAt <= cutoff
      ) {
        toDelete.push(record.uuid);
      }
    }
    for (const uuid of toDelete) {
      store.deleteRoom(uuid);
    }
  }

  let handle: ReturnType<typeof setInterval> | undefined;
  if (options.start !== false) {
    handle = setInterval(sweep, intervalMs);
    // Don't keep the event loop alive just for the sweeper — the
    // server's own listening socket is the canonical keep-alive.
    handle.unref?.();
  }

  return {
    sweep,
    stop(): void {
      if (handle !== undefined) {
        clearInterval(handle);
        handle = undefined;
      }
    },
  };
}
