/**
 * Unit tests for LastSessionService.
 *
 * Tests save, load, clear, and expiry logic. Mocks Capacitor Preferences.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Capacitor Preferences
// ---------------------------------------------------------------------------

const mockPreferences = {
  get: vi.fn<
    (opts: { key: string }) => Promise<{ value: string | null }>
  >(),
  set: vi.fn<
    (opts: { key: string; value: string }) => Promise<void>
  >(),
  remove: vi.fn<(opts: { key: string }) => Promise<void>>(),
}

vi.mock('@capacitor/preferences', () => ({
  Preferences: mockPreferences,
}))

describe('LastSessionService', () => {
  let service: Awaited<ReturnType<typeof createService>>

  beforeEach(() => {
    mockPreferences.get.mockReset()
    mockPreferences.set.mockReset()
    mockPreferences.remove.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Fresh import each test to avoid stale Angular singleton state
  async function createService() {
    const mod = await import('./last-session.service')
    return new mod.LastSessionService()
  }

  // -------------------------------------------------------------------------
  // save / record tests
  // -------------------------------------------------------------------------

  describe('record', () => {
    it('writes cache entry with timestamp', async () => {
      service = await createService()
      mockPreferences.set.mockResolvedValue(undefined)

      await service.record({
        roomCode: 'ABC123',
        roomUuid: 'uuid-1234',
        lastScreen: 'lobby',
      })

      expect(mockPreferences.set).toHaveBeenCalledOnce()
      const call = mockPreferences.set.mock.calls[0]![0]
      expect(call.key).toBe('hnch.lastSession')

      const parsed = JSON.parse(call.value)
      expect(parsed).toEqual({
        roomCode: 'ABC123',
        roomUuid: 'uuid-1234',
        lastScreen: 'lobby',
        lastSeenAt: expect.any(Number),
      })
    })

    it('uses provided now() for timestamp', async () => {
      service = await createService()
      mockPreferences.set.mockResolvedValue(undefined)

      const fixedTime = 1_000_000
      await service.record(
        {
          roomCode: 'ABC123',
          roomUuid: 'uuid-1234',
          lastScreen: 'estimating',
        },
        { now: () => fixedTime },
      )

      const call = mockPreferences.set.mock.calls[0]![0]
      const parsed = JSON.parse(call.value)
      expect(parsed.lastSeenAt).toBe(fixedTime)
    })

    it('accepts both lastScreen values', async () => {
      service = await createService()
      mockPreferences.set.mockResolvedValue(undefined)

      await service.record({
        roomCode: 'ABC123',
        roomUuid: 'uuid-1234',
        lastScreen: 'estimating',
      })

      const call = mockPreferences.set.mock.calls[0]![0]
      const parsed = JSON.parse(call.value)
      expect(parsed.lastScreen).toBe('estimating')
    })
  })

  // -------------------------------------------------------------------------
  // load / get tests
  // -------------------------------------------------------------------------

  describe('get', () => {
    it('returns null when no cache entry exists', async () => {
      service = await createService()
      mockPreferences.get.mockResolvedValueOnce({ value: null })

      const result = await service.get()

      expect(result).toBeNull()
    })

    it('returns parsed cache entry when valid', async () => {
      service = await createService()
      const cacheEntry = {
        roomCode: 'ABC123',
        roomUuid: 'uuid-1234',
        lastScreen: 'lobby' as const,
        lastSeenAt: Date.now(),
      }
      mockPreferences.get.mockResolvedValueOnce({
        value: JSON.stringify(cacheEntry),
      })

      const result = await service.get()

      expect(result).toEqual(cacheEntry)
    })

    it('clears and returns null on malformed JSON', async () => {
      service = await createService()
      mockPreferences.get.mockResolvedValueOnce({
        value: 'not-valid-json{',
      })
      mockPreferences.remove.mockResolvedValueOnce(undefined)

      const result = await service.get()

      expect(result).toBeNull()
      expect(mockPreferences.remove).toHaveBeenCalledWith({
        key: 'hnch.lastSession',
      })
    })

    it('clears and returns null on invalid shape (missing roomCode)', async () => {
      service = await createService()
      mockPreferences.get.mockResolvedValueOnce({
        value: JSON.stringify({
          roomUuid: 'uuid-1234',
          lastScreen: 'lobby',
          lastSeenAt: Date.now(),
        }),
      })
      mockPreferences.remove.mockResolvedValueOnce(undefined)

      const result = await service.get()

      expect(result).toBeNull()
      expect(mockPreferences.remove).toHaveBeenCalledOnce()
    })

    it('clears and returns null on invalid shape (missing roomUuid)', async () => {
      service = await createService()
      mockPreferences.get.mockResolvedValueOnce({
        value: JSON.stringify({
          roomCode: 'ABC123',
          lastScreen: 'lobby',
          lastSeenAt: Date.now(),
        }),
      })
      mockPreferences.remove.mockResolvedValueOnce(undefined)

      const result = await service.get()

      expect(result).toBeNull()
      expect(mockPreferences.remove).toHaveBeenCalledOnce()
    })

    it('clears and returns null on invalid shape (missing lastSeenAt)', async () => {
      service = await createService()
      mockPreferences.get.mockResolvedValueOnce({
        value: JSON.stringify({
          roomCode: 'ABC123',
          roomUuid: 'uuid-1234',
          lastScreen: 'lobby',
        }),
      })
      mockPreferences.remove.mockResolvedValueOnce(undefined)

      const result = await service.get()

      expect(result).toBeNull()
      expect(mockPreferences.remove).toHaveBeenCalledOnce()
    })

    it('clears and returns null on invalid shape (missing lastScreen)', async () => {
      service = await createService()
      mockPreferences.get.mockResolvedValueOnce({
        value: JSON.stringify({
          roomCode: 'ABC123',
          roomUuid: 'uuid-1234',
          lastSeenAt: Date.now(),
        }),
      })
      mockPreferences.remove.mockResolvedValueOnce(undefined)

      const result = await service.get()

      expect(result).toBeNull()
      expect(mockPreferences.remove).toHaveBeenCalledOnce()
    })

    it('clears and returns null on invalid lastScreen (not "lobby" or "estimating")', async () => {
      service = await createService()
      mockPreferences.get.mockResolvedValueOnce({
        value: JSON.stringify({
          roomCode: 'ABC123',
          roomUuid: 'uuid-1234',
          lastScreen: 'invalid-screen',
          lastSeenAt: Date.now(),
        }),
      })
      mockPreferences.remove.mockResolvedValueOnce(undefined)

      const result = await service.get()

      expect(result).toBeNull()
      expect(mockPreferences.remove).toHaveBeenCalledOnce()
    })

    it('clears and returns null on invalid type (lastSeenAt not number)', async () => {
      service = await createService()
      mockPreferences.get.mockResolvedValueOnce({
        value: JSON.stringify({
          roomCode: 'ABC123',
          roomUuid: 'uuid-1234',
          lastScreen: 'lobby',
          lastSeenAt: 'not-a-number',
        }),
      })
      mockPreferences.remove.mockResolvedValueOnce(undefined)

      const result = await service.get()

      expect(result).toBeNull()
      expect(mockPreferences.remove).toHaveBeenCalledOnce()
    })

    it('clears and returns null on invalid type (null object)', async () => {
      service = await createService()
      mockPreferences.get.mockResolvedValueOnce({
        value: 'null',
      })
      mockPreferences.remove.mockResolvedValueOnce(undefined)

      const result = await service.get()

      expect(result).toBeNull()
      expect(mockPreferences.remove).toHaveBeenCalledOnce()
    })
  })

  // -------------------------------------------------------------------------
  // TTL / expiry tests
  // -------------------------------------------------------------------------

  describe('get - TTL expiry', () => {
    it('returns null and clears when cache is past TTL', async () => {
      service = await createService()
      const now = 2_000_000
      const ttlMs = 24 * 60 * 60 * 1000
      const cacheEntry = {
        roomCode: 'ABC123',
        roomUuid: 'uuid-1234',
        lastScreen: 'lobby' as const,
        lastSeenAt: now - ttlMs - 1000, // 1s past TTL
      }
      mockPreferences.get.mockResolvedValueOnce({
        value: JSON.stringify(cacheEntry),
      })
      mockPreferences.remove.mockResolvedValueOnce(undefined)

      const result = await service.get({ now: () => now })

      expect(result).toBeNull()
      expect(mockPreferences.remove).toHaveBeenCalledOnce()
    })

    it('returns entry when at TTL boundary (exactly 24h)', async () => {
      service = await createService()
      const now = 2_000_000
      const ttlMs = 24 * 60 * 60 * 1000
      const cacheEntry = {
        roomCode: 'ABC123',
        roomUuid: 'uuid-1234',
        lastScreen: 'lobby' as const,
        lastSeenAt: now - ttlMs, // Exactly at TTL
      }
      mockPreferences.get.mockResolvedValueOnce({
        value: JSON.stringify(cacheEntry),
      })

      const result = await service.get({ now: () => now })

      expect(result).toEqual(cacheEntry)
      expect(mockPreferences.remove).not.toHaveBeenCalled()
    })

    it('returns entry when well within TTL (1 hour ago)', async () => {
      service = await createService()
      const now = 2_000_000
      const cacheEntry = {
        roomCode: 'ABC123',
        roomUuid: 'uuid-1234',
        lastScreen: 'estimating' as const,
        lastSeenAt: now - 60 * 60 * 1000, // 1 hour ago
      }
      mockPreferences.get.mockResolvedValueOnce({
        value: JSON.stringify(cacheEntry),
      })

      const result = await service.get({ now: () => now })

      expect(result).toEqual(cacheEntry)
      expect(mockPreferences.remove).not.toHaveBeenCalled()
    })

    it('uses Date.now() when opts.now not provided', async () => {
      service = await createService()
      const now = Date.now()
      const cacheEntry = {
        roomCode: 'ABC123',
        roomUuid: 'uuid-1234',
        lastScreen: 'lobby' as const,
        lastSeenAt: now - 1000, // 1s ago
      }
      mockPreferences.get.mockResolvedValueOnce({
        value: JSON.stringify(cacheEntry),
      })

      const result = await service.get() // No opts.now

      expect(result).toEqual(cacheEntry)
      expect(mockPreferences.remove).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // clear tests
  // -------------------------------------------------------------------------

  describe('clear', () => {
    it('removes the cache entry', async () => {
      service = await createService()
      mockPreferences.remove.mockResolvedValueOnce(undefined)

      await service.clear()

      expect(mockPreferences.remove).toHaveBeenCalledOnce()
      expect(mockPreferences.remove).toHaveBeenCalledWith({
        key: 'hnch.lastSession',
      })
    })

    it('can be called multiple times', async () => {
      service = await createService()
      mockPreferences.remove.mockResolvedValue(undefined)

      await service.clear()
      await service.clear()

      expect(mockPreferences.remove).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------------------------------------------------------------
  // integration-ish: record -> get flow
  // -------------------------------------------------------------------------

  describe('record + get flow', () => {
    it('get returns what record wrote', async () => {
      service = await createService()
      mockPreferences.set.mockResolvedValue(undefined)
      mockPreferences.get.mockResolvedValue({ value: null })

      // Capture what was written
      const payload = {
        roomCode: 'ABC123',
        roomUuid: 'uuid-1234',
        lastScreen: 'lobby' as const,
      }
      await service.record(payload)

      // Extract the written value
      const setCall = mockPreferences.set.mock.calls[0]![0]
      const writtenEntry = JSON.parse(setCall.value)

      // Simulate reading it back
      mockPreferences.get.mockResolvedValueOnce({
        value: setCall.value,
      })

      const result = await service.get()
      expect(result).toEqual(writtenEntry)
    })
  })
})
