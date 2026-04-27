/**
 * Code pool — tracks which 6-character room codes (per ADR-0008) are
 * in use and which are quarantined.
 *
 * Two sets back the pool:
 *
 *   - `active`: codes bound to a live `RoomRecord`. Collisions against
 *     these must be retried at mint time.
 *   - `retired`: reserved for an additional defense-in-depth quarantine
 *     window. Currently unpopulated — see note on `release` below.
 *
 * Per ADR-0008 / ADR-0012, a retired code must be held out of rotation
 * for the snapshot TTL so a returning user doesn't land in a freshly
 * minted unrelated room. In practice that quarantine is enforced by
 * the `RoomStore`: a room (and therefore its code's `active` entry) is
 * only deleted by the snapshot sweeper after the 24h TTL elapses on an
 * empty room, at which point `RoomRecord.deleteRoom()` calls
 * `release(code)`. So codes are effectively retired for the full TTL
 * window via the room's own lifetime, not via this `retired` set.
 *
 * The `retired` set (and the corresponding miss in `mint`) is kept as
 * scaffolding for a future ADR that may want to add an explicit cooldown
 * window on top of the room-lifetime quarantine — for example to absorb
 * sweep-cadence jitter. Until that lands, `retired` stays empty and
 * `release` puts the code straight back into rotation.
 */

import { generateRoomCode } from '@hnch/shared'

/** How many times to retry code generation before giving up. */
const DEFAULT_MAX_ATTEMPTS = 64

export interface CodePoolOptions {
  /**
   * Source of new candidate codes. Defaults to `generateRoomCode`
   * from `@hnch/shared`. Tests inject a deterministic generator to
   * exercise the collision-retry path.
   */
  readonly generator?: () => string
  /**
   * Cap on collision retries. The 31^6 ≈ 887M code space means we
   * will never approach this with a real generator, but a faulty
   * injected generator must still terminate.
   */
  readonly maxAttempts?: number
}

export interface CodePool {
  /**
   * Generates a code that is not in the active or retired set, marks
   * it active, and returns it. Throws after `maxAttempts` collisions.
   */
  mint(): string
  /**
   * Moves a code out of `active`. Today this is only called by
   * `RoomRecord.deleteRoom()` after the snapshot sweeper drops a room
   * whose 24h TTL has elapsed, so the code has already been quarantined
   * for at least that TTL via the room's own lifetime. The `retired`
   * set is left untouched — see the file header for why it exists but
   * is currently unpopulated.
   */
  release(code: string): void
  /** Inspection helpers for tests and `/health` style probes. */
  readonly activeCount: number
  readonly retiredCount: number
}

export function createCodePool(options: CodePoolOptions = {}): CodePool {
  const generator = options.generator ?? generateRoomCode
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS

  const active = new Set<string>()
  const retired = new Set<string>()

  return {
    mint(): string {
      for (let i = 0; i < maxAttempts; i++) {
        const candidate = generator()
        if (!active.has(candidate) && !retired.has(candidate)) {
          active.add(candidate)
          return candidate
        }
      }
      throw new Error(
        `code pool: unable to mint a unique code after ${maxAttempts} attempts`,
      )
    },
    release(code: string): void {
      active.delete(code)
      // The TTL-bound quarantine required by ADR-0008 is enforced by
      // the caller: `RoomRecord.deleteRoom()` only fires after the
      // snapshot sweeper has held the room (and thus this `active`
      // entry) for the full 24h TTL. The `retired` set stays empty;
      // see the file header for the rationale.
    },
    get activeCount(): number {
      return active.size
    },
    get retiredCount(): number {
      return retired.size
    },
  }
}
