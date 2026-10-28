/**
 * Pure helper for the last-session cache-write dedup logic used in
 * LobbyPage and EstimatingPage constructor effects.
 *
 * Separated into its own file so it can be unit-tested without
 * constructing a full Angular component.
 */

/**
 * Returns `true` when the cache should be written for this (uuid, screen)
 * combination.
 *
 * Rules:
 *  - Only write once the session is `joined`: the socket is up *and* the
 *    relay has synced. An open socket alone is not the relay saying yes — it
 *    accepts the socket before it refuses a wrong password (ADR-0035) — and
 *    a record made on it would store a hash the relay is about to reject.
 *  - Skip when `code` or `uuid` is falsy.
 *  - Skip when `uuid === lastRecordedUuid` (already written for this room
 *    on this screen mount — avoids a Preferences write on every Yjs doc
 *    mutation while staying connected).
 */
export function shouldRecordCache(
  code: string | null | undefined,
  uuid: string | null | undefined,
  joined: boolean,
  lastRecordedUuid: string | null,
): boolean {
  if (!joined) return false;
  if (!code || !uuid) return false;
  return uuid !== lastRecordedUuid;
}
