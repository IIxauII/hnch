/**
 * The relay contract for both surfaces: the HTTP routes (ADR-0016) and the WebSocket handshake.
 * The client and the CLI both import it, so the contract cannot drift between them.
 *
 * Handshake: `${wsBase}/ws/${roomUuid}?did=…[&pw=…]`; close codes 4000–4099 decode to a
 * {@link JoinRejectionReason}. `connectToRelay` takes the **http** base URL and derives the ws
 * form itself ({@link relayHttpToWsUrl}), so the transform exists once.
 *
 * Framework-free: state leaves through callbacks, never signals. Unlike a driver
 * (`startElection`), this owns a connection rather than a rule, so `Y.Doc` and `Awareness` do
 * cross the boundary: handing a doc to a transport is the module's whole job.
 */

import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';
import {
  JOIN_REJECTION_CLOSE_CODES,
  JOIN_REJECTION_REASONS_BY_CODE,
  type JoinCredentials,
  type JoinRejectionReason,
} from './auth.js';

// HTTP surface

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

/** A resolve 404 carrying a {@link JoinRejectionReason}, so callers route without re-parsing. */
export class RelayRejectionError extends Error {
  constructor(readonly reason: JoinRejectionReason) {
    super(`relay rejected resolve: ${reason}`);
    this.name = 'RelayRejectionError';
  }
}

export interface MintRoomOptions {
  readonly passwordHash?: string;
}

/**
 * `fetch` has no limit of its own: on a stale connection (a laptop that slept) a request can
 * hang for minutes, and "Joining…" with it. Past this it fails like an unreachable relay.
 */
export const RELAY_REQUEST_TIMEOUT_MS = 10_000;

/** `POST /rooms` — mints a fresh room, optionally password-protected (ADR-0017). */
export async function mintRoom(
  httpBaseUrl: string,
  options?: MintRoomOptions,
): Promise<MintedRoom> {
  const res = await fetch(`${httpBaseUrl}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options?.passwordHash ? { passwordHash: options.passwordHash } : {}),
    signal: AbortSignal.timeout(RELAY_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`POST /rooms failed: ${res.status}`);
  }
  return (await res.json()) as MintedRoom;
}

/**
 * Only a reason the relay has: a proxy or captive portal may answer instead, and the reason
 * ends up in front of the user, in the CLI as it came.
 */
function rejectionReasonIn(body: unknown): JoinRejectionReason | null {
  if (typeof body !== 'object' || body === null) return null;
  const { reason } = body as { reason?: unknown };
  return typeof reason === 'string' && Object.hasOwn(JOIN_REJECTION_CLOSE_CODES, reason)
    ? (reason as JoinRejectionReason)
    : null;
}

/**
 * Throws {@link RelayRejectionError} only on a 404 with the relay's reason. Anything else that
 * is not an answer (another status, a proxy's 404, a timeout) is a generic `Error`: callers
 * forget a session on `unknown-room`, so "could not ask" must not read as "said no".
 */
export async function resolveRoom(httpBaseUrl: string, code: string): Promise<ResolvedRoom> {
  const res = await fetch(`${httpBaseUrl}/rooms/${encodeURIComponent(code)}`, {
    signal: AbortSignal.timeout(RELAY_REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404) {
    const body: unknown = await res.json().catch(() => null);
    const reason = rejectionReasonIn(body);
    if (reason !== null) throw new RelayRejectionError(reason);
  }
  if (!res.ok) {
    throw new Error(`GET /rooms/:code failed: ${res.status}`);
  }
  return (await res.json()) as ResolvedRoom;
}

/** `null` reverts to open. Returns the resulting mode, so no follow-up read is needed. */
export async function patchRoomAccess(
  httpBaseUrl: string,
  uuid: string,
  passwordHash: string | null,
): Promise<PatchAccessResponse> {
  const res = await fetch(`${httpBaseUrl}/rooms/${uuid}/access`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passwordHash }),
    signal: AbortSignal.timeout(RELAY_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`PATCH /rooms/:uuid/access failed: ${res.status}`);
  }
  return (await res.json()) as PatchAccessResponse;
}

// Handshake

/** The y-websocket `status` values, exactly, so a chip can bind directly. */
export type SyncStatus = 'connecting' | 'connected' | 'disconnected';

/** Loose on purpose: the DOM `WebSocket`, the `ws` package and a test fake share no lib. */
export type WebSocketConstructorLike = new (url: string, protocols?: string | string[]) => unknown;

/** `WebSocket.OPEN`, spelled out: the constructor in use may not carry it. */
const OPEN = 1;

const REPEAT_REJECTION_WINDOW_MS = 60_000;

/** Transient closes inside the window before {@link ConnectToRelayOptions.onRepeatRejection} fires. */
const REPEAT_REJECTION_THRESHOLD = 3;

/** The least time between two questions to the relay about why a socket closed. */
const REFUSAL_LOOKUP_INTERVAL_MS = 5_000;

/** A stale connection can hang a request for minutes, and no second one goes out meanwhile. */
const REFUSAL_LOOKUP_TIMEOUT_MS = 8_000;

/**
 * Why the relay refuses this connection before the upgrade (ADR-0035), or `null`. A gone
 * session (404) and a protected one without a password (400) both reach the page as a close
 * without a code, like a dropped link. A verdict ends the session for its user, so only the
 * relay's own words count: a 404 without its reason may be a proxy's.
 */
async function refusalBehindClose(
  httpBaseUrl: string,
  roomUuid: string,
  credentials: JoinCredentials,
): Promise<JoinRejectionReason | null> {
  let status: number;
  let body: unknown;
  try {
    const res = await fetch(`${httpBaseUrl}/rooms/${encodeURIComponent(credentials.roomCode)}`, {
      signal: AbortSignal.timeout(REFUSAL_LOOKUP_TIMEOUT_MS),
    });
    status = res.status;
    body = await res.json().catch(() => null);
  } catch {
    // No answer: the link, not the session.
    return null;
  }

  // The relay has no such session.
  if (status === 404) return rejectionReasonIn(body) === 'unknown-room' ? 'unknown-room' : null;
  if (status !== 200 || typeof body !== 'object' || body === null) return null;
  const { uuid, accessMode } = body as { uuid?: unknown; accessMode?: unknown };
  if (typeof uuid !== 'string') return null;

  // The code has been handed to another session: this one is gone.
  if (uuid !== roomUuid) return 'unknown-room';
  // Protected, and there is nothing to show for it. With a hash in hand the
  // relay takes the socket and answers in a close code, right or wrong.
  if (accessMode === 'password' && credentials.passwordHash === undefined) {
    return 'wrong-password';
  }
  return null;
}

export interface ConnectToRelayOptions {
  /** E.g. `http://localhost:1234`, no trailing slash; the ws form is derived. */
  readonly httpBaseUrl: string;
  /** Room UUID resolved from `GET /rooms/:code` (ADR-0016). */
  readonly roomUuid: string;
  readonly doc: Y.Doc;
  /** `deviceId` is required; `passwordHash` rides on protected rooms. */
  readonly credentials: JoinCredentials;
  /** If omitted, `y-websocket` creates one, reachable via {@link RelayConnection.awareness}. */
  readonly awareness?: Awareness | undefined;
  /** Node callers pass the `ws` package, tests a fake; defaults to the global. */
  readonly WebSocketPolyfill?: WebSocketConstructorLike | undefined;
  readonly onStatusChange?: ((status: SyncStatus) => void) | undefined;
  /**
   * A close code from ADR-0016's table, or a refusal found by asking (the session is gone, or now
   * needs a password). `null` on a successful (re)connect. A rejection stops reconnecting.
   */
  readonly onRejectionChange?: ((reason: JoinRejectionReason | null) => void) | undefined;
  /** True while a connection that was up is down, not rejected, and not put down on purpose. */
  readonly onReconnectingChange?: ((reconnecting: boolean) => void) | undefined;
  /**
   * {@link REPEAT_REJECTION_THRESHOLD} transient closes inside {@link REPEAT_REJECTION_WINDOW_MS}
   * ms, so a surface can tell "still retrying" from "hung". The CLI may leave it unbound.
   */
  readonly onRepeatRejection?: (() => void) | undefined;
  /**
   * Once, on the first sync: for writes whose Lamport clock must beat everything in the
   * snapshot, e.g. clearing a rejoiner's stale `leftAt` (ADR-0036 §6).
   */
  readonly onSynced?: (() => void) | undefined;
  /**
   * `true` once the relay's state has applied on the current connection, `false` when it goes
   * away or the network reports offline; fires only on a change.
   *
   * This is when awareness can be trusted. `y-websocket` drops remote states on close and the
   * relay pushes them ahead of its sync-step-2, so until `true` a peer sees itself alone, and a
   * rule that counts online peers (auto-reveal) must not run. A link that dies unnoticed still
   * reads `true` until awareness times the peers out, after 30 s.
   */
  readonly onSyncedChange?: ((synced: boolean) => void) | undefined;
}

/** Everything else is observed through the callbacks. */
export interface RelayConnection {
  readonly awareness: Awareness;
  /** Re-handshake with a new hash without a teardown; no-op if unchanged, `null` drops `pw`. */
  updateCredentials(opts: { passwordHash?: string | null }): void;
  /**
   * Resolve once the socket has handed its queue to the network, or after `capMs`; at once with
   * no socket. Never rejects. Lets a last write (a leave) go out before teardown.
   */
  flush(capMs: number): Promise<void>;
  /** Idempotent; suppresses any further reconnecting signal. */
  disconnect(): void;
}

/**
 * `http` → `ws`, `https` → `wss`, anything else untouched. The one home for this, shared with
 * the client's relay-URL preference so an `https` override never downgrades to `ws`.
 */
export function relayHttpToWsUrl(httpBaseUrl: string): string {
  return httpBaseUrl.replace(/^https?:\/\//, (match) =>
    match === 'https://' ? 'wss://' : 'ws://',
  );
}

/** `did` always, `pw` for protected rooms (ADR-0016); no invite param, the relay never read one. */
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
 * `y-websocket` appends `/<roomname>` to the server URL, so the server is `${wsBase}/ws` and the
 * roomname the UUID: `${wsBase}/ws/${roomUuid}` (ADR-0016).
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
  // True from `updateCredentials` until the socket is back up (or refused).
  // The drop in between was asked for: it is not a connection being lost,
  // and must not be announced as one.
  let rehandshaking = false;
  // Last value handed to `onSyncedChange`, so it only ever reports a change.
  let synced = false;
  // Rolling buffer of transient-close timestamps for the repeat throttle.
  const transientCloseTimestamps: number[] = [];

  const recomputeReconnecting = (): void => {
    const next =
      hasEverConnected &&
      status !== 'connected' &&
      lastRejection === null &&
      !manuallyDisconnected &&
      !rehandshaking;
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

  // Presence across a reconnect (ADR-0050).
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
  //
  // Forgetting a clock means the next state for that client is taken at any
  // clock. That is safe because of what the relay sends a socket that has
  // just opened: the states it holds now, and nothing else. A peer that left
  // while we were away is not among them, so nothing brings it back.
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

  const setSynced = (next: boolean): void => {
    if (next === synced) return;
    synced = next;
    opts.onSyncedChange?.(next);
  };

  // An awareness instance may have been connected before — the caller keeps
  // it across `disconnect()` and a fresh `connectToRelay`. Whatever clocks it
  // still holds for peers it no longer has are as stale as after a drop.
  forgetPeerClocks();

  const onStatus = (ev: { status: SyncStatus }): void => {
    status = ev.status;
    if (ev.status === 'disconnected') forgetPeerClocks();
    // On every connect, the first included: an awareness instance that was
    // connected before comes back at a clock its peers have already seen.
    if (ev.status === 'connected') reannounceSelf();
    opts.onStatusChange?.(ev.status);
    // A successful (re)connect invalidates any prior rejection — the
    // relay accepted us, so clear the surfaced reason and the throttle
    // buffer that was tracking the failed attempts.
    if (ev.status === 'connected') {
      hasEverConnected = true;
      rehandshaking = false;
      lastRejection = null;
      opts.onRejectionChange?.(null);
      transientCloseTimestamps.length = 0;
    }
    recomputeReconnecting();
  };

  // `provider.disconnect()` announces itself as a close without an event. So
  // does y-websocket when it gives up on a socket that has gone silent — and
  // that one is a connection lost, not one put down.
  let closingOnPurpose = false;
  const closeSocket = (): void => {
    closingOnPurpose = true;
    try {
      provider.disconnect();
    } finally {
      closingOnPurpose = false;
    }
  };

  // Permanent relay rejection — retrying will not help. Stop the reconnect
  // loop so the surface can route the user somewhere useful.
  const refuse = (reason: JoinRejectionReason): void => {
    lastRejection = reason;
    opts.onRejectionChange?.(reason);
    provider.shouldConnect = false;
    closeSocket();
    recomputeReconnecting();
  };

  // A refusal the socket cannot report (ADR-0050) — see `refusalBehindClose`.
  //
  // It happens to someone who was in the session a moment ago: the host set
  // a password, or the session expired, while their socket was down. Left
  // to itself y-websocket retries, for ever, a request that will be refused
  // for ever. So a close that says nothing is followed by a question that
  // can. No answer changes nothing: the retry loop carries on.
  let lookingUpRefusal = false;
  let lastRefusalLookupAt = Number.NEGATIVE_INFINITY;
  const settled = (): boolean => manuallyDisconnected || lastRejection !== null;
  const lookUpRefusal = async (): Promise<void> => {
    const now = Date.now();
    // A clock that was set back must not keep the question from being asked.
    if (now < lastRefusalLookupAt) lastRefusalLookupAt = Number.NEGATIVE_INFINITY;
    if (lookingUpRefusal || now - lastRefusalLookupAt < REFUSAL_LOOKUP_INTERVAL_MS) return;
    lookingUpRefusal = true;
    lastRefusalLookupAt = now;
    // What the question is asked about. An answer about credentials that
    // have been replaced since is an answer about another connection.
    const asked = credentials;
    try {
      const reason = await refusalBehindClose(opts.httpBaseUrl, opts.roomUuid, asked);
      // Whatever happened while the question was out has the last word.
      if (reason === null || settled() || status === 'connected') return;
      if (asked !== credentials || rehandshaking) return;
      refuse(reason);
    } finally {
      lookingUpRefusal = false;
    }
  };

  const onConnectionClose = (event: { code: number } | null): void => {
    if (closingOnPurpose) return;
    // Any other close during a re-handshake means it did not go through:
    // from here on this is a connection being recovered, like any other.
    rehandshaking = false;
    // No event: y-websocket closed a socket that had gone silent.
    const reason = event === null ? undefined : JOIN_REJECTION_REASONS_BY_CODE.get(event.code);
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
      void lookUpRefusal();
      return;
    }
    refuse(reason);
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
  const syncedChangeListener = (isSynced: boolean): void => {
    setSynced(isSynced);
  };
  syncedEvents.on('synced', syncedChangeListener);

  // window online/offline listeners — network interface changes do not
  // always close the socket promptly (Chromium offline mode, flaky Wi-Fi
  // where the socket stays open until the next byte). Inert under Node,
  // where there is no `window`.
  const onOffline = (): void => {
    if (manuallyDisconnected) return;
    status = 'disconnected';
    // The socket may stay open for a while yet, but nothing is coming
    // through it: what awareness says from here on is not to be believed.
    setSynced(false);
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
      // Only putting down a socket that was up is "asked for". One that was
      // down already is a connection being recovered, and says so.
      rehandshaking = status === 'connected';
      // What was refused was the connection as it was. This is another one.
      if (lastRejection !== null) {
        lastRejection = null;
        opts.onRejectionChange?.(null);
      }
      provider.shouldConnect = false;
      closeSocket();
      provider.params = credentialsToParams(credentials);
      provider.connect();
    },

    async flush(capMs: number): Promise<void> {
      const deadline = Date.now() + capMs;
      for (;;) {
        const ws = provider.ws;
        if (disposed || ws === null || ws.readyState !== OPEN || ws.bufferedAmount === 0) return;
        if (Date.now() >= deadline) return;
        // About one frame.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 16);
        });
      }
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
      syncedEvents.off('synced', syncedChangeListener);
      // The provider is about to be destroyed with its listeners already
      // detached, so the closing transition is reported here.
      setSynced(false);
      win?.removeEventListener('offline', onOffline);
      win?.removeEventListener('online', onOnline);
      provider.shouldConnect = false;
      closeSocket();
      provider.destroy();
    },
  };
}
