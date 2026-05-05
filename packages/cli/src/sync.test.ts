/**
 * Unit tests for cli/src/sync.ts (ADR-0016).
 *
 * Tests:
 * - URL transformation: http → ws, https → wss, /ws suffix appended
 * - Param building: `did` always present; `pw` only when passwordHash given
 * - Awareness passthrough: custom Awareness forwarded to provider options
 * - Status callbacks: onStatusChange fires on provider 'status' events
 * - Rejection handling: onRejection fires for known close codes 4001-4006;
 *   unknown codes (e.g. 1000) are silently ignored
 * - disconnect(): stops reconnect, removes listeners, idempotent
 * - updateCredentials(): same hash → no-op; new hash → reconnect with pw;
 *   null hash → reconnect without pw
 *
 * Uses a controllable fake WebsocketProvider injected via vi.mock.
 */

import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JoinRejectionReason } from '@hnch/shared'

// ---------------------------------------------------------------------------
// Fake WebsocketProvider
// ---------------------------------------------------------------------------

class FakeProvider {
  shouldConnect = true
  params: Record<string, string>
  awareness: object

  private _listeners = new Map<string, Array<(arg: unknown) => void>>()

  constructor(
    public readonly serverUrl: string,
    public readonly roomUuid: string,
    public readonly doc: Y.Doc,
    opts: { params?: Record<string, string>; awareness?: object },
  ) {
    this.params = opts.params ?? {}
    this.awareness = opts.awareness ?? {}
  }

  readonly on = vi.fn((event: string, fn: (arg: unknown) => void) => {
    if (!this._listeners.has(event)) this._listeners.set(event, [])
    this._listeners.get(event)!.push(fn)
  })

  readonly off = vi.fn((event: string, fn: (arg: unknown) => void) => {
    const fns = this._listeners.get(event)
    if (!fns) return
    const idx = fns.indexOf(fn)
    if (idx >= 0) fns.splice(idx, 1)
  })

  readonly connect = vi.fn()
  readonly disconnect = vi.fn()
  readonly destroy = vi.fn()

  emit(event: string, arg: unknown): void {
    for (const fn of this._listeners.get(event) ?? []) fn(arg)
  }
}

let lastFakeProvider: FakeProvider | null = null

vi.mock('y-websocket', () => ({
  WebsocketProvider: vi.fn().mockImplementation(
    (serverUrl: string, roomUuid: string, doc: Y.Doc, opts: Record<string, unknown>) => {
      lastFakeProvider = new FakeProvider(serverUrl, roomUuid, doc, opts as {
        params?: Record<string, string>
        awareness?: object
      })
      return lastFakeProvider
    },
  ),
}))

vi.mock('ws', () => ({ default: class FakeWS {} }))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { connect } from './sync.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ConnectDefaults {
  wsBaseUrl?: string
  roomUuid?: string
  deviceId?: string
  passwordHash?: string
  onStatusChange?: (s: string) => void
  onRejection?: (r: JoinRejectionReason) => void
}

function makeConnection(overrides: ConnectDefaults = {}) {
  return connect({
    wsBaseUrl: overrides.wsBaseUrl ?? 'http://localhost:1234',
    roomUuid: overrides.roomUuid ?? 'room-uuid-1',
    doc: new Y.Doc(),
    deviceId: overrides.deviceId ?? 'device-001',
    passwordHash: overrides.passwordHash,
    onStatusChange: overrides.onStatusChange,
    onRejection: overrides.onRejection,
  })
}

// ---------------------------------------------------------------------------
// Tests — URL construction
// ---------------------------------------------------------------------------

describe('connect — URL construction', () => {
  beforeEach(() => { lastFakeProvider = null })

  it('converts http:// prefix to ws://', () => {
    makeConnection({ wsBaseUrl: 'http://localhost:1234' })
    expect(lastFakeProvider!.serverUrl).toBe('ws://localhost:1234/ws')
  })

  it('converts https:// prefix to wss://', () => {
    makeConnection({ wsBaseUrl: 'https://relay.example.com' })
    expect(lastFakeProvider!.serverUrl).toBe('wss://relay.example.com/ws')
  })

  it('passes roomUuid as the provider room argument', () => {
    makeConnection({ roomUuid: 'test-room-uuid' })
    expect(lastFakeProvider!.roomUuid).toBe('test-room-uuid')
  })
})

// ---------------------------------------------------------------------------
// Tests — param building
// ---------------------------------------------------------------------------

describe('connect — param building', () => {
  beforeEach(() => { lastFakeProvider = null })

  it('always includes did param', () => {
    makeConnection({ deviceId: 'dev-abc' })
    expect(lastFakeProvider!.params['did']).toBe('dev-abc')
  })

  it('omits pw when passwordHash is undefined', () => {
    makeConnection({ deviceId: 'dev-abc' })
    expect(lastFakeProvider!.params).not.toHaveProperty('pw')
  })

  it('includes pw when passwordHash is provided', () => {
    makeConnection({ deviceId: 'dev-abc', passwordHash: 'hash-xyz' })
    expect(lastFakeProvider!.params['pw']).toBe('hash-xyz')
  })
})

// ---------------------------------------------------------------------------
// Tests — returned doc
// ---------------------------------------------------------------------------

describe('connect — returned connection properties', () => {
  it('returned doc is the same reference as input doc', () => {
    const doc = new Y.Doc()
    const conn = connect({
      wsBaseUrl: 'http://localhost:1234',
      roomUuid: 'uuid',
      doc,
      deviceId: 'dev',
    })
    expect(conn.doc).toBe(doc)
  })

  it('returned awareness is the fake provider awareness', () => {
    const fakeAwareness = { clientID: 42, states: new Map() }
    const doc = new Y.Doc()
    connect({
      wsBaseUrl: 'http://localhost:1234',
      roomUuid: 'uuid',
      doc,
      deviceId: 'dev',
      awareness: fakeAwareness as never,
    })
    // The fake provider stores awareness from opts
    expect(lastFakeProvider!.awareness).toBe(fakeAwareness)
  })
})

// ---------------------------------------------------------------------------
// Tests — status callbacks
// ---------------------------------------------------------------------------

describe('connect — onStatusChange', () => {
  beforeEach(() => { lastFakeProvider = null })

  it('fires onStatusChange when provider emits status=connected', () => {
    const onStatusChange = vi.fn()
    makeConnection({ onStatusChange })
    lastFakeProvider!.emit('status', { status: 'connected' })
    expect(onStatusChange).toHaveBeenCalledWith('connected')
  })

  it('fires onStatusChange when provider emits status=disconnected', () => {
    const onStatusChange = vi.fn()
    makeConnection({ onStatusChange })
    lastFakeProvider!.emit('status', { status: 'disconnected' })
    expect(onStatusChange).toHaveBeenCalledWith('disconnected')
  })

  it('does not throw when onStatusChange is not provided', () => {
    makeConnection()
    expect(() => lastFakeProvider!.emit('status', { status: 'connected' })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Tests — rejection handling
// ---------------------------------------------------------------------------

describe('connect — onRejection', () => {
  beforeEach(() => { lastFakeProvider = null })

  it('fires onRejection for code 4001 (unknown-room)', () => {
    const onRejection = vi.fn()
    makeConnection({ onRejection })
    lastFakeProvider!.emit('connection-close', { code: 4001 })
    expect(onRejection).toHaveBeenCalledWith('unknown-room')
  })

  it('fires onRejection for code 4002 (wrong-password)', () => {
    const onRejection = vi.fn()
    makeConnection({ onRejection })
    lastFakeProvider!.emit('connection-close', { code: 4002 })
    expect(onRejection).toHaveBeenCalledWith('wrong-password')
  })

  it('fires onRejection for code 4006 (room-full)', () => {
    const onRejection = vi.fn()
    makeConnection({ onRejection })
    lastFakeProvider!.emit('connection-close', { code: 4006 })
    expect(onRejection).toHaveBeenCalledWith('room-full')
  })

  it('ignores unknown close code 1000 (normal closure)', () => {
    const onRejection = vi.fn()
    makeConnection({ onRejection })
    lastFakeProvider!.emit('connection-close', { code: 1000 })
    expect(onRejection).not.toHaveBeenCalled()
  })

  it('ignores null connection-close event', () => {
    const onRejection = vi.fn()
    makeConnection({ onRejection })
    expect(() => lastFakeProvider!.emit('connection-close', null)).not.toThrow()
    expect(onRejection).not.toHaveBeenCalled()
  })

  it('sets provider.shouldConnect=false and calls disconnect on rejection', () => {
    makeConnection()
    lastFakeProvider!.emit('connection-close', { code: 4001 })
    expect(lastFakeProvider!.shouldConnect).toBe(false)
    expect(lastFakeProvider!.disconnect).toHaveBeenCalled()
  })

  it('does not throw when onRejection is not provided', () => {
    makeConnection()
    expect(() => lastFakeProvider!.emit('connection-close', { code: 4001 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Tests — disconnect()
// ---------------------------------------------------------------------------

describe('connect — disconnect()', () => {
  beforeEach(() => { lastFakeProvider = null })

  it('calls provider.disconnect and provider.destroy', () => {
    const conn = makeConnection()
    conn.disconnect()
    expect(lastFakeProvider!.disconnect).toHaveBeenCalled()
    expect(lastFakeProvider!.destroy).toHaveBeenCalled()
  })

  it('sets provider.shouldConnect to false', () => {
    const conn = makeConnection()
    conn.disconnect()
    expect(lastFakeProvider!.shouldConnect).toBe(false)
  })

  it('removes status and connection-close listeners via provider.off', () => {
    const conn = makeConnection()
    conn.disconnect()
    expect(lastFakeProvider!.off).toHaveBeenCalledWith('status', expect.any(Function))
    expect(lastFakeProvider!.off).toHaveBeenCalledWith('connection-close', expect.any(Function))
  })

  it('is idempotent — second disconnect is a no-op', () => {
    const conn = makeConnection()
    conn.disconnect()
    const callCount = lastFakeProvider!.disconnect.mock.calls.length
    conn.disconnect()
    expect(lastFakeProvider!.disconnect.mock.calls.length).toBe(callCount)
  })
})

// ---------------------------------------------------------------------------
// Tests — updateCredentials()
// ---------------------------------------------------------------------------

describe('connect — updateCredentials()', () => {
  beforeEach(() => { lastFakeProvider = null })

  it('is a no-op when the password hash is unchanged', () => {
    const conn = makeConnection({ passwordHash: 'hash-abc' })
    const disconnectBefore = lastFakeProvider!.disconnect.mock.calls.length
    conn.updateCredentials({ passwordHash: 'hash-abc' })
    expect(lastFakeProvider!.disconnect.mock.calls.length).toBe(disconnectBefore)
    expect(lastFakeProvider!.connect).not.toHaveBeenCalled()
  })

  it('reconnects with new pw param when password changes', () => {
    const conn = makeConnection({ deviceId: 'dev-001', passwordHash: 'old-hash' })
    conn.updateCredentials({ passwordHash: 'new-hash' })
    expect(lastFakeProvider!.disconnect).toHaveBeenCalled()
    expect(lastFakeProvider!.params['pw']).toBe('new-hash')
    expect(lastFakeProvider!.connect).toHaveBeenCalled()
  })

  it('removes pw param when password is set to null', () => {
    const conn = makeConnection({ deviceId: 'dev-001', passwordHash: 'old-hash' })
    conn.updateCredentials({ passwordHash: null })
    expect(lastFakeProvider!.params).not.toHaveProperty('pw')
    expect(lastFakeProvider!.connect).toHaveBeenCalled()
  })

  it('adds pw param when password goes from undefined to set', () => {
    const conn = makeConnection({ deviceId: 'dev-001' })
    conn.updateCredentials({ passwordHash: 'new-hash' })
    expect(lastFakeProvider!.params['pw']).toBe('new-hash')
    expect(lastFakeProvider!.connect).toHaveBeenCalled()
  })

  it('preserves did param after credential update', () => {
    const conn = makeConnection({ deviceId: 'dev-001', passwordHash: 'old' })
    // Simulate the provider having a did param (set at construction)
    lastFakeProvider!.params['did'] = 'dev-001'
    conn.updateCredentials({ passwordHash: 'new' })
    expect(lastFakeProvider!.params['did']).toBe('dev-001')
  })
})
