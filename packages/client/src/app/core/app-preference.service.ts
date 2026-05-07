import { computed, Injectable, signal, type Signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/**
 * App-wide preference persistence — relay URL override, default session name, default password flag.
 *
 * Persists three values under Capacitor Preferences:
 *   - `hnch.defaultSessionName` — user's preferred session/room name
 *   - `hnch.defaultPassword`    — boolean, whether to prompt for password by default
 *   - `hnch.relayUrl`           — override relay HTTP URL (computed to WebSocket URL)
 *
 * Exposes signals so settings screens can react without polling. An `APP_INITIALIZER`
 * pre-warms {@link ensureLoaded} so every screen reads synchronously after bootstrap.
 */
@Injectable({ providedIn: 'root' })
export class AppPreferenceService {
  static readonly DEFAULT_SESSION_NAME_KEY = 'hnch.defaultSessionName';
  static readonly DEFAULT_PASSWORD_KEY = 'hnch.defaultPassword';
  static readonly RELAY_URL_KEY = 'hnch.relayUrl';

  private readonly defaultSessionNameSignal = signal<string | undefined>(undefined);
  private readonly defaultPasswordSignal = signal<boolean>(false);
  private readonly relayHttpUrlSignal = signal<string | undefined>(undefined);

  /** User's preferred default session/room name. */
  readonly defaultSessionName: Signal<string | undefined> =
    this.defaultSessionNameSignal.asReadonly();

  /** Whether to prompt for password by default when creating a room. */
  readonly defaultPassword: Signal<boolean> = this.defaultPasswordSignal.asReadonly();

  /** Override relay HTTP URL (falls back to environment.relayHttpUrl if undefined). */
  readonly relayHttpUrl: Signal<string | undefined> = this.relayHttpUrlSignal.asReadonly();

  /**
   * Computed relay WebSocket URL derived from relayHttpUrl.
   * Transforms http → ws, https → wss. Returns undefined when no override is set;
   * consumers should fall back to environment.relayWsUrl.
   */
  readonly relayWsUrl: Signal<string | undefined> = computed(() => {
    const httpUrl = this.relayHttpUrlSignal();
    if (!httpUrl) return undefined;
    return httpUrl.replace(/^https?:\/\//, (match) => (match === 'https://' ? 'wss://' : 'ws://'));
  });

  private loading: Promise<void> | null = null;

  /** Pre-warm from Preferences — call once via `APP_INITIALIZER`. */
  async ensureLoaded(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.load();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  /**
   * Set the default session name. Persisted to Preferences.
   * Pass undefined to clear.
   */
  async setDefaultSessionName(name: string | undefined): Promise<void> {
    this.defaultSessionNameSignal.set(name);
    if (name === undefined) {
      await Preferences.remove({
        key: AppPreferenceService.DEFAULT_SESSION_NAME_KEY,
      });
    } else {
      await Preferences.set({
        key: AppPreferenceService.DEFAULT_SESSION_NAME_KEY,
        value: name,
      });
    }
  }

  /**
   * Set the default password flag. Persisted to Preferences.
   */
  async setDefaultPassword(usePassword: boolean): Promise<void> {
    this.defaultPasswordSignal.set(usePassword);
    await Preferences.set({
      key: AppPreferenceService.DEFAULT_PASSWORD_KEY,
      value: JSON.stringify(usePassword),
    });
  }

  /**
   * Set the relay HTTP URL override. Persisted to Preferences.
   * Pass undefined to clear (fallback to environment).
   * relayWsUrl is automatically computed from this.
   */
  async setRelayUrl(httpUrl: string | undefined): Promise<void> {
    this.relayHttpUrlSignal.set(httpUrl);
    if (httpUrl === undefined) {
      await Preferences.remove({
        key: AppPreferenceService.RELAY_URL_KEY,
      });
    } else {
      await Preferences.set({
        key: AppPreferenceService.RELAY_URL_KEY,
        value: httpUrl,
      });
    }
  }

  private async load(): Promise<void> {
    const [nameResult, passwordResult, relayResult] = await Promise.all([
      Preferences.get({ key: AppPreferenceService.DEFAULT_SESSION_NAME_KEY }),
      Preferences.get({ key: AppPreferenceService.DEFAULT_PASSWORD_KEY }),
      Preferences.get({ key: AppPreferenceService.RELAY_URL_KEY }),
    ]);

    if (nameResult.value) {
      this.defaultSessionNameSignal.set(nameResult.value);
    }

    if (passwordResult.value) {
      const parsed = tryParse(passwordResult.value);
      if (typeof parsed === 'boolean') {
        this.defaultPasswordSignal.set(parsed);
      }
    }

    if (relayResult.value) {
      this.relayHttpUrlSignal.set(relayResult.value);
    }
  }
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function tryParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
