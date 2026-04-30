/**
 * Unit tests for DisplayNameService.
 *
 * Verifies CRUD behaviour for the display name and pending join URL
 * stored via Capacitor Preferences, including correct key namespacing.
 *
 * Mocks Capacitor Preferences so no Capacitor native layer is needed.
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
  const { DisplayNameService } = await import('./display-name.service')
  return new DisplayNameService()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DisplayNameService', () => {
  beforeEach(() => {
    mockPreferences.get.mockReset()
    mockPreferences.set.mockReset()
    mockPreferences.remove.mockReset()
    mockPreferences.set.mockResolvedValue(undefined)
    mockPreferences.remove.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // getDisplayName
  // -------------------------------------------------------------------------

  describe('getDisplayName', () => {
    it('returns null when not set', async () => {
      mockPreferences.get.mockResolvedValue({ value: null })
      const svc = await createService()

      expect(await svc.getDisplayName()).toBeNull()
      expect(mockPreferences.get).toHaveBeenCalledWith({
        key: 'hnch.displayName',
      })
    })

    it('returns the stored name', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'Alice' })
      const svc = await createService()

      expect(await svc.getDisplayName()).toBe('Alice')
    })
  })

  // -------------------------------------------------------------------------
  // setDisplayName
  // -------------------------------------------------------------------------

  describe('setDisplayName', () => {
    it('writes to the correct Preferences key', async () => {
      mockPreferences.get.mockResolvedValue({ value: null })
      const svc = await createService()
      await svc.setDisplayName('Bob')

      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.displayName',
        value: 'Bob',
      })
    })

    it('overwrites a previously set name', async () => {
      const svc = await createService()
      await svc.setDisplayName('Alice')
      await svc.setDisplayName('Bob')

      expect(mockPreferences.set).toHaveBeenLastCalledWith({
        key: 'hnch.displayName',
        value: 'Bob',
      })
    })
  })

  // -------------------------------------------------------------------------
  // getPendingJoinUrl
  // -------------------------------------------------------------------------

  describe('getPendingJoinUrl', () => {
    it('returns null when not set', async () => {
      mockPreferences.get.mockResolvedValue({ value: null })
      const svc = await createService()

      expect(await svc.getPendingJoinUrl()).toBeNull()
      expect(mockPreferences.get).toHaveBeenCalledWith({
        key: 'hnch.pendingJoinUrl',
      })
    })

    it('returns the stored URL', async () => {
      mockPreferences.get.mockResolvedValue({
        value: 'https://hnch.dev/join?code=ABC123',
      })
      const svc = await createService()

      expect(await svc.getPendingJoinUrl()).toBe('https://hnch.dev/join?code=ABC123')
    })
  })

  // -------------------------------------------------------------------------
  // setPendingJoinUrl
  // -------------------------------------------------------------------------

  describe('setPendingJoinUrl', () => {
    it('writes to the correct Preferences key', async () => {
      const svc = await createService()
      await svc.setPendingJoinUrl('https://hnch.dev/join?code=XYZ999')

      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.pendingJoinUrl',
        value: 'https://hnch.dev/join?code=XYZ999',
      })
    })
  })

  // -------------------------------------------------------------------------
  // clearPendingJoinUrl
  // -------------------------------------------------------------------------

  describe('clearPendingJoinUrl', () => {
    it('removes the Preferences key', async () => {
      const svc = await createService()
      await svc.clearPendingJoinUrl()

      expect(mockPreferences.remove).toHaveBeenCalledWith({
        key: 'hnch.pendingJoinUrl',
      })
    })

    it('is idempotent — calling twice does not throw', async () => {
      const svc = await createService()
      await svc.clearPendingJoinUrl()
      await svc.clearPendingJoinUrl()

      expect(mockPreferences.remove).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------------------------------------------------------------
  // Key isolation — display name and pending URL use separate keys
  // -------------------------------------------------------------------------

  it('display name and pending join URL use distinct Preferences keys', async () => {
    const { DisplayNameService: Svc } = await import('./display-name.service')
    expect(Svc.DISPLAY_NAME_KEY).toBe('hnch.displayName')
    expect(Svc.PENDING_JOIN_URL_KEY).toBe('hnch.pendingJoinUrl')
    expect(Svc.DISPLAY_NAME_KEY).not.toBe(Svc.PENDING_JOIN_URL_KEY)
  })
})
