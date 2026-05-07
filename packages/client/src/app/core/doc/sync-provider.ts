/**
 * Thin wrapper around `y-websocket`'s `WebsocketProvider`.
 *
 * Translates the Phase-3 handshake contract (ADR-0016) — URL shape,
 * query-param credentials, close-code → `JoinRejectionReason` — into
 * an Angular-flavored API: read-only signals for connection status and
 * the most-recent relay rejection, plus a `disconnect()` teardown.
 *
 * Keeping the provider behind this seam means the rest of the client
 * never imports `y-websocket` directly; Phase 5's credential-bearing
 * join path, Phase 3 §3.8's jump-back-in fast path, and any future
 * transport swap all land here without touching call sites.
 */

import { computed, signal, type Signal } from '@angular/core';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import {
  JOIN_REJECTION_REASONS_BY_CODE,
  type JoinCredentials,
  type JoinRejectionReason,
} from '@hnch/shared';
import { WebsocketProvider } from 'y-websocket';
import type { ToastService } from '../../services/toast.service';

/**
 * Connection state exposed to the UI. Mirrors the y-websocket `status`
 * event's three values exactly so a chip can bind directly.
 */
export type SyncStatus = 'connecting' | 'connected' | 'disconnected';

export interface SyncProviderOptions {
  /** Base URL of the relay, e.g. `ws://localhost:1234` (no trailing slash). */
  readonly wsBaseUrl: string;
  /** Room UUID resolved from `GET /rooms/:code` (ADR-0016). */
  readonly roomUuid: string;
  /** Local `Y.Doc` the provider will sync. */
  readonly doc: Y.Doc;
  /** Credentials — `deviceId` is required, the rest are Phase-5 fields. */
  readonly credentials: JoinCredentials;
  /**
   * Awareness instance to share with the provider. Optional — if omitted,
   * `y-websocket` creates and owns a fresh one accessible via `awareness`.
   */
  readonly awareness?: Awareness;
  /**
   * Override `WebSocket` — useful in Node-side tests. Defaults to the
   * browser-global `WebSocket`.
   */
  readonly WebSocketPolyfill?: typeof WebSocket;
  /**
   * Fires on every `y-websocket` `status` event. Lets callers mirror
   * status into their own reactive state without subscribing to the
   * returned signal — the signal is maintained in parallel for UIs that
   * want to bind directly.
   */
  readonly onStatusChange?: (status: SyncStatus) => void;
  /**
   * Fires once when the relay closes the socket with a private-use
   * code from ADR-0016's table. `null` is passed on successful
   * (re)connect to clear any prior rejection surfaced to the UI.
   */
  readonly onRejectionChange?: (reason: JoinRejectionReason | null) => void;
  /**
   * Fires exactly once on the first successful Yjs sync with the relay
   * (the moment `provider.synced` transitions to `true`). Callers use
   * this to perform post-sync mutations whose Lamport clock must be
   * higher than any op in the relay snapshot — e.g. clearing a stale
   * `leftAt` for a rejoining participant (ADR-0036).
   */
  readonly onSynced?: () => void;
  /**
   * Toast service for displaying user-facing errors. Optional — if omitted,
   * repeat-rejection warnings are silently suppressed (useful for tests).
   */
  readonly toastService?: ToastService;
}

/**
 * Public handle. Components read `status` / `lastRejection` / `reconnecting`
 * as signals and call `disconnect()` on session teardown.
 */
export interface SyncProvider {
  readonly status: Signal<SyncStatus>;
  /**
   * Set to the decoded `JoinRejectionReason` if the relay closes the
   * socket with a private-use code from ADR-0016's table. Reset to
   * `null` on any subsequent successful connect.
   */
  readonly lastRejection: Signal<JoinRejectionReason | null>;
  /**
   * True while the provider is attempting to reconnect after a transient
   * disconnect (network error, unexpected close, no relay-issued close code).
   * False when connected, permanently rejected, or manually disconnected.
   */
  readonly reconnecting: Signal<boolean>;
  /** The underlying awareness instance — shared with `y-websocket`. */
  readonly awareness: Awareness;
  /**
   * Stop reconnecting, close the socket, and release observers. Safe
   * to call multiple times.
   */
  disconnect(): void;
}

/**
 * Build the URL-param bag for the WS upgrade per ADR-0016. Kept out
 * of the main factory so the mapping is unit-testable on its own.
 */
export function credentialsToParams(credentials: JoinCredentials): Record<string, string> {
  const params: Record<string, string> = { did: credentials.deviceId };
  if (credentials.passwordHash !== undefined) {
    params['pw'] = credentials.passwordHash;
  }
  if (credentials.inviteToken !== undefined) {
    params['inv'] = credentials.inviteToken;
  }
  return params;
}

/**
 * Opens a `WebsocketProvider` against the relay's `/ws/:uuid` endpoint
 * (ADR-0016) and returns a signal-backed handle.
 *
 * `wsBaseUrl` should end in `/ws`'s parent — the provider appends
 * `/<roomname>`, so we pass `${wsBaseUrl}/ws` as the server URL and
 * `roomUuid` as the roomname, yielding `${wsBaseUrl}/ws/${roomUuid}`.
 */
export function createSyncProvider(opts: SyncProviderOptions): SyncProvider {
  const status = signal<SyncStatus>('connecting');
  const lastRejection = signal<JoinRejectionReason | null>(null);
  // True once the user explicitly calls disconnect() — suppresses reconnecting
  // state so the UI does not show a spurious "reconnecting" banner on teardown.
  const manuallyDisconnected = signal(false);
  // Rolling buffer for unknown close-code timestamps — triggers toast on 3+ events in 60s.
  const unknownCloseCodeTimestamps: number[] = [];
  // Collectors of synced listeners so disconnect() can detach them.
  const syncedListeners: Array<(isSynced: boolean) => void> = [];

  // Reconnecting: WS is not connected, no permanent rejection has been issued,
  // and we have not intentionally torn down the session.
  const reconnecting = computed(
    () => status() !== 'connected' && lastRejection() === null && !manuallyDisconnected(),
  );

  const serverUrl = `${opts.wsBaseUrl}/ws`;
  const params = credentialsToParams(opts.credentials);

  const provider = new WebsocketProvider(serverUrl, opts.roomUuid, opts.doc, {
    params,
    connect: true,
    ...(opts.awareness !== undefined && { awareness: opts.awareness }),
    ...(opts.WebSocketPolyfill !== undefined && {
      WebSocketPolyfill: opts.WebSocketPolyfill,
    }),
  });

  const onStatus = (ev: { status: SyncStatus }): void => {
    status.set(ev.status);
    opts.onStatusChange?.(ev.status);
    // A successful (re)connect invalidates any prior rejection — the
    // relay accepted us, so clear the surfaced reason.
    if (ev.status === 'connected') {
      lastRejection.set(null);
      opts.onRejectionChange?.(null);
      // Clear rolling buffer to prevent accumulation in long sessions.
      unknownCloseCodeTimestamps.length = 0;
    }
  };

  const onConnectionClose = (event: CloseEvent | null): void => {
    if (event === null) return;
    const reason = JOIN_REJECTION_REASONS_BY_CODE.get(event.code);
    if (reason === undefined) {
      // Transient failure (network drop, no relay-issued code, unexpected
      // close). y-websocket's built-in exponential-backoff reconnect loop
      // will fire via the setTimeout in closeWebsocketConnection — do NOT
      // set shouldConnect = false here. reconnecting signal becomes truthy
      // automatically because status transitions to 'disconnected'.

      // Rolling buffer for repeat unknown close codes.
      const now = Date.now();
      unknownCloseCodeTimestamps.push(now);
      // Trim entries older than 60s.
      const cutoff = now - 60_000;
      while (unknownCloseCodeTimestamps.length > 0 && unknownCloseCodeTimestamps[0]! < cutoff) {
        unknownCloseCodeTimestamps.shift();
      }
      // Trigger toast if 3+ events in the window.
      if (unknownCloseCodeTimestamps.length >= 3) {
        opts.toastService?.error('Trouble reaching the room — retrying.');
        unknownCloseCodeTimestamps.length = 0;
      }
      return;
    }
    // Permanent relay rejection — retry won't help. Stop the reconnect
    // loop so the UI can route the user somewhere appropriate.
    lastRejection.set(reason);
    opts.onRejectionChange?.(reason);
    provider.shouldConnect = false;
    provider.disconnect();
  };

  provider.on('status', onStatus);
  provider.on('connection-close', onConnectionClose);

  // One-shot synced listener: fires when the relay's Yjs sync step 2 is
  // received (provider.synced transitions to true). Used to run post-sync
  // mutations with a Lamport clock higher than the relay snapshot, e.g.
  // clearing a stale leftAt for a rejoining participant (ADR-0036).
  if (opts.onSynced !== undefined) {
    // `'synced'` is emitted by y-websocket but absent from the TypeScript
    // overloads on `WebsocketProvider`. Cast through `unknown` to call it.
    const providerAny = provider as unknown as {
      on(event: string, fn: (isSynced: boolean) => void): void;
      off(event: string, fn: (isSynced: boolean) => void): void;
    };
    const onSynced = (isSynced: boolean): void => {
      if (!isSynced) return;
      providerAny.off('synced', onSynced);
      opts.onSynced!();
    };
    syncedListeners.push(onSynced);
    providerAny.on('synced', onSynced);
  }

  // window online/offline listeners — handle network interface changes that
  // may not close the WebSocket immediately (e.g. Chromium offline mode,
  // flaky Wi-Fi transitions where the socket stays open until the next byte).
  const onOffline = (): void => {
    if (manuallyDisconnected()) return;
    status.set('disconnected');
    opts.onStatusChange?.('disconnected');
  };

  const onOnline = (): void => {
    if (manuallyDisconnected() || lastRejection() !== null) return;
    if (status() !== 'connected') {
      // y-websocket's connect() is a no-op when ws !== null (stale socket still
      // open — Chromium offline mode doesn't close sockets immediately). Force
      // the socket closed so the onclose handler fires and schedules setupWS.
      // Reset wsUnsuccessfulReconnects first so the backoff is 100 ms, not
      // seconds from prior failed attempts.
      if (provider.ws !== null) {
        provider.wsUnsuccessfulReconnects = 0;
        provider.ws.close();
      } else {
        provider.connect();
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
  }

  let disposed = false;
  const syncProvider = {
    status,
    lastRejection,
    reconnecting,
    awareness: provider.awareness,
    /**
     * Escape hatch for unit tests — not part of the public `SyncProvider`
     * interface. Lets tests emit events on the underlying `WebsocketProvider`
     * (e.g. `'synced'`) without going through a full WS handshake.
     *
     * @internal
     */
    _rawProvider: provider,
    disconnect(): void {
      if (disposed) return;
      disposed = true;
      manuallyDisconnected.set(true);
      provider.off('status', onStatus);
      provider.off('connection-close', onConnectionClose);
      if (syncedListeners.length > 0) {
        const providerAny = provider as unknown as {
          off(event: string, fn: (isSynced: boolean) => void): void;
        };
        for (const listener of syncedListeners) {
          providerAny.off('synced', listener);
        }
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('offline', onOffline);
        window.removeEventListener('online', onOnline);
      }
      provider.shouldConnect = false;
      provider.disconnect();
      provider.destroy();
    },
  };

  return syncProvider;
}
