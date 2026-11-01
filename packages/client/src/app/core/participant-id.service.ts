import { Injectable, signal, type Signal } from '@angular/core';
import { Device } from '@capacitor/device';
import { Preferences } from '@capacitor/preferences';

/**
 * Persistent per-install participant identifier — ADR-0005.
 *
 * Resolution order, single-shot on first access:
 *
 *   1. If Preferences holds a legacy `hnch.participantId` (minted by
 *      the early `crypto.randomUUID()` stub), keep using it. That build
 *      had no durable sessions, so the only thing this preserves is
 *      the user's display-name binding across the upgrade. See the
 *      schema-version comment below for the eventual retirement path.
 *   2. Otherwise, ask the Capacitor Device plugin for a stable id
 *      (`Device.getId().identifier`). On iOS/Android that's the
 *      platform-native vendor identifier; on web the plugin generates
 *      and persists one via localStorage on our behalf.
 *
 * The chosen id is cached on the service's signal so screens and
 * guards can read it synchronously after bootstrap. An
 * `APP_INITIALIZER` pre-warms {@link ensureLoaded} so consumers never
 * race the first-access promise.

 */
@Injectable({ providedIn: 'root' })
export class ParticipantIdService {
  static readonly PARTICIPANT_ID_KEY = 'hnch.participantId';

  private readonly idSignal = signal<string | null>(null);
  private loading: Promise<string> | null = null;

  /**
   * Readable signal of the cached id, or `null` if {@link ensureLoaded}
   * (or {@link getOrCreateId}) has not yet resolved. Post-bootstrap
   * reads are synchronous thanks to the `APP_INITIALIZER` harness in
   * `main.ts`; anything on a cold start must await once first.
   */
  readonly id: Signal<string | null> = this.idSignal.asReadonly();

  /**
   * Resolve the participant id, draining the legacy key first
   * and falling back to `Device.getId()` for fresh installs. Safe to
   * call concurrently — a single in-flight promise is shared so we
   * never double-read the Preferences backing store.
   */
  async getOrCreateId(): Promise<string> {
    const cached = this.idSignal();
    if (cached) return cached;
    if (this.loading) return this.loading;

    this.loading = this.resolve();
    try {
      const id = await this.loading;
      return id;
    } finally {
      // Clear the in-flight handle either way; subsequent calls read
      // straight from the signal without re-hitting the plugin bridge.
      this.loading = null;
    }
  }

  /**
   * Alias for {@link getOrCreateId}. Named for the `APP_INITIALIZER`
   * call site — "ensure this is loaded before the app
   * paints" is the intent at bootstrap, not "create if missing".
   */
  async ensureLoaded(): Promise<string> {
    return this.getOrCreateId();
  }

  private async resolve(): Promise<string> {
    // Migration read: keep the legacy stub id if present.
    // We intentionally do NOT overwrite it with the Device id — doing
    // so would detach the display-name binding on upgrade. Once we
    // bump a `schemaVersion` in a later phase, this branch can retire.
    const legacy = await Preferences.get({
      key: ParticipantIdService.PARTICIPANT_ID_KEY,
    });
    if (legacy.value) {
      this.idSignal.set(legacy.value);
      return legacy.value;
    }

    // Fresh install path: ADR-0005's Device.getId(). Capacitor's web
    // backend generates + persists a UUID via localStorage, so the same
    // code path works under PWA, Capacitor iOS, and Capacitor Android.
    const { identifier } = await Device.getId();
    // We still stash it under the legacy key so a future Preferences
    // read cold-start hits the same branch. This keeps
    // `crypto.randomUUID()` and `Device.getId()` installs converging
    // on one storage slot, which simplifies the eventual schema-bump
    // migration.
    await Preferences.set({
      key: ParticipantIdService.PARTICIPANT_ID_KEY,
      value: identifier,
    });
    this.idSignal.set(identifier);
    return identifier;
  }
}
