/**
 * The relay contract — one module, both surfaces.
 *
 * Everything a client needs to talk to the relay lives here: the three
 * HTTP routes (ADR-0016) and the WebSocket handshake that follows them.
 * The Angular client and the CLI both import this directly; neither
 * keeps a local copy, so the contract cannot drift between them.
 *
 * HTTP routes:
 *
 *   - `POST /rooms` → `{ uuid, code }` — mints a fresh room; the
 *     response pairs the UUID the y-websocket layer uses as the roomname
 *     with the 6-character code the UI surfaces for Join.
 *   - `GET /rooms/:code` → `{ uuid, accessMode }` — resolves a code to a
 *     UUID ahead of the WS upgrade; 404 with `{ reason }` on miss.
 *   - `PATCH /rooms/:uuid/access` → `{ accessMode }` — sets or clears the
 *     room password on a live room (ADR-0017).
 *
 * Handshake (ADR-0016): `${wsBase}/ws/${roomUuid}?did=…[&pw=…]`, with
 * private-use close codes 4000–4099 decoding to a
 * {@link JoinRejectionReason}.
 *
 * `connectToRelay` takes the **http** base URL and derives the ws form
 * itself ({@link relayHttpToWsUrl}), so the transform exists once.
 *
 * Framework-free by construction: state leaves through callbacks, never
 * signals, and no `ToastService`/Ink/Angular primitive crosses the seam.
 * Unlike a *driver* (`startElection`, `startAutoReveal`), `relay-client`
 * owns a connection rather than a re-evaluation rule, so `Y.Doc` and
 * `Awareness` do cross this boundary — handing a doc to a transport is
 * the module's entire job.
 */

import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';
import {
  JOIN_REJECTION_REASONS_BY_CODE,
  type JoinCredentials,
  type JoinRejectionReason,
} from './auth.js';

// ---------------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------------

/** Successful response to `POST /rooms`. Mirrors the relay's type. */
export interface MintedRoom {
  readonly uuid: string;
  readonly code: string;
}

/**
 * Access mode reported by `GET /rooms/:code`. Mirrors the relay's
 * `AccessMode` wire shape — `'invite'` is still computed there from
 * `invitesOutstanding` even though ADR-0017 dropped invite-only from v1.
 */
export type ResolvedAccessMode = 'open' | 'password' | 'invite';

/** Successful response to `GET /rooms/:code`. */
export interface ResolvedRoom {
  readonly uuid: string;
  readonly accessMode: ResolvedAccessMode;
}

/** Response from `PATCH /rooms/:uuid/access` (ADR-0017). */
export interface PatchAccessResponse {
  readonly accessMode: ResolvedAccessMode;
}

/**
 * Thrown when the relay rejects a resolve lookup with a 4xx that maps
 * to a {@link JoinRejectionReason}. Carries the reason so callers can
 * route the UI without re-parsing the body.
 */
export class RelayRejectionError extends Error {
  constructor(readonly reason: JoinRejectionReason) {
    super(`relay rejected resolve: ${reason}`);
    this.name = 'RelayRejectionError';
  }
}

export interface MintRoomOptions {
  readonly passwordHash?: string;
}

/** `POST /rooms` — mints a fresh room, optionally password-protected (ADR-0017). */
export async function mintRoom(
  httpBaseUrl: string,
  options?: MintRoomOptions,
): Promise<MintedRoom> {
  const res = await fetch(`${httpBaseUrl}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options?.passwordHash ? { passwordHash: options.passwordHash } : {}),
  });
  if (!res.ok) {
    throw new Error(`POST /rooms failed: ${res.status}`);
  }
  return (await res.json()) as MintedRoom;
}

/**
 * `GET /rooms/:code`. Throws {@link RelayRejectionError} on a 404 the relay
 * reports as `{ reason }`; any other non-ok status surfaces as a generic `Error`.
 */
export async function resolveRoom(httpBaseUrl: string, code: string): Promise<ResolvedRoom> {
  const res = await fetch(`${httpBaseUrl}/rooms/${encodeURIComponent(code)}`);
  if (res.status === 404) {
    const body = (await res.json().catch(() => null)) as {
      reason?: JoinRejectionReason;
    } | null;
    throw new RelayRejectionError(body?.reason ?? 'unknown-room');
  }
  if (!res.ok) {
    throw new Error(`GET /rooms/:code failed: ${res.status}`);
  }
  return (await res.json()) as ResolvedRoom;
}

/**
 * `PATCH /rooms/:uuid/access` — set or remove the password on a live room.
 * Pass `passwordHash` to protect, `null` to revert to open. Returns the
 * resulting access mode so callers can confirm without a follow-up read.
 */
export async function patchRoomAccess(
  httpBaseUrl: string,
  uuid: string,
  passwordHash: string | null,
): Promise<PatchAccessResponse> {
  const res = await fetch(`${httpBaseUrl}/rooms/${uuid}/access`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passwordHash }),
  });
  if (!res.ok) {
    throw new Error(`PATCH /rooms/:uuid/access failed: ${res.status}`);
  }
  return (await res.json()) as PatchAccessResponse;
}

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

/**
 * Connection state. Mirrors the y-websocket `status` event's three
 * values exactly so a chip can bind directly.
 */
export type SyncStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * Structural stand-in for a `WebSocket` constructor. Typed loosely on
 * purpose: the browser's DOM `WebSocket`, the `ws` package's Node class,
 * and a test fake are all assignable, and none of them share a lib.
 */
export type WebSocketConstructorLike = new (url: string, protocols?: string | string[]) => unknown;

/** Milliseconds of history the repeat-rejection throttle looks back over. */
const REPEAT_REJECTION_WINDOW_MS = 60_000;

/** Transient closes inside the window before {@link ConnectToRelayOptions.onRepeatRejection} fires. */
const REPEAT_REJECTION_THRESHOLD = 3;

export interface ConnectToRelayOptions {
  /**
   * Base **http** URL of the relay, e.g. `http://localhost:1234` (no
   * trailing slash). The ws form is derived internally.
   */
  readonly httpBaseUrl: string;
  /** Room UUID resolved from `GET /rooms/:code` (ADR-0016). */
  readonly roomUuid: string;
  /** Local `Y.Doc` the connection will sync. */
  readonly doc: Y.Doc;
  /** Credentials — `deviceId` is required, `passwordHash` rides on protected rooms. */
  readonly credentials: JoinCredentials;
  /**
   * Awareness instance to share. Optional — if omitted, `y-websocket`
   * creates and owns a fresh one, reachable via {@link RelayConnection.awareness}.
   */
  readonly awareness?: Awareness | undefined;
  /**
   * Override the `WebSocket` implementation. Node callers pass the `ws`
   * package; tests pass a fake. Defaults to the ambient global.
   */
  readonly WebSocketPolyfill?: WebSocketConstructorLike | undefined;
  /** Fires on every `y-websocket` `status` event. */
  readonly onStatusChange?: ((status: SyncStatus) => void) | undefined;
  /**
   * Fires when the relay closes the socket with a private-use code from
   * ADR-0016's table. `null` is passed on a successful (re)connect to
   * clear any prior rejection surfaced to the UI.
   */
  readonly onRejectionChange?: ((reason: JoinRejectionReason | null) => void) | undefined;
  /**
   * Fires whenever the derived "reconnecting" state flips. True while a
   * connection that had previously succeeded is down with no permanent
   * rejection and no manual teardown; false otherwise.
   */
  readonly onReconnectingChange?: ((reconnecting: boolean) => void) | undefined;
  /**
   * Fires when {@link REPEAT_REJECTION_THRESHOLD} transient closes land
   * inside {@link REPEAT_REJECTION_WINDOW_MS}, then resets its buffer.
   * Lets a surface tell "still retrying" apart from "hung" — the client
   * wires it to a toast; the CLI may leave it unbound.
   */
  readonly onRepeatRejection?: (() => void) | undefined;
  /**
   * Fires exactly once, on the first successful Yjs sync with the relay.
   * Callers use this for post-sync mutations whose Lamport clock must be
   * higher than any op in the relay snapshot — e.g. clearing a stale
   * `leftAt` for a rejoining participant (ADR-0036 §6).
   */
  readonly onSynced?: (() => void) | undefined;
  /**
   * Fires on every `synced` transition of the underlying socket: `true` once
   * the relay's state has applied on the *current* connection, `false` when
   * that connection goes away. Unlike {@link onSynced} it is not one-shot.
   *
   * This is the signal that awareness can be trusted. `y-websocket` drops
   * every remote awareness state when a socket closes, and the relay pushes
   * the room's states ahead of its sync-step-2 reply — so between a socket
   * opening and `true` arriving here, a peer sees itself as the only one
   * online. A rule that counts online peers (unanimous auto-reveal) must not
   * evaluate in that window.
   */
  readonly onSyncedChange?: ((synced: boolean) => void) | undefined;
}

/** Public handle. Everything else is observed through the callbacks. */
export interface RelayConnection {
  /** The underlying awareness instance — shared with `y-websocket`. */
  readonly awareness: Awareness;
  /**
   * Re-handshake with a different password hash, without tearing the
   * session down. A no-op when the hash is unchanged; `null` drops `pw`.
   */
  updateCredentials(opts: { passwordHash?: string | null }): void;
  /**
   * Stop reconnecting, close the socket, and release observers. Safe to
   * call multiple times; suppresses any further reconnecting signal.
   */
  disconnect(): void;
}

/**
 * `http://` → `ws://`, `https://` → `wss://`. Any other input is
 * returned untouched, so a URL already in ws form passes through.
 *
 * The single home for this transform: `connectToRelay` calls it, and so
 * does the client's relay-URL preference, which is what keeps an
 * `https://` override from silently downgrading to plain `ws://`.
 */
export function relayHttpToWsUrl(httpBaseUrl: string): string {
  return httpBaseUrl.replace(/^https?:\/\//, (match) =>
    match === 'https://' ? 'wss://' : 'ws://',
  );
}

/**
 * Build the URL-param bag for the WS upgrade per ADR-0016. `did` is
 * always present; `pw` only for password-protected rooms. There is no
 * invite param — ADR-0017 dropped invite-only from v1 and the relay
 * never read one.
 */
function credentialsToParams(credentials: JoinCredentials): Record<string, string> {
  const params: Record<string, string> = { did: credentials.deviceId };
  if (credentials.passwordHash !== undefined) {
    params['pw'] = credentials.passwordHash;
  }
  return params;
}

/** Minimal shape of the `window` event target, without pulling in a DOM lib. */
interface WindowLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** `window` where one exists (browser), `undefined` under Node. */
function windowOrUndefined(): WindowLike | undefined {
  return (globalThis as { window?: WindowLike }).window;
}

/**
 * Opens a `WebsocketProvider` against the relay's `/ws/:uuid` endpoint
 * (ADR-0016) and returns a callback-fed handle.
 *
 * `y-websocket` appends `/<roomname>` to the server URL, so we pass
 * `${wsBase}/ws` as the server and `roomUuid` as the roomname, yielding
 * `${wsBase}/ws/${roomUuid}`.
 */
export function connectToRelay(opts: ConnectToRelayOptions): RelayConnection {
  let status: SyncStatus = 'connecting';
  let lastRejection: JoinRejectionReason | null = null;
  // Gate on a first successful connect so the initial handshake is not
  // reported as "reconnecting" — a join that has never been up is
  // connecting, not recovering.
  let hasEverConnected = false;
  // True once the caller explicitly calls disconnect() — suppresses the
  // reconnecting signal so no spurious banner shows during teardown.
  let manuallyDisconnected = false;
  let reconnecting = false;
  // Rolling buffer of transient-close timestamps for the repeat throttle.
  const transientCloseTimestamps: number[] = [];

  const recomputeReconnecting = (): void => {
    const next =
      hasEverConnected && status !== 'connected' && lastRejection === null && !manuallyDisconnected;
    if (next === reconnecting) return;
    reconnecting = next;
    opts.onReconnectingChange?.(next);
  };

  const serverUrl = `${relayHttpToWsUrl(opts.httpBaseUrl)}/ws`;
  // A re-handshake carries the same credentials with a different hash, so the
  // whole bag is kept rather than rebuilt from its parts.
  let credentials: JoinCredentials = opts.credentials;

  const provider = new WebsocketProvider(serverUrl, opts.roomUuid, opts.doc, {
    params: credentialsToParams(credentials),
    connect: true,
    ...(opts.awareness !== undefined && { awareness: opts.awareness }),
    ...(opts.WebSocketPolyfill !== undefined && {
      WebSocketPolyfill: opts.WebSocketPolyfill as unknown as typeof WebSocket,
    }),
  });

  // Presence across a reconnect.
  //
  // `y-protocols` takes an awareness state only when its clock is newer than
  // the last one it saw for that client. A reconnect defeats that in both
  // directions. The relay drops our state when the socket closes and peers
  // record us as gone — at the very clock we then come back with. And
  // `y-websocket` drops every peer's state here while keeping the clock the
  // relay is about to send that state back under. Left alone, everyone is
  // offline to everyone until the next awareness renewal, up to 15 s later:
  // three times the host-election debounce (ADR-0010), so the room changed
  // hands, and changed back, over a reconnect nobody would have noticed.
  const forgetPeerClocks = (): void => {
    const { awareness } = provider;
    // Deleting from a Map while iterating it is well-defined.
    for (const clientId of awareness.meta.keys()) {
      if (clientId !== awareness.clientID && !awareness.states.has(clientId)) {
        awareness.meta.delete(clientId);
      }
    }
  };

  const reannounceSelf = (): void => {
    const state = provider.awareness.getLocalState();
    // Writing the state back is what advances the clock.
    if (state !== null) provider.awareness.setLocalState(state);
  };

  const onStatus = (ev: { status: SyncStatus }): void => {
    status = ev.status;
    if (ev.status === 'disconnected') forgetPeerClocks();
    if (ev.status === 'connected' && hasEverConnected) reannounceSelf();
    opts.onStatusChange?.(ev.status);
    // A successful (re)connect invalidates any prior rejection — the
    // relay accepted us, so clear the surfaced reason and the throttle
    // buffer that was tracking the failed attempts.
    if (ev.status === 'connected') {
      hasEverConnected = true;
      lastRejection = null;
      opts.onRejectionChange?.(null);
      transientCloseTimestamps.length = 0;
    }
    recomputeReconnecting();
  };

  const onConnectionClose = (event: { code: number } | null): void => {
    if (event === null) return;
    const reason = JOIN_REJECTION_REASONS_BY_CODE.get(event.code);
    if (reason === undefined) {
      // Transient failure (network drop, no relay-issued code, unexpected
      // close). y-websocket's exponential-backoff loop fires on its own —
      // do NOT clear shouldConnect here.
      const now = Date.now();
      transientCloseTimestamps.push(now);
      const cutoff = now - REPEAT_REJECTION_WINDOW_MS;
      while (transientCloseTimestamps.length > 0 && transientCloseTimestamps[0]! < cutoff) {
        transientCloseTimestamps.shift();
      }
      if (transientCloseTimestamps.length >= REPEAT_REJECTION_THRESHOLD) {
        transientCloseTimestamps.length = 0;
        opts.onRepeatRejection?.();
      }
      recomputeReconnecting();
      return;
    }
    // Permanent relay rejection — retrying will not help. Stop the
    // reconnect loop so the surface can route the user somewhere useful.
    lastRejection = reason;
    opts.onRejectionChange?.(reason);
    provider.shouldConnect = false;
    provider.disconnect();
    recomputeReconnecting();
  };

  provider.on('status', onStatus);
  provider.on('connection-close', onConnectionClose);

  // `'synced'` is emitted by y-websocket but absent from the TypeScript
  // overloads on `WebsocketProvider`. Cast through `unknown` to reach it.
  const syncedEvents = provider as unknown as {
    on(event: string, fn: (isSynced: boolean) => void): void;
    off(event: string, fn: (isSynced: boolean) => void): void;
  };
  let syncedListener: ((isSynced: boolean) => void) | null = null;
  if (opts.onSynced !== undefined) {
    const onSynced = (isSynced: boolean): void => {
      if (!isSynced) return;
      syncedEvents.off('synced', onSynced);
      syncedListener = null;
      opts.onSynced?.();
    };
    syncedListener = onSynced;
    syncedEvents.on('synced', onSynced);
  }
  // Registered after the one-shot above so `onSynced`'s post-sync write has
  // landed by the time a consumer reacts to `onSyncedChange(true)`.
  let syncedChangeListener: ((isSynced: boolean) => void) | null = null;
  if (opts.onSyncedChange !== undefined) {
    const onSyncedChange = (isSynced: boolean): void => {
      opts.onSyncedChange?.(isSynced);
    };
    syncedChangeListener = onSyncedChange;
    syncedEvents.on('synced', onSyncedChange);
  }

  // window online/offline listeners — network interface changes do not
  // always close the socket promptly (Chromium offline mode, flaky Wi-Fi
  // where the socket stays open until the next byte). Inert under Node,
  // where there is no `window`.
  const onOffline = (): void => {
    if (manuallyDisconnected) return;
    status = 'disconnected';
    opts.onStatusChange?.('disconnected');
    recomputeReconnecting();
  };

  const onOnline = (): void => {
    if (manuallyDisconnected || lastRejection !== null) return;
    if (status === 'connected') return;
    // y-websocket's connect() is a no-op while `ws !== null` (a stale
    // socket Chromium never closed). Force it shut so the onclose handler
    // fires and schedules setupWS. Reset the failure counter first so the
    // backoff is 100 ms, not seconds inherited from prior attempts.
    if (provider.ws !== null) {
      provider.wsUnsuccessfulReconnects = 0;
      provider.ws.close();
    } else {
      provider.connect();
    }
  };

  const win = windowOrUndefined();
  win?.addEventListener('offline', onOffline);
  win?.addEventListener('online', onOnline);

  let disposed = false;

  return {
    awareness: provider.awareness,

    updateCredentials(subOpts: { passwordHash?: string | null }): void {
      const next = subOpts.passwordHash ?? undefined;
      if (next === credentials.passwordHash) return;
      credentials =
        next === undefined
          ? { roomCode: credentials.roomCode, deviceId: credentials.deviceId }
          : { ...credentials, passwordHash: next };
      provider.shouldConnect = false;
      provider.disconnect();
      provider.params = credentialsToParams(credentials);
      provider.connect();
    },

    disconnect(): void {
      if (disposed) return;
      disposed = true;
      manuallyDisconnected = true;
      recomputeReconnecting();
      provider.off('status', onStatus);
      provider.off('connection-close', onConnectionClose);
      if (syncedListener !== null) {
        syncedEvents.off('synced', syncedListener);
        syncedListener = null;
      }
      if (syncedChangeListener !== null) {
        syncedEvents.off('synced', syncedChangeListener);
        syncedChangeListener = null;
        // The provider is about to be destroyed with its listeners already
        // detached, so the closing transition is reported here.
        opts.onSyncedChange?.(false);
      }
      win?.removeEventListener('offline', onOffline);
      win?.removeEventListener('online', onOnline);
      provider.shouldConnect = false;
      provider.disconnect();
      provider.destroy();
    },
  };
}
