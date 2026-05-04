/**
 * Unit tests for sync.ts — the Yjs WebSocket sync provider wrapper for
 * the CLI (ADR-0016, ADR-0021).
 *
 * Behaviors under test:
 * - URL construction: http → ws, path is /ws/<roomUuid>
 * - Params always include `did`; `pw` is only included when passwordHash given
 * - onStatusChange is called on 'status' events
 * - onRejection is called with the correct reason when a rejection close code fires
 * - Unknown close codes do NOT trigger onRejection (only relay codes 4001-4099 do)
 * - disconnect() is idempotent — calling it twice is safe
 * - updateCredentials() reconnects with updated pw param
 * - disconnect() removes event listeners
 *
 * y-websocket and ws are mocked so no real WebSocket server is required.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import * as Y from 'yjs'
import { JOIN_REJECTION_CLOSE_CODES } from '@hnch/shared'

// ---------------------------------------------------------------------------
// Mock y-websocket
// ---------------------------------------------------------------------------

/** Captured event listeners registered on the mock provider. */
const mockListeners: Record<string, ((...args: unknown[]) => void)[]> = {}

const mockProvider = {
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (!mockListeners[event]) mockListeners[event] = []
    mockListeners[event].push(handler)
  }),
  off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (mockListeners[event]) {
      mockListeners[event] = mockListeners[event].filter((h) => h !== handler)
    }
  }),
  disconnect: vi.fn(),
  connect: vi.fn(),
  destroy: vi.fn(),
  awareness: { _awareness: 'fake' },
  shouldConnect: true,
  params: {} as Record<string, string>,
}

const MockWebsocketProvider = vi.fn().mockImplementation(() => mockProvider)

vi.mock('y-websocket', () => ({
  WebsocketProvider: MockWebsocketProvider,
}))

// ---------------------------------------------------------------------------
// Mock ws (Node WebSocket)
// ---------------------------------------------------------------------------

vi.mock('ws', () => ({
  default: class MockWS {},
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emit(event: string, ...args: unknown[]): void {
  for (const handler of mockListeners[event] ?? []) {
    handler(...args)
  }
}

const BASE_URL = 'http://localhost:1234'
const ROOM_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const DEVICE_ID = 'device-test-001'

async function makeConnect(overrides: {
  passwordHash?: string
  onStatusChange?: Mock
  onRejection?: Mock
} = {}) {
  // Reset between calls
  MockWebsocketProvider.mockClear()
  mockProvider.on.mockClear()
  mockProvider.off.mockClear()
  mockProvider.disconnect.mockClear()
  mockProvider.connect.mockClear()
  mockProvider.destroy.mockClear()
  mockProvider.shouldConnect = true
  mockProvider.params = {}
  for (const key of Object.keys(mockListeners)) delete mockListeners[key]

  const { connect } = await import('./sync.js')
  const doc = new Y.Doc()
  return connect({
    wsBaseUrl: BASE_URL,
    roomUuid: ROOM_UUID,
    doc,
    deviceId: DEVICE_ID,
    passwordHash: overrides.passwordHash,
    onStatusChange: overrides.onStatusChange,
    onRejection: overrides.onRejection,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sync.connect', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('WebsocketProvider construction', () => {
    it('converts http base URL to ws and appends /ws', async () => {
      await makeConnect()
      expect(MockWebsocketProvider).toHaveBeenCalledOnce()
      const [serverUrl] = MockWebsocketProvider.mock.calls[0] as [string, ...unknown[]]
      expect(serverUrl).toBe('ws://localhost:1234/ws')
    })

    it('converts https base URL to wss', async () => {
      MockWebsocketProvider.mockClear()
      for (const key of Object.keys(mockListeners)) delete mockListeners[key]
      const { connect } = await import('./sync.js')
      connect({
        wsBaseUrl: 'https://hnch.dev',
        roomUuid: ROOM_UUID,
        doc: new Y.Doc(),
        deviceId: DEVICE_ID,
      })
      const [serverUrl] = MockWebsocketProvider.mock.calls[0] as [string, ...unknown[]]
      expect(serverUrl).toBe('wss://hnch.dev/ws')
    })

    it('uses the roomUuid as the room identifier', async () => {
      await makeConnect()
      const [, roomId] = MockWebsocketProvider.mock.calls[0] as [string, string, ...unknown[]]
      expect(roomId).toBe(ROOM_UUID)
    })

    it('always includes did in params', async () => {
      await makeConnect()
      const [, , , opts] = MockWebsocketProvider.mock.calls[0] as [
        string,
        string,
        Y.Doc,
        { params: Record<string, string> },
      ]
      expect(opts.params['did']).toBe(DEVICE_ID)
    })

    it('includes pw in params when passwordHash is provided', async () => {
      await makeConnect({ passwordHash: 'abc123hash' })
      const [, , , opts] = MockWebsocketProvider.mock.calls[0] as [
        string,
        string,
        Y.Doc,
        { params: Record<string, string> },
      ]
      expect(opts.params['pw']).toBe('abc123hash')
    })

    it('omits pw from params when no passwordHash', async () => {
      await makeConnect()
      const [, , , opts] = MockWebsocketProvider.mock.calls[0] as [
        string,
        string,
        Y.Doc,
        { params: Record<string, string> },
      ]
      expect(opts.params['pw']).toBeUndefined()
    })
  })

  describe('onStatusChange callback', () => {
    it('fires when a "status" event is emitted by the provider', async () => {
      const onStatusChange = vi.fn()
      await makeConnect({ onStatusChange })
      emit('status', { status: 'connected' })
      expect(onStatusChange).toHaveBeenCalledWith('connected')
    })

    it('fires with "disconnected" status', async () => {
      const onStatusChange = vi.fn()
      await makeConnect({ onStatusChange })
      emit('status', { status: 'disconnected' })
      expect(onStatusChange).toHaveBeenCalledWith('disconnected')
    })
  })

  describe('onRejection callback (ADR-0016 close codes)', () => {
    it('fires with "wrong-password" for close code 4002', async () => {
      const onRejection = vi.fn()
      await makeConnect({ onRejection })
      emit('connection-close', { code: JOIN_REJECTION_CLOSE_CODES['wrong-password'] })
      expect(onRejection).toHaveBeenCalledWith('wrong-password')
    })

    it('fires with "unknown-room" for close code 4001', async () => {
      const onRejection = vi.fn()
      await makeConnect({ onRejection })
      emit('connection-close', { code: JOIN_REJECTION_CLOSE_CODES['unknown-room'] })
      expect(onRejection).toHaveBeenCalledWith('unknown-room')
    })

    it('fires with "room-full" for close code 4006', async () => {
      const onRejection = vi.fn()
      await makeConnect({ onRejection })
      emit('connection-close', { code: JOIN_REJECTION_CLOSE_CODES['room-full'] })
      expect(onRejection).toHaveBeenCalledWith('room-full')
    })

    it('does NOT fire for a normal close (code 1000)', async () => {
      const onRejection = vi.fn()
      await makeConnect({ onRejection })
      emit('connection-close', { code: 1000 })
      expect(onRejection).not.toHaveBeenCalled()
    })

    it('does NOT fire when connection-close event is null', async () => {
      const onRejection = vi.fn()
      await makeConnect({ onRejection })
      emit('connection-close', null)
      expect(onRejection).not.toHaveBeenCalled()
    })

    it('sets shouldConnect to false on rejection', async () => {
      const onRejection = vi.fn()
      await makeConnect({ onRejection })
      mockProvider.shouldConnect = true
      emit('connection-close', { code: JOIN_REJECTION_CLOSE_CODES['wrong-password'] })
      expect(mockProvider.shouldConnect).toBe(false)
    })
  })

  describe('disconnect()', () => {
    it('calls provider.disconnect() and provider.destroy()', async () => {
      const conn = await makeConnect()
      conn.disconnect()
      expect(mockProvider.disconnect).toHaveBeenCalled()
      expect(mockProvider.destroy).toHaveBeenCalled()
    })

    it('is idempotent — calling twice does not throw or double-destroy', async () => {
      const conn = await makeConnect()
      conn.disconnect()
      expect(() => conn.disconnect()).not.toThrow()
      // destroy should only be called once
      expect(mockProvider.destroy).toHaveBeenCalledTimes(1)
    })

    it('removes status and connection-close event listeners', async () => {
      const conn = await makeConnect()
      conn.disconnect()
      expect(mockProvider.off).toHaveBeenCalledWith('status', expect.any(Function))
      expect(mockProvider.off).toHaveBeenCalledWith('connection-close', expect.any(Function))
    })
  })

  describe('updateCredentials()', () => {
    it('disconnects and reconnects when the password changes', async () => {
      const conn = await makeConnect({ passwordHash: 'old-hash' })
      conn.updateCredentials({ passwordHash: 'new-hash' })
      expect(mockProvider.disconnect).toHaveBeenCalled()
      expect(mockProvider.connect).toHaveBeenCalled()
    })

    it('does nothing when the password hash has not changed', async () => {
      const conn = await makeConnect({ passwordHash: 'same-hash' })
      conn.updateCredentials({ passwordHash: 'same-hash' })
      expect(mockProvider.disconnect).not.toHaveBeenCalled()
      expect(mockProvider.connect).not.toHaveBeenCalled()
    })

    it('removes pw from params when password is set to null', async () => {
      const conn = await makeConnect({ passwordHash: 'secret' })
      conn.updateCredentials({ passwordHash: null })
      expect(mockProvider.params['pw']).toBeUndefined()
    })

    it('updates params.pw when password changes', async () => {
      const conn = await makeConnect({ passwordHash: 'old' })
      conn.updateCredentials({ passwordHash: 'new' })
      expect(mockProvider.params['pw']).toBe('new')
    })
  })

  describe('SyncConnection.doc', () => {
    it('exposes the doc that was passed in', async () => {
      const conn = await makeConnect()
      expect(conn.doc).toBeDefined()
    })
  })
})
