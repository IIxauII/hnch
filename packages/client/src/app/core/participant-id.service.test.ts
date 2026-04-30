/**
 * Unit tests for ParticipantIdService — ADR-0005.
 *
 * Covers:
 *  - Legacy key migration path (Phase-2 stub id kept without overwrite)
 *  - Fresh install path via Device.getId()
 *  - Signal caching (subsequent calls return cached value without hitting
 *    Preferences or Device again)
 *  - Concurrent call deduplication (single in-flight promise)
 *  - ensureLoaded alias delegates to getOrCreateId
 *
 * Mocks Capacitor Preferences and the Capacitor Device plugin.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Capacitor Preferences
// ---------------------------------------------------------------------------

const mockPreferences = {
  get: vi.fn<(opts: { key: string }) => Promise<{ value: string | null }>>(),
  set: vi.fn<(opts: { key: string; value: string }) => Promise<void>>(),
}

vi.mock('@capacitor/preferences', () => ({
  Preferences: mockPreferences,
}))

// ---------------------------------------------------------------------------
// Mock Capacitor Device
// ---------------------------------------------------------------------------

const mockDevice = {
  getId: vi.fn<() => Promise<{ identifier: string }>>(),
}

vi.mock('@capacitor/device', () => ({
  Device: mockDevice,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createService() {
  const { ParticipantIdService } = await import('./participant-id.service')
  return new ParticipantIdService()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ParticipantIdService', () => {
  beforeEach(() => {
    mockPreferences.get.mockReset()
    mockPreferences.set.mockReset()
    mockDevice.getId.mockReset()
    mockPreferences.set.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('id signal is null before any resolution', async () => {
    const svc = await createService()
    expect(svc.id()).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Legacy key migration path
  // -------------------------------------------------------------------------

  describe('legacy Phase-2 key path', () => {
    it('returns the legacy id from Preferences without calling Device.getId', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'legacy-uuid-1234' })
      const svc = await createService()

      const id = await svc.getOrCreateId()

      expect(id).toBe('legacy-uuid-1234')
      expect(mockDevice.getId).not.toHaveBeenCalled()
    })

    it('does NOT overwrite the legacy id in Preferences', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'legacy-uuid-1234' })
      const svc = await createService()

      await svc.getOrCreateId()

      expect(mockPreferences.set).not.toHaveBeenCalled()
    })

    it('caches legacy id into the signal', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'legacy-uuid-1234' })
      const svc = await createService()

      await svc.getOrCreateId()

      expect(svc.id()).toBe('legacy-uuid-1234')
    })
  })

  // -------------------------------------------------------------------------
  // Fresh install path
  // -------------------------------------------------------------------------

  describe('fresh install path (Device.getId)', () => {
    it('falls back to Device.getId when no legacy key exists', async () => {
      mockPreferences.get.mockResolvedValue({ value: null })
      mockDevice.getId.mockResolvedValue({ identifier: 'device-uuid-5678' })
      const svc = await createService()

      const id = await svc.getOrCreateId()

      expect(id).toBe('device-uuid-5678')
      expect(mockDevice.getId).toHaveBeenCalledOnce()
    })

    it('persists the Device id under the legacy key for future cold starts', async () => {
      mockPreferences.get.mockResolvedValue({ value: null })
      mockDevice.getId.mockResolvedValue({ identifier: 'device-uuid-5678' })
      const svc = await createService()

      await svc.getOrCreateId()

      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.participantId',
        value: 'device-uuid-5678',
      })
    })

    it('caches device id into the signal', async () => {
      mockPreferences.get.mockResolvedValue({ value: null })
      mockDevice.getId.mockResolvedValue({ identifier: 'device-uuid-5678' })
      const svc = await createService()

      await svc.getOrCreateId()

      expect(svc.id()).toBe('device-uuid-5678')
    })
  })

  // -------------------------------------------------------------------------
  // Signal caching (second call is synchronous from signal)
  // -------------------------------------------------------------------------

  describe('signal caching', () => {
    it('subsequent getOrCreateId calls return cached signal value without re-reading Preferences', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'legacy-uuid-1234' })
      const svc = await createService()

      // First call resolves via Preferences
      await svc.getOrCreateId()
      expect(mockPreferences.get).toHaveBeenCalledTimes(1)

      // Second call reads from the signal (no further Preferences access)
      const second = await svc.getOrCreateId()
      expect(second).toBe('legacy-uuid-1234')
      expect(mockPreferences.get).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // Concurrent call deduplication
  // -------------------------------------------------------------------------

  describe('concurrent call deduplication', () => {
    it('two concurrent calls share one in-flight Preferences read', async () => {
      let resolve!: (v: { value: string }) => void
      mockPreferences.get.mockReturnValue(
        new Promise<{ value: string }>((r) => {
          resolve = r
        }),
      )
      const svc = await createService()

      const p1 = svc.getOrCreateId()
      const p2 = svc.getOrCreateId()

      resolve({ value: 'shared-id' })
      const [id1, id2] = await Promise.all([p1, p2])

      expect(id1).toBe('shared-id')
      expect(id2).toBe('shared-id')
      // Preferences was only opened once
      expect(mockPreferences.get).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // ensureLoaded alias
  // -------------------------------------------------------------------------

  describe('ensureLoaded', () => {
    it('resolves the same id as getOrCreateId', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'alias-test-id' })
      const svc = await createService()

      const id = await svc.ensureLoaded()

      expect(id).toBe('alias-test-id')
    })
  })
})
