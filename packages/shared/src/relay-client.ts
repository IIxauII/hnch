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
  JOIN_REJECTION_CLOSE_CODES,
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

/**
 * How long a request to the relay may go unanswered. `fetch` has no limit of
 * its own: on a connection that went stale — a laptop that slept, a phone
 * that changed networks — a request can hang for minutes, and whatever waits
 * for it ("Creating…", "Joining…") hangs with it. Past this it fails like a
 * relay that cannot be reached.
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
 * The reason in a 404 body, if it is one of the reasons there are. What
 * answers may not be the relay — a proxy, a captive portal — and a reason
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
 * `GET /rooms/:code`. Throws {@link RelayRejectionError} on a 404 that gives
 * the relay's reason. Anything else that is not an answer — another status,
 * a 404 that says nothing the relay would say, a request that is not
 * answered in time — surfaces as a generic `Error`: the relay could not be
 * asked, which is not the same as the relay saying no. Callers forget a
 * session on the strength of `unknown-room`; a proxy's 404, or that of a
 * relay URL that points at something else, must not be taken for it.
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
    signal: AbortSignal.timeout(RELAY_REQUEST_TIMEOUT_MS),
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

/** `WebSocket.OPEN`, spelled out: the constructor in use may not carry it. */
const OPEN = 1;

/** Milliseconds of history the repeat-rejection throttle looks back over. */
const REPEAT_REJECTION_WINDOW_MS = 60_000;

/** Transient closes inside the window before {@link ConnectToRelayOptions.onRepeatRejection} fires. */
const REPEAT_REJECTION_THRESHOLD = 3;

/** The least time between two questions to the relay about why a socket closed. */
const REFUSAL_LOOKUP_INTERVAL_MS = 5_000;

/**
 * How long such a question may go unanswered. A request on a connection
 * that went stale — after a sleep, say — can otherwise hang for minutes,
 * and no second question goes out while the first is pending.
 */
const REFUSAL_LOOKUP_TIMEOUT_MS = 8_000;

/**
 * Why the relay will not take this connection, where it says so over HTTP —
 * or `null` when it has nothing against it, or cannot be reached.
 *
 * The relay refuses two kinds of connection *before* the upgrade (ADR-0035):
 * one to a session it no longer has (HTTP 404), and one to a protected
 * session that brings no password (HTTP 400). Neither status reaches the
 * page. A browser reports a refused handshake as a close without a code,
 * which is also what a dropped link looks like.
 *
 * A verdict ends the session for its user, so only the relay's own words
 * count. A 404 without the relay's reason in it may be anybody's — a proxy,
 * a load balancer mid-deploy — and says nothing about the session.
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
   * ADR-0016's table — or turns out, when asked, to refuse the connection
   * before it is a socket at all: the session is gone, or has been given a
   * password this connection does not carry. `null` is passed on a
   * successful (re)connect to clear any prior rejection surfaced to the UI.
   *
   * A rejection is final. Reconnecting stops with it.
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
   * Fires when "synced" changes: `true` once the relay's state has applied on
   * the *current* connection, `false` when that connection goes away or the
   * network is reported offline. Unlike {@link onSynced} it is not one-shot,
   * and it only fires on a change — never `false` for a connection that was
   * not synced to begin with.
   *
   * This is the signal that awareness can be trusted. `y-websocket` drops
   * every remote awareness state when a socket closes, and the relay pushes
   * the room's states ahead of its sync-step-2 reply — so between a socket
   * opening and `true` arriving here, a peer sees itself as the only one
   * online. A rule that counts online peers (unanimous auto-reveal) must not
   * evaluate in that window.
   *
   * What it does not cover: a link that dies without the platform noticing
   * (no `offline` event, no close). Awareness then times its peers out after
   * 30 s, about when `y-websocket` gives up on the socket, and for that
   * moment the peers are gone while this still says `true`.
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
   * Resolve once the open socket has handed everything queued on it to the
   * network, or after `capMs`, whichever is first; at once with no socket
   * open. Never rejects. Called between a last write (a leave) and the
   * teardown that closes the socket, so the write gets a chance to go out.
   */
  flush(capMs: number): Promise<void>;
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
