import { Injectable, signal, type Signal } from '@angular/core'
import { Preferences } from '@capacitor/preferences'

/**
 * Persistent per-install participant identifier.
 *
 * Phase-2-only stub for the real identity layer described in
 * ADR-0005 — the Capacitor Device plugin isn't wired yet. The shape
 * of this service mirrors what the Phase-3 swap will expose so no
 * consumer needs to change: one async getter that yields a stable
 * string for the life of the install, plus a sync cached signal for
 * post-bootstrap reads.
 *
 * The key `hnch.participantId` is retired (not migrated) when
 * Phase 3 replaces the value with the real device identifier. Plan
 * §2.2 for the rationale, ADR-0005 for the target design.
 */
@Injectable({ providedIn: 'root' })
export class ParticipantIdService {
  static readonly PARTICIPANT_ID_KEY = 'hnch.participantId'

  private readonly idSignal = signal<string | null>(null)

  /**
   * Readable signal of the cached id, or `null` if {@link getOrCreateId}
   * has not yet resolved. Components should prefer this for synchronous
   * reads once the id is known; anything on a cold start must await
   * {@link getOrCreateId} once first.
   */
  readonly id: Signal<string | null> = this.idSignal.asReadonly()

  /**
   * Resolve the participant id, generating and persisting one on first
   * use. Safe to call multiple times concurrently — the underlying
   * Preferences call is idempotent and the last write wins (and, in
   * the single-client Phase 2 world, there is no contention anyway).
   */
  async getOrCreateId(): Promise<string> {
    const cached = this.idSignal()
    if (cached) return cached

    const { value } = await Preferences.get({
      key: ParticipantIdService.PARTICIPANT_ID_KEY,
    })
    if (value) {
      this.idSignal.set(value)
      return value
    }

    const fresh = crypto.randomUUID()
    await Preferences.set({
      key: ParticipantIdService.PARTICIPANT_ID_KEY,
      value: fresh,
    })
    this.idSignal.set(fresh)
    return fresh
  }
}
