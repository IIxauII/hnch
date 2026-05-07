/**
 * Yjs sync provider wrapper for Node.js (no Angular).
 *
 * Wraps y-websocket's WebsocketProvider with the `ws` package as the
 * WebSocket polyfill. Exposes connection status via callbacks and
 * maps relay close codes to JoinRejectionReason per ADR-0016.
 */

import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';
import WebSocket from 'ws';
import { JOIN_REJECTION_REASONS_BY_CODE, type JoinRejectionReason } from '@hnch/shared';

export type SyncStatus = 'connecting' | 'connected' | 'disconnected';

export interface ConnectOptions {
  /** Base URL of the relay, e.g. `http://localhost:1234`. */
  readonly wsBaseUrl: string;
  /** Room UUID resolved from `GET /rooms/:code`. */
  readonly roomUuid: string;
  /** The local Y.Doc to sync. */
  readonly doc: Y.Doc;
  /** Device/participant ID. */
  readonly deviceId: string;
  /** Password hash for protected rooms. */
  readonly passwordHash?: string;
  /** Pre-created awareness instance to share. */
  readonly awareness?: Awareness;
  /** Called on every status change. */
  readonly onStatusChange?: (status: SyncStatus) => void;
  /** Called when the relay rejects the connection. */
  readonly onRejection?: (reason: JoinRejectionReason) => void;
}

export interface SyncConnection {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  disconnect(): void;
  updateCredentials(opts: { passwordHash?: string | null }): void;
}

/**
 * Open a WebSocket sync connection to the relay.
 *
 * URL shape per ADR-0016: `ws://<host>/ws/<roomUuid>?did=<deviceId>[&pw=<hash>]`
 */
export function connect(opts: ConnectOptions): SyncConnection {
  const wsUrl = opts.wsBaseUrl.replace(/^http/, 'ws');
  const serverUrl = `${wsUrl}/ws`;

  const params: Record<string, string> = { did: opts.deviceId };
  if (opts.passwordHash !== undefined) {
    params['pw'] = opts.passwordHash;
  }

  const provider = new WebsocketProvider(serverUrl, opts.roomUuid, opts.doc, {
    params,
    connect: true,
    ...(opts.awareness !== undefined && { awareness: opts.awareness }),
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
  });

  const onStatus = (ev: { status: SyncStatus }): void => {
    opts.onStatusChange?.(ev.status);
  };

  const onConnectionClose = (event: { code: number } | null): void => {
    if (event === null) return;
    const reason = JOIN_REJECTION_REASONS_BY_CODE.get(event.code);
    if (reason === undefined) return;
    opts.onRejection?.(reason);
    provider.shouldConnect = false;
    provider.disconnect();
  };

  provider.on('status', onStatus);
  provider.on('connection-close', onConnectionClose);

  let disposed = false;
  let currentPasswordHash = opts.passwordHash;
  return {
    doc: opts.doc,
    awareness: provider.awareness,
    updateCredentials(opts: { passwordHash?: string | null }): void {
      if (opts.passwordHash === currentPasswordHash) return;
      currentPasswordHash = opts.passwordHash ?? undefined;
      // Reconnect with new credentials
      provider.shouldConnect = false;
      provider.disconnect();
      // Update params and reconnect
      const did = provider.params['did'] ?? '';
      const params: Record<string, string> = { did };
      if (currentPasswordHash !== undefined) {
        params['pw'] = currentPasswordHash;
      }
      provider.params = params;
      provider.connect();
    },
    disconnect(): void {
      if (disposed) return;
      disposed = true;
      provider.off('status', onStatus);
      provider.off('connection-close', onConnectionClose);
      provider.shouldConnect = false;
      provider.disconnect();
      provider.destroy();
    },
  };
}
