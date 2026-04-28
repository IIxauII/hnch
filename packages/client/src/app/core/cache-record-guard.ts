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
 *  - Only write when `status === 'connected'`.
 *  - Skip when `code` or `uuid` is falsy.
 *  - Skip when `uuid === lastRecordedUuid` (already written for this room
 *    on this screen mount — avoids a Preferences write on every Yjs doc
 *    mutation while staying connected).
 */
export function shouldRecordCache(
  code: string | null | undefined,
  uuid: string | null | undefined,
  status: string,
  lastRecordedUuid: string | null,
): boolean {
  if (status !== 'connected') return false
  if (!code || !uuid) return false
  return uuid !== lastRecordedUuid
}
