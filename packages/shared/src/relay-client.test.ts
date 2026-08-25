/**
 * Unit tests for relay-client.ts — the whole relay contract (ADR-0016).
 *
 * This is the one behavioral seam for the relay: both the HTTP calls and
 * the WebSocket handshake are exercised here, at the module's public
 * interface, so neither surface needs a suite of its own.
 *
 * Everything is asserted from what a caller can observe — the URL and
 * params the socket was opened with, which callbacks fired in what order
 * with what arguments, whether a reconnect was attempted. Nothing reaches
 * for `provider.shouldConnect`, the timestamp buffer, or listener
 * bookkeeping.
 *
 * Doubles: a fake `fetch` for the HTTP half, and a controllable fake
 * `WebSocket` class for the handshake — no `vi.mock('y-websocket')`.
 */

import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  connectToRelay,
  mintRoom,
  patchRoomAccess,
  relayHttpToWsUrl,
  RelayRejectionError,
  resolveRoom,
  type ConnectToRelayOptions,
  type RelayConnection,
  type SyncStatus,
} from './relay-client.js';
import { JOIN_REJECTION_CLOSE_CODES, type JoinRejectionReason } from './auth.js';

// ---------------------------------------------------------------------------
// Fake WebSocket
// ---------------------------------------------------------------------------

/** Minimal fake that lets tests drive open/close/error events. */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  binaryType = 'blob';
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new FakeCloseEvent(1000, '', true));
  });

  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: FakeCloseEvent) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  /** Simulate a successful connection. */
  simulateOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({ type: 'open' });
  }

  /** Simulate a server close with a code. */
  simulateClose(code: number, reason = '', wasClean = true): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new FakeCloseEvent(code, reason, wasClean));
  }
}

/** Minimal `CloseEvent` stand-in — Node has no `CloseEvent`. */
class FakeCloseEvent {
  readonly type = 'close';
  constructor(
    readonly code: number,
    readonly reason: string,
    readonly wasClean: boolean,
  ) {}
}

/** Every socket the polyfill has handed out, oldest first. */
let sockets: FakeWebSocket[] = [];

const WS_POLYFILL = function FakeWebSocketFactory(url: string): FakeWebSocket {
  const ws = new FakeWebSocket(url);
  sockets.push(ws);
  return ws;
} as unknown as ConnectToRelayOptions['WebSocketPolyfill'];

/** The socket most recently opened. Fails loudly if none exists. */
function latestSocket(): FakeWebSocket {
  const ws = sockets.at(-1);
  if (ws === undefined) throw new Error('no socket was opened');
  return ws;
}

/** Query params the socket at `index` (default: latest) was opened with. */
function socketParams(index = -1): Record<string, string> {
  const ws = sockets.at(index);
  if (ws === undefined) throw new Error('no socket was opened');
  const query = new URL(ws.url).searchParams;
  return Object.fromEntries(query.entries());
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const connections: RelayConnection[] = [];

function makeConnection(overrides: Partial<ConnectToRelayOptions> = {}): RelayConnection {
  const conn = connectToRelay({
    httpBaseUrl: 'http://localhost:1234',
    roomUuid: 'room-uuid-test',
    doc: new Y.Doc(),
    credentials: { deviceId: 'device-001', roomCode: 'ABC123' },
    WebSocketPolyfill: WS_POLYFILL,
    ...overrides,
  });
  connections.push(conn);
  return conn;
}

/** Drive the current socket through a full successful connect. */
function connectSuccessfully(): void {
  latestSocket().simulateOpen();
}

/** Fake `fetch` returning one canned response. */
function stubFetch(response: {
  ok?: boolean;
  status?: number;
  json?: () => Promise<unknown>;
}): ReturnType<typeof vi.fn> {
  const status = response.status ?? 200;
  const fetchMock = vi.fn(async () => ({
    ok: response.ok ?? (status >= 200 && status < 300),
    status,
    json: response.json ?? (async () => ({})),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  sockets = [];
  vi.useFakeTimers();
});

afterEach(() => {
  for (const conn of connections.splice(0)) conn.disconnect();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// mintRoom
// ---------------------------------------------------------------------------

describe('mintRoom', () => {
  it('POSTs an empty body and returns the minted room', async () => {
    const fetchMock = stubFetch({
      json: async () => ({ uuid: 'u-1', code: 'ABC123' }),
    });

    const minted = await mintRoom('http://relay.test');

    expect(minted).toEqual({ uuid: 'u-1', code: 'ABC123' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://relay.test/rooms',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });

  it('sends passwordHash when one is supplied', async () => {
    const fetchMock = stubFetch({ json: async () => ({ uuid: 'u-1', code: 'ABC123' }) });

    await mintRoom('http://relay.test', { passwordHash: 'hash-abc' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://relay.test/rooms',
      expect.objectContaining({ body: JSON.stringify({ passwordHash: 'hash-abc' }) }),
    );
  });

  it('throws on a non-ok status', async () => {
    stubFetch({ status: 500 });

    await expect(mintRoom('http://relay.test')).rejects.toThrow('POST /rooms failed: 500');
  });
});

// ---------------------------------------------------------------------------
// resolveRoom
// ---------------------------------------------------------------------------

describe('resolveRoom', () => {
  it('returns uuid and accessMode', async () => {
    stubFetch({ json: async () => ({ uuid: 'u-1', accessMode: 'password' }) });

    await expect(resolveRoom('http://relay.test', 'ABC123')).resolves.toEqual({
      uuid: 'u-1',
      accessMode: 'password',
    });
  });

  it('URL-encodes the room code', async () => {
    const fetchMock = stubFetch({ json: async () => ({ uuid: 'u-1', accessMode: 'open' }) });

    await resolveRoom('http://relay.test', 'A B/C');

    expect(fetchMock).toHaveBeenCalledWith('http://relay.test/rooms/A%20B%2FC');
  });

  it('throws a typed RelayRejectionError carrying the 404 reason', async () => {
    stubFetch({ status: 404, json: async () => ({ reason: 'room-full' }) });

    await expect(resolveRoom('http://relay.test', 'ABC123')).rejects.toMatchObject({
      name: 'RelayRejectionError',
      reason: 'room-full',
    });
  });

  it('falls back to unknown-room when the 404 body is unparseable', async () => {
    stubFetch({
      status: 404,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(resolveRoom('http://relay.test', 'ABC123')).rejects.toMatchObject({
      reason: 'unknown-room',
    });
  });

  it('throws a generic Error on other non-ok statuses', async () => {
    stubFetch({ status: 503 });

    const err = await resolveRoom('http://relay.test', 'ABC123').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(RelayRejectionError);
    expect((err as Error).message).toBe('GET /rooms/:code failed: 503');
  });
});

// ---------------------------------------------------------------------------
// patchRoomAccess
// ---------------------------------------------------------------------------

describe('patchRoomAccess', () => {
  it('sends the hash and returns the resulting access mode', async () => {
    const fetchMock = stubFetch({ json: async () => ({ accessMode: 'password' }) });

    await expect(patchRoomAccess('http://relay.test', 'u-1', 'hash-abc')).resolves.toEqual({
      accessMode: 'password',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://relay.test/rooms/u-1/access',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ passwordHash: 'hash-abc' }),
      }),
    );
  });

  it('sends null to revert the room to open', async () => {
    const fetchMock = stubFetch({ json: async () => ({ accessMode: 'open' }) });

    await expect(patchRoomAccess('http://relay.test', 'u-1', null)).resolves.toEqual({
      accessMode: 'open',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://relay.test/rooms/u-1/access',
      expect.objectContaining({ body: JSON.stringify({ passwordHash: null }) }),
    );
  });

  it('throws on a non-ok status', async () => {
    stubFetch({ status: 403 });

    await expect(patchRoomAccess('http://relay.test', 'u-1', null)).rejects.toThrow(
      'PATCH /rooms/:uuid/access failed: 403',
    );
  });
});

// ---------------------------------------------------------------------------
// relayHttpToWsUrl
// ---------------------------------------------------------------------------

describe('relayHttpToWsUrl', () => {
  it('maps https to wss and never to plain ws', () => {
    expect(relayHttpToWsUrl('https://hnch.dev')).toBe('wss://hnch.dev');
  });

  it('maps http to ws', () => {
    expect(relayHttpToWsUrl('http://localhost:1234')).toBe('ws://localhost:1234');
  });

  it('passes a URL already in ws form through unchanged', () => {
    expect(relayHttpToWsUrl('wss://hnch.dev')).toBe('wss://hnch.dev');
  });
});

// ---------------------------------------------------------------------------
// connectToRelay — URL and params
// ---------------------------------------------------------------------------

describe('connectToRelay URL', () => {
  it('derives wss from an https base and appends /ws/:roomUuid', () => {
    makeConnection({ httpBaseUrl: 'https://hnch.dev', roomUuid: 'room-9' });

    expect(latestSocket().url.startsWith('wss://hnch.dev/ws/room-9?')).toBe(true);
  });

  it('derives ws from an http base', () => {
    makeConnection({ httpBaseUrl: 'http://localhost:1234', roomUuid: 'room-9' });

    expect(latestSocket().url.startsWith('ws://localhost:1234/ws/room-9?')).toBe(true);
  });

  it('always sends did', () => {
    makeConnection({ credentials: { deviceId: 'device-xyz', roomCode: 'ABC123' } });

    expect(socketParams()).toEqual({ did: 'device-xyz' });
  });

  it('sends pw only when a passwordHash is set', () => {
    makeConnection({
      credentials: { deviceId: 'device-xyz', roomCode: 'ABC123', passwordHash: 'hash-abc' },
    });

    expect(socketParams()).toEqual({ did: 'device-xyz', pw: 'hash-abc' });
  });

  it('never sends an inv param, whatever the credentials carry', () => {
    makeConnection({
      credentials: {
        deviceId: 'device-xyz',
        roomCode: 'ABC123',
        passwordHash: 'hash-abc',
        // Invite-only was dropped in ADR-0017; an extra field must not leak.
        ...({ inviteToken: 'tok-xyz' } as Record<string, string>),
      },
    });

    expect(socketParams()).not.toHaveProperty('inv');
  });
});

// ---------------------------------------------------------------------------
// connectToRelay — status and rejection
// ---------------------------------------------------------------------------

describe('connectToRelay status', () => {
  it('reports connected once the socket opens', () => {
    const onStatusChange = vi.fn<(status: SyncStatus) => void>();
    makeConnection({ onStatusChange });

    connectSuccessfully();

    expect(onStatusChange).toHaveBeenCalledWith('connected');
  });

  it('clears any prior rejection on a successful connect', () => {
    const onRejectionChange = vi.fn<(reason: JoinRejectionReason | null) => void>();
    makeConnection({ onRejectionChange });

    connectSuccessfully();

    expect(onRejectionChange).toHaveBeenCalledWith(null);
  });
});

describe('connectToRelay rejection', () => {
  const codeCases = Object.entries(JOIN_REJECTION_CLOSE_CODES) as Array<
    [JoinRejectionReason, number]
  >;

  it.each(codeCases)('maps close code for %s and stops reconnecting', (reason, code) => {
    const onRejectionChange = vi.fn<(r: JoinRejectionReason | null) => void>();
    const onReconnectingChange = vi.fn<(r: boolean) => void>();
    makeConnection({ onRejectionChange, onReconnectingChange });
    connectSuccessfully();
    const socketCount = sockets.length;

    latestSocket().simulateClose(code);
    vi.advanceTimersByTime(10_000);

    expect(onRejectionChange).toHaveBeenLastCalledWith(reason);
    expect(onReconnectingChange).not.toHaveBeenCalledWith(true);
    expect(sockets.length).toBe(socketCount);
  });

  it('treats an unknown close code as transient and keeps retrying', () => {
    const onReconnectingChange = vi.fn<(r: boolean) => void>();
    makeConnection({ onReconnectingChange });
    connectSuccessfully();
    const socketCount = sockets.length;

    latestSocket().simulateClose(1006);
    vi.advanceTimersByTime(10_000);

    expect(onReconnectingChange).toHaveBeenCalledWith(true);
    expect(sockets.length).toBeGreaterThan(socketCount);
  });

  it('does not report reconnecting before the first successful connect', () => {
    const onReconnectingChange = vi.fn<(r: boolean) => void>();
    makeConnection({ onReconnectingChange });

    latestSocket().simulateClose(1006);

    expect(onReconnectingChange).not.toHaveBeenCalledWith(true);
  });

  it('clears the rejection and the reconnecting flag on a successful reconnect', () => {
    const onRejectionChange = vi.fn<(r: JoinRejectionReason | null) => void>();
    const onReconnectingChange = vi.fn<(r: boolean) => void>();
    makeConnection({ onRejectionChange, onReconnectingChange });
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    vi.advanceTimersByTime(10_000);
    connectSuccessfully();

    expect(onRejectionChange).toHaveBeenLastCalledWith(null);
    expect(onReconnectingChange).toHaveBeenLastCalledWith(false);
  });
});

// ---------------------------------------------------------------------------
// connectToRelay — repeat-rejection throttle
// ---------------------------------------------------------------------------

describe('connectToRelay repeat rejection', () => {
  /** Close the live socket transiently and let the backoff open the next one. */
  function transientClose(): void {
    latestSocket().simulateClose(1006);
    vi.advanceTimersByTime(10_000);
  }

  it('fires once after three transient closes inside 60s', () => {
    const onRepeatRejection = vi.fn();
    makeConnection({ onRepeatRejection });
    connectSuccessfully();

    transientClose();
    transientClose();
    expect(onRepeatRejection).not.toHaveBeenCalled();

    transientClose();
    expect(onRepeatRejection).toHaveBeenCalledTimes(1);
  });

  it('resets its buffer after firing, so the next three are needed again', () => {
    const onRepeatRejection = vi.fn();
    makeConnection({ onRepeatRejection });
    connectSuccessfully();

    transientClose();
    transientClose();
    transientClose();
    transientClose();

    expect(onRepeatRejection).toHaveBeenCalledTimes(1);
  });

  it('does not fire when the three closes are spread past the 60s window', () => {
    const onRepeatRejection = vi.fn();
    makeConnection({ onRepeatRejection });
    connectSuccessfully();

    transientClose();
    vi.advanceTimersByTime(61_000);
    transientClose();
    vi.advanceTimersByTime(61_000);
    transientClose();

    expect(onRepeatRejection).not.toHaveBeenCalled();
  });

  it('resets its buffer on a successful reconnect', () => {
    const onRepeatRejection = vi.fn();
    makeConnection({ onRepeatRejection });
    connectSuccessfully();

    transientClose();
    transientClose();
    connectSuccessfully();
    transientClose();

    expect(onRepeatRejection).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// connectToRelay — onSynced
// ---------------------------------------------------------------------------

/**
 * Feed the connection a real y-websocket sync-step-2 frame, which is what
 * flips `provider.synced` to true. Going through the wire rather than
 * poking the provider keeps the test on the public seam.
 */
function deliverSyncStep2(doc: Y.Doc): void {
  const encoder = encoding.createEncoder();
  // y-websocket's `messageSync` channel, then the sync protocol's own frame.
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeSyncStep2(encoder, doc);
  latestSocket().onmessage?.({ data: encoding.toUint8Array(encoder) });
}

describe('connectToRelay onSynced', () => {
  it('fires exactly once on the first sync, never on a later one', () => {
    const onSynced = vi.fn();
    const doc = new Y.Doc();
    makeConnection({ doc, onSynced });
    connectSuccessfully();

    deliverSyncStep2(doc);
    expect(onSynced).toHaveBeenCalledTimes(1);

    // A transient close flips `synced` back to false — which must not fire —
    // and the sync on the next connection must not fire it a second time.
    latestSocket().simulateClose(1006);
    vi.advanceTimersByTime(10_000);
    connectSuccessfully();
    deliverSyncStep2(doc);

    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it('does not fire before the first sync completes', () => {
    const onSynced = vi.fn();
    makeConnection({ onSynced });

    connectSuccessfully();

    expect(onSynced).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// connectToRelay — updateCredentials
// ---------------------------------------------------------------------------

describe('connectToRelay updateCredentials', () => {
  it('is a no-op when the hash is unchanged', () => {
    const conn = makeConnection({
      credentials: { deviceId: 'device-1', roomCode: 'ABC123', passwordHash: 'hash-a' },
    });
    connectSuccessfully();
    const socketCount = sockets.length;

    conn.updateCredentials({ passwordHash: 'hash-a' });
    vi.advanceTimersByTime(10_000);

    expect(sockets.length).toBe(socketCount);
  });

  it('reconnects with the new pw, preserving did', () => {
    const conn = makeConnection({
      credentials: { deviceId: 'device-1', roomCode: 'ABC123', passwordHash: 'hash-a' },
    });
    connectSuccessfully();

    conn.updateCredentials({ passwordHash: 'hash-b' });

    expect(socketParams()).toEqual({ did: 'device-1', pw: 'hash-b' });
  });

  it('drops pw when passed null', () => {
    const conn = makeConnection({
      credentials: { deviceId: 'device-1', roomCode: 'ABC123', passwordHash: 'hash-a' },
    });
    connectSuccessfully();

    conn.updateCredentials({ passwordHash: null });

    expect(socketParams()).toEqual({ did: 'device-1' });
  });
});

// ---------------------------------------------------------------------------
// connectToRelay — disconnect
// ---------------------------------------------------------------------------

describe('connectToRelay disconnect', () => {
  it('is idempotent', () => {
    const conn = makeConnection();
    connectSuccessfully();

    conn.disconnect();
    expect(() => conn.disconnect()).not.toThrow();
  });

  it('stops reconnecting and reports reconnecting false', () => {
    const onReconnectingChange = vi.fn<(r: boolean) => void>();
    const conn = makeConnection({ onReconnectingChange });
    connectSuccessfully();
    latestSocket().simulateClose(1006);
    vi.advanceTimersByTime(10_000);
    expect(onReconnectingChange).toHaveBeenLastCalledWith(true);

    conn.disconnect();

    expect(onReconnectingChange).toHaveBeenLastCalledWith(false);
  });

  it('detaches status listeners', () => {
    const onStatusChange = vi.fn<(status: SyncStatus) => void>();
    const conn = makeConnection({ onStatusChange });
    connectSuccessfully();

    conn.disconnect();
    onStatusChange.mockClear();
    latestSocket().simulateClose(1006);

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('does not report reconnecting during teardown of a never-connected socket', () => {
    const onReconnectingChange = vi.fn<(r: boolean) => void>();
    const conn = makeConnection({ onReconnectingChange });

    conn.disconnect();

    expect(onReconnectingChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// connectToRelay — window online/offline
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// connectToRelay — window online/offline
// ---------------------------------------------------------------------------

describe('connectToRelay window events', () => {
  const listeners = new Map<string, Set<() => void>>();

  function fire(type: string): void {
    for (const listener of listeners.get(type) ?? []) listener();
  }

  function installFakeWindow(): void {
    listeners.clear();
    vi.stubGlobal('window', {
      addEventListener(type: string, listener: () => void): void {
        const set = listeners.get(type) ?? new Set<() => void>();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener(type: string, listener: () => void): void {
        listeners.get(type)?.delete(listener);
      },
    });
  }

  it('reports disconnected on offline without the socket closing', () => {
    installFakeWindow();
    const onStatusChange = vi.fn<(status: SyncStatus) => void>();
    makeConnection({ onStatusChange });
    connectSuccessfully();
    onStatusChange.mockClear();

    fire('offline');

    expect(onStatusChange).toHaveBeenCalledWith('disconnected');
  });

  it('forces a fresh socket on online', () => {
    installFakeWindow();
    makeConnection();
    connectSuccessfully();
    fire('offline');
    const socketCount = sockets.length;

    fire('online');
    vi.advanceTimersByTime(10_000);

    expect(sockets.length).toBeGreaterThan(socketCount);
  });

  it('detaches its listeners on disconnect', () => {
    installFakeWindow();
    const onStatusChange = vi.fn<(status: SyncStatus) => void>();
    const conn = makeConnection({ onStatusChange });
    connectSuccessfully();

    conn.disconnect();
    onStatusChange.mockClear();
    fire('offline');

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('is inert when there is no window', () => {
    expect(() => makeConnection()).not.toThrow();
  });
});
