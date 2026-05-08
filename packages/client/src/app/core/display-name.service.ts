import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Persistent display-name + pending-join-URL storage.
 *
 * Uses Capacitor Preferences so the same code path works on web (via
 * localStorage under the hood) and on native (KeyChain on iOS,
 * SharedPreferences on Android). See ADR-0005 for identity strategy
 * and ux.md §2 for the onboarding flow this feeds.
 *
 * Keys are namespaced under `hnch.` to avoid collision with any
 * other data the bundled webview might persist.
 */
@Injectable({ providedIn: 'root' })
export class DisplayNameService {
  static readonly DISPLAY_NAME_KEY = 'hnch.displayName';
  static readonly PENDING_JOIN_URL_KEY = 'hnch.pendingJoinUrl';

  async getDisplayName(): Promise<string | null> {
    const { value } = await Preferences.get({
      key: DisplayNameService.DISPLAY_NAME_KEY,
    });
    return value;
  }

  async setDisplayName(name: string): Promise<void> {
    await Preferences.set({
      key: DisplayNameService.DISPLAY_NAME_KEY,
      value: name,
    });
  }

  async getPendingJoinUrl(): Promise<string | null> {
    const { value } = await Preferences.get({
      key: DisplayNameService.PENDING_JOIN_URL_KEY,
    });
    return value;
  }

  async setPendingJoinUrl(url: string): Promise<void> {
    await Preferences.set({
      key: DisplayNameService.PENDING_JOIN_URL_KEY,
      value: url,
    });
  }

  async clearPendingJoinUrl(): Promise<void> {
    await Preferences.remove({
      key: DisplayNameService.PENDING_JOIN_URL_KEY,
    });
  }
}
