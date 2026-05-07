/**
 * Unit tests for CLI sync.ts.
 *
 * Verifies URL construction, close-code → JoinRejectionReason mapping,
 * credential update + reconnect sequencing, and disconnect idempotency.
 * y-websocket's WebsocketProvider is fully mocked so no real network is
 * needed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

// ---------------------------------------------------------------------------
// Shared mock state — must be available when vi.mock factories execute
// ---------------------------------------------------------------------------

const providerState = vi.hoisted(() => ({
  instances: [] as ReturnType<typeof makeInstance>[],
  reset() {
    this.instances.length = 0;
  },
  last() {
    return this.instances.at(-1);
  },
}));

function makeInstance(
  serverUrl: string,
  _roomId: string,
  _doc: unknown,
  opts: Record<string, unknown>,
) {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  const params: Record<string, string> = { ...((opts['params'] ?? {}) as Record<string, string>) };

  return {
    serverUrl,
    params,
    shouldConnect: true,
    awareness: {},
    _callCounts: { on: 0, off: 0, connect: 0, disconnect: 0, destroy: 0 },
    on(event: string, handler: (...args: unknown[]) => void) {
      this._callCounts.on++;
      (handlers[event] ??= []).push(handler);
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      this._callCounts.off++;
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
    },
    connect() {
      this._callCounts.connect++;
    },
    disconnect() {
      this._callCounts.disconnect++;
    },
    destroy() {
      this._callCounts.destroy++;
    },
    _triggerStatus(status: string) {
      for (const h of handlers['status'] ?? []) h({ status });
    },
    _triggerClose(ev: { code: number } | null) {
      for (const h of handlers['connection-close'] ?? []) h(ev);
    },
  };
}

vi.mock('y-websocket', () => ({
  WebsocketProvider: vi
    .fn()
    .mockImplementation(
      (serverUrl: string, roomId: string, doc: unknown, opts: Record<string, unknown>) => {
        const inst = makeInstance(serverUrl, roomId, doc, opts);
        providerState.instances.push(inst);
        return inst;
      },
    ),
}));

vi.mock('ws', () => ({ default: class MockWS {} }));

// ---------------------------------------------------------------------------
// Import after mocks (Vitest hoists the mocks above these imports)
// ---------------------------------------------------------------------------

import { connect } from './sync.js';
import { JOIN_REJECTION_CLOSE_CODES } from '@hnch/shared';

const BASE_URL = 'http://localhost:1234';
const ROOM_UUID = 'uuid-abc-123';
const DEVICE_ID = 'device-1';

function makeDoc(): Y.Doc {
  return new Y.Doc();
}

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

describe('connect — URL construction', () => {
  beforeEach(() => providerState.reset());

  it('converts http base URL to ws:// and appends /ws', () => {
    connect({ wsBaseUrl: BASE_URL, roomUuid: ROOM_UUID, doc: makeDoc(), deviceId: DEVICE_ID });
    expect(providerState.last()!.serverUrl).toBe('ws://localhost:1234/ws');
  });

  it('converts https base URL to wss://', () => {
    connect({
      wsBaseUrl: 'https://relay.example.com',
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
    });
    expect(providerState.last()!.serverUrl).toBe('wss://relay.example.com/ws');
  });

  it('always includes did param', () => {
    connect({ wsBaseUrl: BASE_URL, roomUuid: ROOM_UUID, doc: makeDoc(), deviceId: 'dev-xyz' });
    expect(providerState.last()!.params['did']).toBe('dev-xyz');
  });

  it('includes pw param when passwordHash is provided', () => {
    connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
      passwordHash: 'abc123',
    });
    expect(providerState.last()!.params['pw']).toBe('abc123');
  });

  it('omits pw param when passwordHash is undefined', () => {
    connect({ wsBaseUrl: BASE_URL, roomUuid: ROOM_UUID, doc: makeDoc(), deviceId: DEVICE_ID });
    expect(providerState.last()!.params['pw']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Status callbacks
// ---------------------------------------------------------------------------

describe('connect — status callbacks', () => {
  beforeEach(() => providerState.reset());

  it('forwards status events to onStatusChange', () => {
    const onStatusChange = vi.fn();
    connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
      onStatusChange,
    });

    providerState.last()!._triggerStatus('connected');
    expect(onStatusChange).toHaveBeenCalledWith('connected');

    providerState.last()!._triggerStatus('disconnected');
    expect(onStatusChange).toHaveBeenCalledWith('disconnected');
  });

  it('does not throw when onStatusChange is not provided', () => {
    connect({ wsBaseUrl: BASE_URL, roomUuid: ROOM_UUID, doc: makeDoc(), deviceId: DEVICE_ID });
    expect(() => providerState.last()!._triggerStatus('connected')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Close-code → JoinRejectionReason mapping
// ---------------------------------------------------------------------------

describe('connect — connection-close mapping', () => {
  beforeEach(() => providerState.reset());

  it('maps every known rejection close code to the correct reason', () => {
    const onRejection = vi.fn();
    connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
      onRejection,
    });

    const provider = providerState.last()!;
    for (const [reason, code] of Object.entries(JOIN_REJECTION_CLOSE_CODES) as [string, number][]) {
      onRejection.mockClear();
      provider.shouldConnect = true;
      provider._triggerClose({ code });
      expect(onRejection).toHaveBeenCalledWith(reason);
    }
  });

  it('sets shouldConnect=false and calls disconnect() on a rejection close', () => {
    connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
      onRejection: vi.fn(),
    });

    const provider = providerState.last()!;
    provider._triggerClose({ code: JOIN_REJECTION_CLOSE_CODES['wrong-password'] });

    expect(provider.shouldConnect).toBe(false);
    expect(provider._callCounts.disconnect).toBeGreaterThanOrEqual(1);
  });

  it('is a no-op for unmapped close codes (1000, 1006)', () => {
    const onRejection = vi.fn();
    connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
      onRejection,
    });

    const provider = providerState.last()!;
    provider._triggerClose({ code: 1000 });
    provider._triggerClose({ code: 1006 });

    expect(onRejection).not.toHaveBeenCalled();
    expect(provider._callCounts.disconnect).toBe(0);
  });

  it('is a no-op when the close event is null', () => {
    const onRejection = vi.fn();
    connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
      onRejection,
    });

    expect(() => providerState.last()!._triggerClose(null)).not.toThrow();
    expect(onRejection).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// disconnect()
// ---------------------------------------------------------------------------

describe('connect — disconnect()', () => {
  beforeEach(() => providerState.reset());

  it('calls provider.disconnect() and provider.destroy()', () => {
    const conn = connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
    });
    conn.disconnect();

    const provider = providerState.last()!;
    expect(provider.shouldConnect).toBe(false);
    expect(provider._callCounts.disconnect).toBeGreaterThanOrEqual(1);
    expect(provider._callCounts.destroy).toBe(1);
  });

  it('is idempotent: second call does not invoke provider methods again', () => {
    const conn = connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
    });
    conn.disconnect();
    conn.disconnect();

    const provider = providerState.last()!;
    // Each should be called exactly once despite two disconnect() calls
    expect(provider._callCounts.disconnect).toBe(1);
    expect(provider._callCounts.destroy).toBe(1);
  });

  it('de-registers status and connection-close listeners', () => {
    const conn = connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
    });
    conn.disconnect();

    const provider = providerState.last()!;
    expect(provider._callCounts.off).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// updateCredentials()
// ---------------------------------------------------------------------------

describe('connect — updateCredentials()', () => {
  beforeEach(() => providerState.reset());

  it('is a no-op when the password hash is unchanged', () => {
    const conn = connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
      passwordHash: 'hash1',
    });
    conn.updateCredentials({ passwordHash: 'hash1' });

    const provider = providerState.last()!;
    expect(provider._callCounts.connect).toBe(0);
    expect(provider._callCounts.disconnect).toBe(0);
  });

  it('triggers reconnect when password hash changes', () => {
    const conn = connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
      passwordHash: 'old-hash',
    });
    conn.updateCredentials({ passwordHash: 'new-hash' });

    const provider = providerState.last()!;
    expect(provider._callCounts.disconnect).toBeGreaterThanOrEqual(1);
    expect(provider._callCounts.connect).toBeGreaterThanOrEqual(1);
  });

  it('updates pw param and preserves did after a hash change', () => {
    const conn = connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
      passwordHash: 'old-hash',
    });
    conn.updateCredentials({ passwordHash: 'new-hash' });

    const provider = providerState.last()!;
    expect(provider.params['pw']).toBe('new-hash');
    expect(provider.params['did']).toBe(DEVICE_ID);
  });

  it('removes pw param when passwordHash is set to null', () => {
    const conn = connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
      passwordHash: 'old-hash',
    });
    conn.updateCredentials({ passwordHash: null });

    expect(providerState.last()!.params['pw']).toBeUndefined();
  });

  it('adds pw param when an open room gains a password', () => {
    const conn = connect({
      wsBaseUrl: BASE_URL,
      roomUuid: ROOM_UUID,
      doc: makeDoc(),
      deviceId: DEVICE_ID,
    });
    conn.updateCredentials({ passwordHash: 'new-hash' });

    const provider = providerState.last()!;
    expect(provider.params['pw']).toBe('new-hash');
    expect(provider._callCounts.connect).toBeGreaterThanOrEqual(1);
  });
});
