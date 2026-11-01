import { Injectable, inject, signal, type Signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { deterministicAvatarColor, parseAvatarColor } from '@hnch/shared';

import { ParticipantIdService } from './participant-id.service';

const PREF_KEY = 'hnch.avatarColor';

/**
 * Manages the local user's avatar color preference (ADR-0043).
 *
 * Persists the wire value (an `AccentKey` or `#rrggbb` hex literal) via
 * Capacitor Preferences (`hnch.avatarColor`). On first launch with no
 * stored value, `deterministicAvatarColor(deviceId)` runs and the chosen
 * key is persisted immediately — so the color is stable across launches
 * from the very first session.
 *
 * The chosen value is published into the Yjs participant record via
 * `DocService.open` / `commands.recolor`. This service owns local storage
 * only — no doc writes.
 *
 * Pre-warmed at bootstrap by an `APP_INITIALIZER` so screens can read
 * the signal synchronously.
 */
@Injectable({ providedIn: 'root' })
export class AvatarColorService {
  static readonly PREF_KEY = PREF_KEY;

  private readonly participantIdService = inject(ParticipantIdService);

  private readonly valueSignal = signal<string | null>(null);
  private loading: Promise<string> | null = null;

  /**
   * Current wire value (`AccentKey` or `#rrggbb`). `null` before
   * {@link ensureLoaded} resolves on cold start.
   */
  readonly value: Signal<string | null> = this.valueSignal.asReadonly();

  /**
   * Resolve the stored value, falling back to a deterministic-by-deviceId
   * palette key on first launch and persisting that choice immediately.
   * Safe to call concurrently — a single in-flight promise is shared.
   */
  async ensureLoaded(): Promise<string> {
    const cached = this.valueSignal();
    if (cached) return cached;
    if (this.loading) return this.loading;
    this.loading = this.resolve();
    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }

  /**
   * Persist a new avatar color. Caller passes the raw wire value
   * (palette key or hex literal); we validate via `parseAvatarColor`
   * first and reject malformed input rather than writing garbage.
   *
   * Returns the value actually persisted so the caller (settings UI)
   * can also publish it via `DocService.commands.recolor`.
   */
  async setValue(wire: string): Promise<string> {
    if (parseAvatarColor(wire) === null) {
      throw new Error(`AvatarColorService.setValue: invalid color value "${wire}"`);
    }
    await Preferences.set({ key: PREF_KEY, value: wire });
    this.valueSignal.set(wire);
    return wire;
  }

  private async resolve(): Promise<string> {
    const { value } = await Preferences.get({ key: PREF_KEY });
    if (value && parseAvatarColor(value) !== null) {
      this.valueSignal.set(value);
      return value;
    }
    // First launch (or stored value invalid): seed deterministically
    // and persist so the color is stable from this point onward.
    const deviceId = await this.participantIdService.getOrCreateId();
    const key = deterministicAvatarColor(deviceId);
    await Preferences.set({ key: PREF_KEY, value: key });
    this.valueSignal.set(key);
    return key;
  }
}
