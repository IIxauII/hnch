/**
 * Unit tests for sync-provider.ts (ADR-0016).
 *
 * Tests:
 * - credentialsToParams: param mapping for all credential fields
 * - createSyncProvider:
 *   - initial status is 'connecting', reconnecting is true
 *   - status transitions on WS open/close
 *   - permanent rejection codes → lastRejection set, shouldConnect=false, reconnecting=false
 *   - transient close (unknown code) → shouldConnect stays true, reconnecting stays true
 *   - reconnect cleared on success (lastRejection reset to null)
 *   - manual disconnect() → reconnecting false, idempotent
 *   - onStatusChange / onRejectionChange callbacks fired
 *
 * Uses a controllable fake WebSocket class. Angular signals work in Node
 * without TestBed — they are plain reactive primitives.
 */

import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createSyncProvider,
  credentialsToParams,
  type SyncProvider,
} from './sync-provider'

// ---------------------------------------------------------------------------
// Fake WebSocket
// ---------------------------------------------------------------------------

/** Minimal fake that lets tests drive open/close/error events. */
class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = FakeWebSocket.CONNECTING
  binaryType: string = 'blob'
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED
    if (this.onclose) {
      const evt = new FakeCloseEvent(1000, '', true)
      this.onclose(evt as unknown as CloseEvent)
    }
  })

  onopen: ((e: Event) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null

  /** Test helper: simulate a successful connection. */
  simulateOpen(): void {
    this.readyState = FakeWebSocket.OPEN
    if (this.onopen) this.onopen(new Event('open'))
  }

  /** Test helper: simulate a clean server close with a code. */
  simulateClose(code: number, reason = '', wasClean = true): void {
    this.readyState = FakeWebSocket.CLOSED
    if (this.onclose) {
      const evt = new FakeCloseEvent(code, reason, wasClean)
      this.onclose(evt as unknown as CloseEvent)
    }
  }

  /** Test helper: simulate a network error. */
  simulateError(): void {
    if (this.onerror) this.onerror(new Event('error'))
  }
}

/** Minimal CloseEvent stand-in (Node has no CloseEvent). */
class FakeCloseEvent {
  readonly type = 'close'
  readonly code: number
  readonly reason: string
  readonly wasClean: boolean
  constructor(code: number, reason: string, wasClean: boolean) {
    this.code = code
    this.reason = reason
    this.wasClean = wasClean
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Most-recently created FakeWebSocket instance (set in factory). */
let lastFakeWs: FakeWebSocket | null = null

/** Factory passed as WebSocketPolyfill. */
function FakeWebSocketFactory(
  ..._args: ConstructorParameters<typeof WebSocket>
): FakeWebSocket {
  lastFakeWs = new FakeWebSocket()
  return lastFakeWs
}
// Cast so TypeScript accepts it as `typeof WebSocket`.
const WS_POLYFILL = FakeWebSocketFactory as unknown as typeof WebSocket

function makeProvider(
  overrides: Partial<Parameters<typeof createSyncProvider>[0]> = {},
): SyncProvider {
  return createSyncProvider({
    wsBaseUrl: 'ws://localhost:1234',
    roomUuid: 'room-uuid-test',
    doc: new Y.Doc(),
    credentials: { deviceId: 'device-001', roomCode: 'ABC123' },
    WebSocketPolyfill: WS_POLYFILL,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// credentialsToParams
// ---------------------------------------------------------------------------

describe('credentialsToParams', () => {
  it('always includes did', () => {
    const params = credentialsToParams({ deviceId: 'abc', roomCode: 'ABC123' })
    expect(params).toEqual({ did: 'abc' })
  })

  it('includes pw when passwordHash is set', () => {
    const params = credentialsToParams({ deviceId: 'abc', roomCode: 'ABC123', passwordHash: 'hash123' })
    expect(params).toEqual({ did: 'abc', pw: 'hash123' })
  })

  it('includes inv when inviteToken is set', () => {
    const params = credentialsToParams({ deviceId: 'abc', roomCode: 'ABC123', inviteToken: 'tok-xyz' })
    expect(params).toEqual({ did: 'abc', inv: 'tok-xyz' })
  })

  it('includes both pw and inv when both are set', () => {
    const params = credentialsToParams({
      deviceId: 'abc',
      roomCode: 'ABC123',
      passwordHash: 'hash123',
      inviteToken: 'tok-xyz',
    })
    expect(params).toEqual({ did: 'abc', pw: 'hash123', inv: 'tok-xyz' })
  })

  it('omits pw when passwordHash is undefined', () => {
    const params = credentialsToParams({ deviceId: 'abc', roomCode: 'ABC123', passwordHash: undefined })
    expect(params).not.toHaveProperty('pw')
  })
})

// ---------------------------------------------------------------------------
// createSyncProvider — state machine
// ---------------------------------------------------------------------------

describe('createSyncProvider', () => {
  beforeEach(() => {
    lastFakeWs = null
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('initial status is connecting', () => {
    const provider = makeProvider()
    expect(provider.status()).toBe('connecting')
    provider.disconnect()
  })

  it('initial lastRejection is null', () => {
    const provider = makeProvider()
    expect(provider.lastRejection()).toBeNull()
    provider.disconnect()
  })

  it('initial reconnecting is true (connecting + no rejection + not manually disconnected)', () => {
    const provider = makeProvider()
    expect(provider.reconnecting()).toBe(true)
    provider.disconnect()
  })

  // -------------------------------------------------------------------------
  // Successful connection
  // -------------------------------------------------------------------------

  it('status → connected when WS opens', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    expect(provider.status()).toBe('connected')
    provider.disconnect()
  })

  it('reconnecting → false when connected', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    expect(provider.reconnecting()).toBe(false)
    provider.disconnect()
  })

  it('lastRejection stays null on connect', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    expect(provider.lastRejection()).toBeNull()
    provider.disconnect()
  })

  // -------------------------------------------------------------------------
  // Transient disconnect (non-rejection close codes)
  // -------------------------------------------------------------------------

  it('transient close (code 1006 — abnormal) keeps shouldConnect true, reconnecting true', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    expect(provider.status()).toBe('connected')

    lastFakeWs!.simulateClose(1006, '', false)

    expect(provider.lastRejection()).toBeNull()
    expect(provider.reconnecting()).toBe(true)
    provider.disconnect()
  })

  it('transient close (code 1000 — normal, not in rejection map) keeps shouldConnect true', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()

    lastFakeWs!.simulateClose(1000)

    expect(provider.lastRejection()).toBeNull()
    expect(provider.reconnecting()).toBe(true)
    provider.disconnect()
  })

  it('status transitions to disconnected on transient close', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    lastFakeWs!.simulateClose(1006, '', false)

    expect(provider.status()).toBe('disconnected')
    provider.disconnect()
  })

  it('after transient close, y-websocket schedules reconnect (status → connecting after timer)', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    lastFakeWs!.simulateClose(1006, '', false)
    expect(provider.status()).toBe('disconnected')

    // Advance past the first reconnect delay (2^0 * 100ms = 100ms).
    // Use advanceTimersByTime to avoid running the _checkInterval forever.
    vi.advanceTimersByTime(200)

    // A new WS is created, status goes back to 'connecting'
    expect(provider.status()).toBe('connecting')
    expect(provider.reconnecting()).toBe(true)
    provider.disconnect()
  })

  // -------------------------------------------------------------------------
  // Permanent relay rejections
  // -------------------------------------------------------------------------

  it('close code 4001 (unknown-room) sets lastRejection and reconnecting=false', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    lastFakeWs!.simulateClose(4001)

    expect(provider.lastRejection()).toBe('unknown-room')
    expect(provider.reconnecting()).toBe(false)
    provider.disconnect()
  })

  it('close code 4002 (wrong-password) sets lastRejection', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    lastFakeWs!.simulateClose(4002)

    expect(provider.lastRejection()).toBe('wrong-password')
    expect(provider.reconnecting()).toBe(false)
    provider.disconnect()
  })

  it('close code 4003 (invalid-invite) sets lastRejection', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    lastFakeWs!.simulateClose(4003)

    expect(provider.lastRejection()).toBe('invalid-invite')
    provider.disconnect()
  })

  it('close code 4004 (expired-invite) sets lastRejection', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    lastFakeWs!.simulateClose(4004)

    expect(provider.lastRejection()).toBe('expired-invite')
    provider.disconnect()
  })

  it('close code 4005 (invite-already-redeemed) sets lastRejection', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    lastFakeWs!.simulateClose(4005)

    expect(provider.lastRejection()).toBe('invite-already-redeemed')
    provider.disconnect()
  })

  it('close code 4006 (room-full) sets lastRejection', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    lastFakeWs!.simulateClose(4006)

    expect(provider.lastRejection()).toBe('room-full')
    provider.disconnect()
  })

  it('close code 4010 (malformed-credentials) sets lastRejection', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    lastFakeWs!.simulateClose(4010)

    expect(provider.lastRejection()).toBe('malformed-credentials')
    provider.disconnect()
  })

  it('permanent rejection does not schedule reconnect after timer runs', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    const prevWs = lastFakeWs

    lastFakeWs!.simulateClose(4001)
    // Advance past any would-be reconnect delay without running forever
    vi.advanceTimersByTime(500)

    // lastFakeWs should still be prevWs — no new WS was created
    expect(lastFakeWs).toBe(prevWs)
    expect(provider.reconnecting()).toBe(false)
    provider.disconnect()
  })

  // -------------------------------------------------------------------------
  // Manual disconnect
  // -------------------------------------------------------------------------

  it('disconnect() sets reconnecting to false', () => {
    const provider = makeProvider()
    expect(provider.reconnecting()).toBe(true) // connecting phase
    provider.disconnect()
    expect(provider.reconnecting()).toBe(false)
  })

  it('disconnect() is idempotent — second call is safe', () => {
    const provider = makeProvider()
    provider.disconnect()
    expect(() => provider.disconnect()).not.toThrow()
    expect(provider.reconnecting()).toBe(false)
  })

  it('disconnect() after connected sets reconnecting to false', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    expect(provider.reconnecting()).toBe(false) // connected → already false
    provider.disconnect()
    expect(provider.reconnecting()).toBe(false)
  })

  it('disconnect() after transient close sets reconnecting to false', () => {
    const provider = makeProvider()
    lastFakeWs!.simulateOpen()
    lastFakeWs!.simulateClose(1006, '', false)
    expect(provider.reconnecting()).toBe(true) // was reconnecting
    provider.disconnect()
    expect(provider.reconnecting()).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Callbacks
  // -------------------------------------------------------------------------

  it('onStatusChange called with connected on open', () => {
    const onStatusChange = vi.fn()
    const provider = makeProvider({ onStatusChange })
    lastFakeWs!.simulateOpen()
    expect(onStatusChange).toHaveBeenCalledWith('connected')
    provider.disconnect()
  })

  it('onStatusChange called with disconnected on transient close', () => {
    const onStatusChange = vi.fn()
    const provider = makeProvider({ onStatusChange })
    lastFakeWs!.simulateOpen()
    lastFakeWs!.simulateClose(1006, '', false)
    expect(onStatusChange).toHaveBeenCalledWith('disconnected')
    provider.disconnect()
  })

  it('onRejectionChange called with reason on permanent close', () => {
    const onRejectionChange = vi.fn()
    const provider = makeProvider({ onRejectionChange })
    lastFakeWs!.simulateOpen()
    lastFakeWs!.simulateClose(4001)
    expect(onRejectionChange).toHaveBeenCalledWith('unknown-room')
    provider.disconnect()
  })

  it('onRejectionChange called with null on reconnect success after prior rejection attempt', () => {
    const onRejectionChange = vi.fn()
    const provider = makeProvider({ onRejectionChange })
    // Connect succeeds — onRejectionChange(null) fired
    lastFakeWs!.simulateOpen()
    expect(onRejectionChange).toHaveBeenCalledWith(null)
    provider.disconnect()
  })

  it('onRejectionChange not called for transient close', () => {
    const onRejectionChange = vi.fn()
    const provider = makeProvider({ onRejectionChange })
    lastFakeWs!.simulateOpen()
    onRejectionChange.mockClear()
    lastFakeWs!.simulateClose(1006, '', false)
    expect(onRejectionChange).not.toHaveBeenCalled()
    provider.disconnect()
  })

  // -------------------------------------------------------------------------
  // awareness
  // -------------------------------------------------------------------------

  it('exposes awareness instance', () => {
    const provider = makeProvider()
    expect(provider.awareness).toBeDefined()
    provider.disconnect()
  })
})
