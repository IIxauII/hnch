import { Injectable } from '@angular/core'
import { Preferences } from '@capacitor/preferences'

/**
 * The three screens that count as "inside a session" for the purposes
 * of the jump-back-in cache (plan §2.3). Matches the Phase-3 route
 * set; if we add a fourth in-session screen later, extend this union
 * and the `isLastSessionScreen` guard.
 */
export type LastSessionScreen = 'lobby' | 'estimating' | 'revealed'

/**
 * Aspirational "resume this session" cache, persisted via Capacitor
 * Preferences under `hnch.lastSession`. The shape is verbatim from
 * plan §2.3 — no participantCount, no scale id, just the two
 * identifiers we need for a fast-path rejoin plus the screen we were
 * last on.
 *
 * "Aspirational" because nothing on the device guarantees the relay
 * still knows about the room — the snapshot TTL is 24 h
 * (ADR-0012). Consumers must tolerate a `close(4404)` /
 * `unknown-room` response and fall back to Home + clear this entry.
 */
export interface LastSessionCache {
  /** Normalized room code (no dash, uppercase) — ADR-0008. */
  readonly roomCode: string
  /** The UUID the relay minted for this room — ADR-0016. */
  readonly roomUuid: string
  /** Last rendered in-session screen; drives where rejoin lands. */
  readonly lastScreen: LastSessionScreen
  /** Epoch ms of the last write; anything older than `TTL_MS` is stale. */
  readonly lastSeenAt: number
}

/**
 * Thin Preferences wrapper backing the Home-screen "Jump back in"
 * banner. All reads are async because Preferences is async on native
 * and we want to keep one code path; the banner tolerates a single
 * tick of nullness on cold start.
 *
 * The TTL is matched to ADR-0012's 24-hour relay snapshot retention:
 * anything past that will inevitably 404 on rejoin, so we prefilter
 * here instead of round-tripping. Note this does *not* sweep stale
 * entries eagerly — it only drops them when something reads the
 * cache. That's fine; the banner is the only consumer.
 */
@Injectable({ providedIn: 'root' })
export class LastSessionService {
  static readonly LAST_SESSION_KEY = 'hnch.lastSession'
  static readonly TTL_MS = 24 * 60 * 60 * 1000

  /**
   * Fetch the cached entry, transparently clearing and returning
   * `null` if the entry is malformed or past TTL. Tests may inject
   * `now` to pin the clock.
   */
  async get(opts: { now?: () => number } = {}): Promise<LastSessionCache | null> {
    const { value } = await Preferences.get({
      key: LastSessionService.LAST_SESSION_KEY,
    })
    if (!value) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      // Preferences can hold arbitrary strings from past schemas;
      // treat a bad parse as "no cache".
      await this.clear()
      return null
    }
    if (!isLastSessionCache(parsed)) {
      await this.clear()
      return null
    }

    const now = opts.now?.() ?? Date.now()
    if (now - parsed.lastSeenAt > LastSessionService.TTL_MS) {
      await this.clear()
      return null
    }
    return parsed
  }

  /**
   * Write or refresh the cache entry for the current session. Called
   * from every in-session screen's constructor; `lastSeenAt` is stamped
   * at call time so the TTL is measured from the last live interaction.
   */
  async record(
    payload: {
      roomCode: string
      roomUuid: string
      lastScreen: LastSessionScreen
    },
    opts: { now?: () => number } = {},
  ): Promise<void> {
    const entry: LastSessionCache = {
      roomCode: payload.roomCode,
      roomUuid: payload.roomUuid,
      lastScreen: payload.lastScreen,
      lastSeenAt: opts.now?.() ?? Date.now(),
    }
    await Preferences.set({
      key: LastSessionService.LAST_SESSION_KEY,
      value: JSON.stringify(entry),
    })
  }

  /** Drop the cache entry — called on "Leave session" and `unknown-room`. */
  async clear(): Promise<void> {
    await Preferences.remove({
      key: LastSessionService.LAST_SESSION_KEY,
    })
  }
}

function isLastSessionScreen(v: unknown): v is LastSessionScreen {
  return v === 'lobby' || v === 'estimating' || v === 'revealed'
}

function isLastSessionCache(v: unknown): v is LastSessionCache {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o['roomCode'] === 'string' &&
    typeof o['roomUuid'] === 'string' &&
    typeof o['lastSeenAt'] === 'number' &&
    isLastSessionScreen(o['lastScreen'])
  )
}
