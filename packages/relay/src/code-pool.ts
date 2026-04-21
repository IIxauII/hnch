/**
 * Code pool — tracks which 6-character room codes (per ADR-0008) are
 * in use and which are quarantined.
 *
 * Two sets back the pool:
 *
 *   - `active`: codes bound to a live `RoomRecord`. Collisions against
 *     these must be retried at mint time.
 *   - `retired`: codes that were active in the recent past but whose
 *     room has been evicted. Per ADR-0008 / ADR-0012, a retired code
 *     is held out of rotation for the snapshot TTL so a returning user
 *     doesn't land in a freshly-minted unrelated room.
 *
 * This commit lays down the mechanics. Actual population of `retired`
 * happens alongside the snapshot TTL sweeper in P3 #4 — until then,
 * `release(code)` immediately puts the code back in rotation via an
 * empty retired set. The API is stable so the sweeper can plug in
 * without a ripple.
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
   * Moves a code out of `active`. The snapshot TTL sweeper (P3 #4)
   * will eventually take it out of the retired set too; until that
   * commit lands, release makes the code immediately available again.
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
      // Retired tracking lands with the snapshot TTL sweeper in P3 #4.
      // Until then the pool treats release as "immediately reusable",
      // which is fine because no code actually gets released in a
      // Phase-3 test run (rooms are not evicted).
    },
    get activeCount(): number {
      return active.size
    },
    get retiredCount(): number {
      return retired.size
    },
  }
}
