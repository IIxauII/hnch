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
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  connectToRelay,
  mintRoom,
  patchRoomAccess,
  RELAY_REQUEST_TIMEOUT_MS,
  relayHttpToWsUrl,
  RelayRejectionError,
  resolveRoom,
  type ConnectToRelayOptions,
  type RelayConnection,
  type SyncStatus,
} from './relay-client.js';
import { JOIN_REJECTION_CLOSE_CODES, type JoinRejectionReason } from './auth.js';

// Fake WebSocket

/** Minimal fake that lets tests drive open/close/error events. */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  binaryType = 'blob';
  /** Bytes queued but not yet handed to the network. */
  bufferedAmount = 0;
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

// Harness

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
  // Nothing in here talks to a real relay. A connection asks one why its
  // socket closed; by default there is none to answer.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('fetch failed');
    }),
  );
});

afterEach(() => {
  for (const conn of connections.splice(0)) conn.disconnect();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

    expect(fetchMock).toHaveBeenCalledWith('http://relay.test/rooms/A%20B%2FC', expect.anything());
  });

  it('throws a typed RelayRejectionError carrying the 404 reason', async () => {
    stubFetch({ status: 404, json: async () => ({ reason: 'room-full' }) });

    await expect(resolveRoom('http://relay.test', 'ABC123')).rejects.toMatchObject({
      name: 'RelayRejectionError',
      reason: 'room-full',
    });
  });

  it('takes the relay at its word when it says the room is unknown', async () => {
    stubFetch({ status: 404, json: async () => ({ reason: 'unknown-room' }) });

    await expect(resolveRoom('http://relay.test', 'ABC123')).rejects.toMatchObject({
      name: 'RelayRejectionError',
      reason: 'unknown-room',
    });
  });

  // What answers a 404 may not be the relay: a proxy, a relay URL that
  // points at something else. Callers forget a session when they are told it
  // is unknown — and a reason ends up in front of the user, in the CLI as it
  // came.
  describe('a 404 that is not the relay speaking', () => {
    const answers: Array<[string, () => Promise<unknown>]> = [
      [
        'gives a reason that is not one of the reasons there are',
        async () => ({ reason: '\u001b[2J gone' }),
      ],
      ['gives none', async () => ({ error: 'not-found' })],
      ['is not an object', async () => 'Not Found'],
      [
        'cannot be read',
        async () => {
          throw new Error('not json');
        },
      ],
    ];

    for (const [what, json] of answers) {
      it(`is no verdict when it ${what}`, async () => {
        stubFetch({ status: 404, json });

        const err = await resolveRoom('http://relay.test', 'ABC123').catch((e: unknown) => e);

        expect(err).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(RelayRejectionError);
        expect((err as Error).message).toBe('GET /rooms/:code failed: 404');
      });
    }
  });

  it('throws a generic Error on other non-ok statuses', async () => {
    stubFetch({ status: 503 });

    const err = await resolveRoom('http://relay.test', 'ABC123').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(RelayRejectionError);
    expect((err as Error).message).toBe('GET /rooms/:code failed: 503');
  });
});

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

// A relay that does not answer

// `fetch` waits for as long as it takes. On a connection that went stale that
// is minutes, with "Creating…" or "Joining…" on screen all the while.
describe('a request the relay does not answer', () => {
  /** A relay that takes the request and never answers it. */
  function stubSilentRelay() {
    const fetchMock = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) reject(signal.reason);
          signal?.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const requests: Array<[string, () => Promise<unknown>]> = [
    ['mintRoom', () => mintRoom('http://relay.test')],
    ['resolveRoom', () => resolveRoom('http://relay.test', 'ABC123')],
    ['patchRoomAccess', () => patchRoomAccess('http://relay.test', 'u-1', 'hash-abc')],
  ];

  for (const [name, request] of requests) {
    it(`${name} gives up after a while`, async () => {
      // `AbortSignal.timeout` keeps its own time.
      vi.useRealTimers();
      const timeout = vi
        .spyOn(AbortSignal, 'timeout')
        .mockImplementation(() =>
          AbortSignal.abort(new DOMException('took too long', 'TimeoutError')),
        );
      const fetchMock = stubSilentRelay();

      await expect(request()).rejects.toMatchObject({ name: 'TimeoutError' });

      expect(timeout).toHaveBeenCalledExactlyOnceWith(RELAY_REQUEST_TIMEOUT_MS);
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  }

  it('waits long enough for a relay that is only slow', () => {
    expect(RELAY_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
  });
});

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

// connectToRelay — URL and params

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

// connectToRelay — status and rejection

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

// connectToRelay — a refusal the socket cannot report

describe('connectToRelay refusal before the upgrade', () => {
  /** What `GET /rooms/ABC123` answers while the socket is being refused. */
  function relayAnswers(
    room: { uuid?: string; accessMode: string } | 'gone',
  ): ReturnType<typeof vi.fn> {
    if (room === 'gone') {
      return stubFetch({ status: 404, json: async () => ({ reason: 'unknown-room' }) });
    }
    return stubFetch({
      json: async () => ({ uuid: room.uuid ?? 'room-uuid-test', accessMode: room.accessMode }),
    });
  }

  /** Let the question go out and its answer come back. */
  async function answered(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
  }

  function observed() {
    const onRejectionChange = vi.fn<(r: JoinRejectionReason | null) => void>();
    const onReconnectingChange = vi.fn<(r: boolean) => void>();
    return { onRejectionChange, onReconnectingChange };
  }

  // The host set a password while this peer's socket was down. The relay
  // answers its next handshake with HTTP 400 — which a browser reports as a
  // close without a code, the same as a dropped link.
  it('stops retrying once the session has been given a password it does not carry', async () => {
    const fetchMock = relayAnswers({ accessMode: 'password' });
    const { onRejectionChange, onReconnectingChange } = observed();
    makeConnection({ onRejectionChange, onReconnectingChange });
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    await answered();
    const socketCount = sockets.length;
    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:1234/rooms/ABC123', expect.anything());
    expect(onRejectionChange).toHaveBeenLastCalledWith('wrong-password');
    expect(onReconnectingChange).toHaveBeenLastCalledWith(false);
    expect(sockets.length).toBe(socketCount);
  });

  it('stops retrying once the relay no longer has the session', async () => {
    relayAnswers('gone');
    const { onRejectionChange, onReconnectingChange } = observed();
    makeConnection({ onRejectionChange, onReconnectingChange });
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    await answered();
    const socketCount = sockets.length;
    await vi.advanceTimersByTimeAsync(30_000);

    expect(onRejectionChange).toHaveBeenLastCalledWith('unknown-room');
    expect(onReconnectingChange).toHaveBeenLastCalledWith(false);
    expect(sockets.length).toBe(socketCount);
  });

  // A proxy, a captive portal, a load balancer in the middle of a deploy:
  // their 404 is about themselves. Ending the session on it would be final.
  it('keeps retrying on a 404 that is not the relay saying so', async () => {
    for (const body of [null, {}, { reason: 'not-found' }, { reason: 'room-full' }, 'Not Found']) {
      stubFetch({ status: 404, json: async () => body });
      const { onRejectionChange } = observed();
      makeConnection({ onRejectionChange });
      connectSuccessfully();
      const socketCount = sockets.length;

      latestSocket().simulateClose(1006);
      await answered();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(onRejectionChange, JSON.stringify(body)).not.toHaveBeenCalledWith(expect.any(String));
      expect(sockets.length, JSON.stringify(body)).toBeGreaterThan(socketCount);
    }
  });

  it('keeps retrying on a 404 whose body cannot be read', async () => {
    stubFetch({
      status: 404,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });
    const { onRejectionChange } = observed();
    makeConnection({ onRejectionChange });
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    await answered();

    expect(onRejectionChange).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('keeps retrying on an answer that is not what the relay sends', async () => {
    for (const body of [null, 'ok', {}, { accessMode: 'password' }, { uuid: 7 }]) {
      stubFetch({ json: async () => body });
      const { onRejectionChange } = observed();
      makeConnection({ onRejectionChange });
      connectSuccessfully();

      latestSocket().simulateClose(1006);
      await answered();

      expect(onRejectionChange, JSON.stringify(body)).not.toHaveBeenCalledWith(expect.any(String));
    }
  });

  // The host's socket is down when the host sets a password. The question
  // went out before, without one; the answer comes back after, saying the
  // session has one. It is about a connection that no longer exists.
  it('drops an answer about credentials that have been replaced since', async () => {
    let answer!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      ),
    );
    const { onRejectionChange } = observed();
    const conn = makeConnection({ onRejectionChange });
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    await vi.advanceTimersByTimeAsync(0);
    conn.updateCredentials({ passwordHash: 'hash' });
    const socketCount = sockets.length;
    answer({
      ok: true,
      status: 200,
      json: async () => ({ uuid: 'room-uuid-test', accessMode: 'password' }),
    });
    await answered();

    expect(onRejectionChange).not.toHaveBeenCalledWith(expect.any(String));
    // The re-handshake goes on, with the password
    expect(socketParams()['pw']).toBe('hash');
    connectSuccessfully();
    expect(sockets.length).toBe(socketCount);
    expect(onRejectionChange).toHaveBeenLastCalledWith(null);
  });

  // Codes are handed out again once a session has expired.
  it('takes the session for gone when its code belongs to another one now', async () => {
    relayAnswers({ uuid: 'another-room', accessMode: 'open' });
    const { onRejectionChange } = observed();
    makeConnection({ onRejectionChange });
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    await answered();

    expect(onRejectionChange).toHaveBeenLastCalledWith('unknown-room');
  });

  it('applies to a connection that never came up, too', async () => {
    relayAnswers({ accessMode: 'password' });
    const { onRejectionChange } = observed();
    makeConnection({ onRejectionChange });

    latestSocket().simulateClose(1006);
    await answered();

    expect(onRejectionChange).toHaveBeenLastCalledWith('wrong-password');
  });

  it('keeps retrying when the relay cannot be reached', async () => {
    const { onRejectionChange, onReconnectingChange } = observed();
    makeConnection({ onRejectionChange, onReconnectingChange });
    connectSuccessfully();
    const socketCount = sockets.length;

    latestSocket().simulateClose(1006);
    await answered();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onRejectionChange).not.toHaveBeenCalledWith(expect.any(String));
    expect(onReconnectingChange).toHaveBeenLastCalledWith(true);
    expect(sockets.length).toBeGreaterThan(socketCount);
  });

  it('keeps retrying when the relay has nothing against the connection', async () => {
    relayAnswers({ accessMode: 'open' });
    const { onRejectionChange } = observed();
    makeConnection({ onRejectionChange });
    connectSuccessfully();
    const socketCount = sockets.length;

    latestSocket().simulateClose(1006);
    await answered();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onRejectionChange).not.toHaveBeenCalledWith(expect.any(String));
    expect(sockets.length).toBeGreaterThan(socketCount);
  });

  it('keeps retrying when the relay answers with an error', async () => {
    stubFetch({ status: 503 });
    const { onRejectionChange } = observed();
    makeConnection({ onRejectionChange });
    connectSuccessfully();
    const socketCount = sockets.length;

    latestSocket().simulateClose(1006);
    await answered();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onRejectionChange).not.toHaveBeenCalledWith(expect.any(String));
    expect(sockets.length).toBeGreaterThan(socketCount);
  });

  // With a password in hand the relay takes the socket and answers in a
  // close code, right or wrong. Whether it is right is not for us to guess.
  it('leaves a connection that carries a password to the close code', async () => {
    relayAnswers({ accessMode: 'password' });
    const { onRejectionChange } = observed();
    makeConnection({
      onRejectionChange,
      credentials: { deviceId: 'device-001', roomCode: 'ABC123', passwordHash: 'hash' },
    });
    connectSuccessfully();
    const socketCount = sockets.length;

    latestSocket().simulateClose(1006);
    await answered();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onRejectionChange).not.toHaveBeenCalledWith(expect.any(String));
    expect(sockets.length).toBeGreaterThan(socketCount);
  });

  it('goes by the password the connection carries now, not the one it started with', async () => {
    relayAnswers({ accessMode: 'password' });
    const { onRejectionChange } = observed();
    const conn = makeConnection({ onRejectionChange });
    connectSuccessfully();
    conn.updateCredentials({ passwordHash: 'hash' });
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    await answered();

    expect(onRejectionChange).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('does not ask again within five seconds of having asked', async () => {
    const fetchMock = relayAnswers({ accessMode: 'open' });
    makeConnection();
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    await answered();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The next socket is up within the backoff, and fails as well
    await vi.advanceTimersByTimeAsync(3_000);
    latestSocket().simulateClose(1006);
    await answered();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_000);
    latestSocket().simulateClose(1006);
    await answered();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('says nothing when the connection came back while the question was out', async () => {
    let answer!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      ),
    );
    const { onRejectionChange } = observed();
    makeConnection({ onRejectionChange });
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    await vi.advanceTimersByTimeAsync(10_000);
    connectSuccessfully();
    answer({
      ok: true,
      status: 200,
      json: async () => ({ uuid: 'room-uuid-test', accessMode: 'password' }),
    });
    await answered();

    expect(onRejectionChange).not.toHaveBeenCalledWith(expect.any(String));
    expect(onRejectionChange).toHaveBeenLastCalledWith(null);
  });

  it('asks one question at a time', async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    makeConnection();
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    // Well past the interval, with sockets failing all the while
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(3_000);
      latestSocket().simulateClose(1006);
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives the question a time limit', async () => {
    const fetchMock = relayAnswers({ accessMode: 'open' });
    makeConnection();
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    await answered();

    const init = fetchMock.mock.calls[0]?.[1] as { signal?: AbortSignal } | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  // A request on a connection that went stale can hang for minutes, and no
  // second question goes out while the first is pending. The limit is what
  // frees the slot.
  it('asks again after a question that ran out of time', async () => {
    // The limit, in the hands of the test: `AbortSignal.timeout` keeps time
    // of its own.
    const limits: AbortController[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const limit = new AbortController();
      limits.push(limit);
      return limit.signal;
    });
    // A relay that takes the question and never answers it
    const fetchMock = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { onRejectionChange } = observed();
    makeConnection({ onRejectionChange });
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    await answered();
    // Sockets keep failing, and the question is still out
    await vi.advanceTimersByTimeAsync(6_000);
    latestSocket().simulateClose(1006);
    await answered();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    limits[0]!.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    await answered();
    await vi.advanceTimersByTimeAsync(6_000);
    latestSocket().simulateClose(1006);
    await answered();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRejectionChange).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('is not kept from asking by a clock that was set back', async () => {
    const fetchMock = relayAnswers({ accessMode: 'open' });
    makeConnection();
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    await answered();
    vi.setSystemTime(Date.now() - 3_600_000);
    await vi.advanceTimersByTimeAsync(3_000);
    latestSocket().simulateClose(1006);
    await answered();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('says nothing after disconnect()', async () => {
    let answer!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      ),
    );
    const { onRejectionChange } = observed();
    const conn = makeConnection({ onRejectionChange });
    connectSuccessfully();

    latestSocket().simulateClose(1006);
    await vi.advanceTimersByTimeAsync(0);
    conn.disconnect();
    answer({
      ok: true,
      status: 200,
      json: async () => ({ uuid: 'room-uuid-test', accessMode: 'password' }),
    });
    await answered();

    expect(onRejectionChange).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('does not ask about a close the relay gave a reason for', async () => {
    const fetchMock = relayAnswers({ accessMode: 'password' });
    const { onRejectionChange } = observed();
    makeConnection({ onRejectionChange });
    connectSuccessfully();

    latestSocket().simulateClose(JOIN_REJECTION_CLOSE_CODES['room-full']);
    await answered();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onRejectionChange).toHaveBeenLastCalledWith('room-full');
  });
});

// connectToRelay — repeat-rejection throttle

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

// connectToRelay — onSynced

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

// connectToRelay — onSyncedChange

describe('connectToRelay onSyncedChange', () => {
  it('stays silent while the socket is open but not yet synced', () => {
    const onSyncedChange = vi.fn();
    makeConnection({ onSyncedChange });

    connectSuccessfully();

    expect(onSyncedChange).not.toHaveBeenCalled();
  });

  it('reports true on sync, false on close, and true again on the next sync', () => {
    const onSyncedChange = vi.fn();
    const doc = new Y.Doc();
    makeConnection({ doc, onSyncedChange });
    connectSuccessfully();

    deliverSyncStep2(doc);
    expect(onSyncedChange.mock.calls).toEqual([[true]]);

    latestSocket().simulateClose(1006);
    expect(onSyncedChange.mock.calls).toEqual([[true], [false]]);

    vi.advanceTimersByTime(10_000);
    connectSuccessfully();
    // Reconnected, but the relay's state has not applied yet.
    expect(onSyncedChange.mock.calls).toEqual([[true], [false]]);

    deliverSyncStep2(doc);
    expect(onSyncedChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('fires after the one-shot onSynced, so its post-sync write has landed', () => {
    const order: string[] = [];
    const doc = new Y.Doc();
    makeConnection({
      doc,
      onSynced: () => order.push('onSynced'),
      onSyncedChange: (synced) => order.push(`onSyncedChange:${String(synced)}`),
    });
    connectSuccessfully();

    deliverSyncStep2(doc);

    expect(order).toEqual(['onSynced', 'onSyncedChange:true']);
  });

  it('reports false on disconnect and nothing afterwards', () => {
    const onSyncedChange = vi.fn();
    const doc = new Y.Doc();
    const conn = makeConnection({ doc, onSyncedChange });
    connectSuccessfully();
    deliverSyncStep2(doc);
    onSyncedChange.mockClear();

    conn.disconnect();

    expect(onSyncedChange.mock.calls).toEqual([[false]]);
  });

  // It reports a change. A connection that never synced has none to report.
  it('says nothing on disconnect when it never synced', () => {
    const onSyncedChange = vi.fn();
    const conn = makeConnection({ onSyncedChange });
    connectSuccessfully();

    conn.disconnect();

    expect(onSyncedChange).not.toHaveBeenCalled();
  });
});

// connectToRelay — updateCredentials

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

// connectToRelay — presence across a reconnect
//
// `y-protocols` takes an awareness state only when its clock is newer than
// the last one seen for that client, and a reconnect leaves both sides
// holding clocks that are not. What is asserted here is what a peer and a
// caller can observe: what goes out on the new socket, and who is in
// `awareness.getStates()` after the relay has replayed the room's presence.

const MESSAGE_AWARENESS = 1;

/** A peer's presence as the relay relays it: one awareness message. */
function awarenessMessageFrom(peer: awarenessProtocol.Awareness): ArrayBuffer {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(peer, [peer.clientID]),
  );
  const bytes = encoding.toUint8Array(encoder);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** The clocks a socket was sent awareness states under, for one client. */
function awarenessClocksSent(ws: FakeWebSocket, clientId: number): number[] {
  const clocks: number[] = [];
  for (const [payload] of ws.send.mock.calls as [Uint8Array][]) {
    const decoder = decoding.createDecoder(new Uint8Array(payload));
    if (decoding.readVarUint(decoder) !== MESSAGE_AWARENESS) continue;
    const update = decoding.createDecoder(decoding.readVarUint8Array(decoder));
    const count = decoding.readVarUint(update);
    for (let i = 0; i < count; i++) {
      const id = decoding.readVarUint(update);
      const clock = decoding.readVarUint(update);
      decoding.readVarString(update);
      if (id === clientId) clocks.push(clock);
    }
  }
  return clocks;
}

/** A second participant, as its own client would hold it. */
function makePeer(participantId: string): awarenessProtocol.Awareness {
  const peer = new awarenessProtocol.Awareness(new Y.Doc());
  peer.setLocalStateField('participantId', participantId);
  return peer;
}

/** Drop the connection the way a network does, and let the retry come up. */
function reconnect(): void {
  latestSocket().simulateClose(1006, '', false);
  vi.advanceTimersByTime(10_000);
  connectSuccessfully();
}

describe('connectToRelay new credentials after a refusal', () => {
  // What was refused was the connection as it was.
  it('takes the refusal back and connects again', () => {
    const onRejectionChange = vi.fn<(r: JoinRejectionReason | null) => void>();
    const conn = makeConnection({ onRejectionChange });
    connectSuccessfully();
    latestSocket().simulateClose(JOIN_REJECTION_CLOSE_CODES['wrong-password']);
    expect(onRejectionChange).toHaveBeenLastCalledWith('wrong-password');
    const socketCount = sockets.length;

    conn.updateCredentials({ passwordHash: 'the-new-one' });

    expect(onRejectionChange).toHaveBeenLastCalledWith(null);
    expect(sockets.length).toBe(socketCount + 1);
    expect(socketParams()['pw']).toBe('the-new-one');
  });
});

describe('connectToRelay re-handshake', () => {
  // Changing the password closes the socket and opens one with the new hash.
  // Nothing was lost, so nothing is announced as lost and found.
  it('is not reported as reconnecting', () => {
    const onReconnectingChange = vi.fn();
    const conn = makeConnection({ onReconnectingChange });
    connectSuccessfully();

    conn.updateCredentials({ passwordHash: 'hash-a' });
    connectSuccessfully();

    expect(onReconnectingChange).not.toHaveBeenCalled();
  });

  // The socket was down already. Nothing was put down on purpose, and the
  // outage is not over because the credentials changed during it.
  it('does not hide an outage that was under way', () => {
    const onReconnectingChange = vi.fn<(r: boolean) => void>();
    const conn = makeConnection({ onReconnectingChange });
    connectSuccessfully();
    latestSocket().simulateClose(1006);
    expect(onReconnectingChange).toHaveBeenLastCalledWith(true);

    conn.updateCredentials({ passwordHash: 'new-hash' });

    expect(onReconnectingChange).toHaveBeenLastCalledWith(true);
    connectSuccessfully();
    expect(onReconnectingChange).toHaveBeenLastCalledWith(false);
  });

  it('becomes a reconnect like any other once the new socket fails', () => {
    const onReconnectingChange = vi.fn();
    const conn = makeConnection({ onReconnectingChange });
    connectSuccessfully();

    conn.updateCredentials({ passwordHash: 'hash-a' });
    latestSocket().simulateClose(1006, '', false);

    expect(onReconnectingChange.mock.calls).toEqual([[true]]);
  });

  it('reports reconnecting again for a drop after it went through', () => {
    const onReconnectingChange = vi.fn();
    const conn = makeConnection({ onReconnectingChange });
    connectSuccessfully();
    conn.updateCredentials({ passwordHash: 'hash-a' });
    connectSuccessfully();

    latestSocket().simulateClose(1006, '', false);

    expect(onReconnectingChange.mock.calls).toEqual([[true]]);
  });
});

describe('connectToRelay presence across a reconnect', () => {
  it('comes back under a newer clock, so peers take it for present again', () => {
    const conn = makeConnection();
    conn.awareness.setLocalStateField('participantId', 'me');
    connectSuccessfully();
    const first = latestSocket();
    const me = conn.awareness.clientID;
    const before = Math.max(...awarenessClocksSent(first, me));

    reconnect();

    const after = awarenessClocksSent(latestSocket(), me);
    expect(latestSocket()).not.toBe(first);
    expect(after.length).toBeGreaterThan(0);
    // Peers have recorded us as gone at `before`; only a later clock counts.
    expect(Math.min(...after)).toBeGreaterThan(before);
  });

  it('keeps what it said about itself', () => {
    const conn = makeConnection();
    conn.awareness.setLocalStateField('participantId', 'me');
    connectSuccessfully();

    reconnect();

    expect(conn.awareness.getLocalState()).toEqual({ participantId: 'me' });
  });

  // The caller keeps its awareness across `disconnect()` and a new
  // `connectToRelay`. To the new connection that is a first connect; to the
  // peers it is someone coming back at a clock they have already seen.
  it('does the same for an awareness instance that was connected before', () => {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalStateField('participantId', 'me');
    const first = makeConnection({ doc, awareness });
    connectSuccessfully();
    const me = awareness.clientID;
    const before = Math.max(...awarenessClocksSent(latestSocket(), me));
    const peer = makePeer('them');
    latestSocket().onmessage?.({ data: awarenessMessageFrom(peer) });
    first.disconnect();

    // `disconnect` destroys the provider, not the awareness it was handed:
    // what it said about itself is still there, at the clock it was said at.
    makeConnection({ doc, awareness });
    connectSuccessfully();
    latestSocket().onmessage?.({ data: awarenessMessageFrom(peer) });

    expect(Math.min(...awarenessClocksSent(latestSocket(), me))).toBeGreaterThan(before);
    expect(awareness.getStates().get(peer.clientID)).toEqual({ participantId: 'them' });
  });

  it('takes a peer for present again when the relay replays its unchanged state', () => {
    const conn = makeConnection();
    conn.awareness.setLocalStateField('participantId', 'me');
    connectSuccessfully();
    const peer = makePeer('them');
    latestSocket().onmessage?.({ data: awarenessMessageFrom(peer) });
    expect(conn.awareness.getStates().get(peer.clientID)).toEqual({ participantId: 'them' });

    // The drop clears every peer...
    latestSocket().simulateClose(1006, '', false);
    expect(conn.awareness.getStates().has(peer.clientID)).toBe(false);

    // ...and the relay replays the room to the new socket. The peer has done
    // nothing in between: same state, same clock.
    vi.advanceTimersByTime(10_000);
    connectSuccessfully();
    latestSocket().onmessage?.({ data: awarenessMessageFrom(peer) });

    expect(conn.awareness.getStates().get(peer.clientID)).toEqual({ participantId: 'them' });
  });

  it('does the same when the reconnect is a change of password', () => {
    const conn = makeConnection();
    conn.awareness.setLocalStateField('participantId', 'me');
    connectSuccessfully();
    const me = conn.awareness.clientID;
    const before = Math.max(...awarenessClocksSent(latestSocket(), me));
    const peer = makePeer('them');
    latestSocket().onmessage?.({ data: awarenessMessageFrom(peer) });

    conn.updateCredentials({ passwordHash: 'hash-a' });
    connectSuccessfully();
    latestSocket().onmessage?.({ data: awarenessMessageFrom(peer) });

    expect(Math.min(...awarenessClocksSent(latestSocket(), me))).toBeGreaterThan(before);
    expect(conn.awareness.getStates().get(peer.clientID)).toEqual({ participantId: 'them' });
  });

  it('does not bring a peer back by itself: only a replayed state does', () => {
    const conn = makeConnection();
    conn.awareness.setLocalStateField('participantId', 'me');
    connectSuccessfully();
    const peer = makePeer('them');
    latestSocket().onmessage?.({ data: awarenessMessageFrom(peer) });

    // The peer goes for good while we are connected.
    peer.setLocalState(null);
    latestSocket().onmessage?.({ data: awarenessMessageFrom(peer) });
    expect(conn.awareness.getStates().has(peer.clientID)).toBe(false);

    // The relay replays the states it holds, and it no longer holds this one.
    reconnect();

    expect(conn.awareness.getStates().has(peer.clientID)).toBe(false);
  });

  // The other side of forgetting a clock, pinned down so nobody relies on the
  // opposite: once forgotten, a state is taken at any clock. What keeps a
  // departed peer gone is the relay replaying only the states it still holds,
  // not anything in this module.
  it('takes any state for a peer whose clock it forgot, however old', () => {
    const conn = makeConnection();
    conn.awareness.setLocalStateField('participantId', 'me');
    connectSuccessfully();
    const peer = makePeer('them');
    const stale = awarenessMessageFrom(peer);
    peer.setLocalStateField('participantId', 'them');
    latestSocket().onmessage?.({ data: awarenessMessageFrom(peer) });

    reconnect();
    latestSocket().onmessage?.({ data: stale });

    expect(conn.awareness.getStates().has(peer.clientID)).toBe(true);
  });
});

// connectToRelay — disconnect

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

// connectToRelay — flush

describe('connectToRelay flush', () => {
  /** Start a flush and report whether it has resolved yet. */
  function flushing(conn: RelayConnection, capMs: number): () => boolean {
    let done = false;
    void conn.flush(capMs).then(() => {
      done = true;
    });
    return () => done;
  }

  it('resolves at once when nothing is waiting to be sent', async () => {
    const conn = makeConnection();
    connectSuccessfully();

    const done = flushing(conn, 500);
    await vi.advanceTimersByTimeAsync(0);

    expect(done()).toBe(true);
  });

  it('waits until what was queued has left the socket', async () => {
    const conn = makeConnection();
    connectSuccessfully();
    latestSocket().bufferedAmount = 64;

    const done = flushing(conn, 500);
    await vi.advanceTimersByTimeAsync(100);
    expect(done()).toBe(false);

    latestSocket().bufferedAmount = 0;
    await vi.advanceTimersByTimeAsync(20);
    expect(done()).toBe(true);
  });

  it('gives up at the cap rather than hold up a teardown', async () => {
    const conn = makeConnection();
    connectSuccessfully();
    latestSocket().bufferedAmount = 64;

    const done = flushing(conn, 200);
    await vi.advanceTimersByTimeAsync(150);
    expect(done()).toBe(false);

    await vi.advanceTimersByTimeAsync(70);
    expect(done()).toBe(true);
  });

  it('resolves at once with no socket open', async () => {
    const conn = makeConnection();
    latestSocket().bufferedAmount = 64;

    const done = flushing(conn, 500);
    await vi.advanceTimersByTimeAsync(0);

    expect(done()).toBe(true);
  });
});

// connectToRelay — window online/offline

// connectToRelay — window online/offline

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

  // The socket can stay open for a while after the network is gone. What
  // awareness says in that time is not to be believed.
  it('reports not synced on offline, and synced again once it is back', () => {
    installFakeWindow();
    const onSyncedChange = vi.fn();
    const doc = new Y.Doc();
    makeConnection({ doc, onSyncedChange });
    connectSuccessfully();
    deliverSyncStep2(doc);

    fire('offline');
    expect(onSyncedChange.mock.calls).toEqual([[true], [false]]);

    fire('online');
    vi.advanceTimersByTime(10_000);
    connectSuccessfully();
    deliverSyncStep2(doc);
    expect(onSyncedChange.mock.calls).toEqual([[true], [false], [true]]);
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
