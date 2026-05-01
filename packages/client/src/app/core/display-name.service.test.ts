/**
 * Unit tests for DisplayNameService.
 *
 * Covers getDisplayName, setDisplayName, getPendingJoinUrl,
 * setPendingJoinUrl, and clearPendingJoinUrl. Mocks Capacitor Preferences.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Capacitor Preferences
// ---------------------------------------------------------------------------

const mockPreferences = {
  get: vi.fn<(opts: { key: string }) => Promise<{ value: string | null }>>(),
  set: vi.fn<(opts: { key: string; value: string }) => Promise<void>>(),
  remove: vi.fn<(opts: { key: string }) => Promise<void>>(),
}

vi.mock('@capacitor/preferences', () => ({
  Preferences: mockPreferences,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createService() {
  const mod = await import('./display-name.service')
  return new mod.DisplayNameService()
}

describe('DisplayNameService', () => {
  beforeEach(() => {
    mockPreferences.get.mockReset()
    mockPreferences.set.mockReset()
    mockPreferences.remove.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // getDisplayName
  // -------------------------------------------------------------------------

  describe('getDisplayName', () => {
    it('returns the stored display name', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'Alice' })
      const svc = await createService()
      const result = await svc.getDisplayName()
      expect(result).toBe('Alice')
      expect(mockPreferences.get).toHaveBeenCalledWith({ key: 'hnch.displayName' })
    })

    it('returns null when no display name is stored', async () => {
      mockPreferences.get.mockResolvedValue({ value: null })
      const svc = await createService()
      const result = await svc.getDisplayName()
      expect(result).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // setDisplayName
  // -------------------------------------------------------------------------

  describe('setDisplayName', () => {
    it('persists the display name to Preferences', async () => {
      mockPreferences.set.mockResolvedValue(undefined)
      const svc = await createService()
      await svc.setDisplayName('Bob')
      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.displayName',
        value: 'Bob',
      })
    })

    it('round-trips: get returns what set stored', async () => {
      let stored: string | null = null
      mockPreferences.set.mockImplementation(async ({ value }) => { stored = value })
      mockPreferences.get.mockImplementation(async () => ({ value: stored }))

      const svc = await createService()
      await svc.setDisplayName('Carol')
      const result = await svc.getDisplayName()
      expect(result).toBe('Carol')
    })
  })

  // -------------------------------------------------------------------------
  // getPendingJoinUrl
  // -------------------------------------------------------------------------

  describe('getPendingJoinUrl', () => {
    it('returns the stored pending join URL', async () => {
      mockPreferences.get.mockResolvedValue({ value: '/join?code=ABC123' })
      const svc = await createService()
      const result = await svc.getPendingJoinUrl()
      expect(result).toBe('/join?code=ABC123')
      expect(mockPreferences.get).toHaveBeenCalledWith({
        key: 'hnch.pendingJoinUrl',
      })
    })

    it('returns null when no pending URL is stored', async () => {
      mockPreferences.get.mockResolvedValue({ value: null })
      const svc = await createService()
      const result = await svc.getPendingJoinUrl()
      expect(result).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // setPendingJoinUrl
  // -------------------------------------------------------------------------

  describe('setPendingJoinUrl', () => {
    it('persists the URL to Preferences', async () => {
      mockPreferences.set.mockResolvedValue(undefined)
      const svc = await createService()
      await svc.setPendingJoinUrl('/join?code=XYZ999')
      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.pendingJoinUrl',
        value: '/join?code=XYZ999',
      })
    })
  })

  // -------------------------------------------------------------------------
  // clearPendingJoinUrl
  // -------------------------------------------------------------------------

  describe('clearPendingJoinUrl', () => {
    it('removes the pending URL from Preferences', async () => {
      mockPreferences.remove.mockResolvedValue(undefined)
      const svc = await createService()
      await svc.clearPendingJoinUrl()
      expect(mockPreferences.remove).toHaveBeenCalledWith({
        key: 'hnch.pendingJoinUrl',
      })
    })

    it('is idempotent — can be called multiple times without error', async () => {
      mockPreferences.remove.mockResolvedValue(undefined)
      const svc = await createService()
      await svc.clearPendingJoinUrl()
      await svc.clearPendingJoinUrl()
      expect(mockPreferences.remove).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------------------------------------------------------------
  // setPendingJoinUrl + clearPendingJoinUrl flow
  // -------------------------------------------------------------------------

  describe('set then clear flow', () => {
    it('after clear, getPendingJoinUrl returns null', async () => {
      let stored: string | null = '/join?code=CLEAR'
      mockPreferences.get.mockImplementation(async () => ({ value: stored }))
      mockPreferences.set.mockImplementation(async ({ value }) => { stored = value })
      mockPreferences.remove.mockImplementation(async () => { stored = null })

      const svc = await createService()
      await svc.setPendingJoinUrl('/join?code=CLEAR')
      await svc.clearPendingJoinUrl()
      const result = await svc.getPendingJoinUrl()
      expect(result).toBeNull()
    })
  })
})
