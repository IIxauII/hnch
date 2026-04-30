/**
 * Unit tests for AppPreferenceService.
 *
 * Verifies signal initialisation, Preferences persistence, URL
 * transformation (http→ws / https→wss), idempotent `ensureLoaded`,
 * and clear / set behaviour for each setting.
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
  const { AppPreferenceService } = await import('./app-preference.service')
  return new AppPreferenceService()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppPreferenceService', () => {
  beforeEach(() => {
    mockPreferences.get.mockReset()
    mockPreferences.set.mockReset()
    mockPreferences.remove.mockReset()
    // Default: every Preferences key returns null
    mockPreferences.get.mockResolvedValue({ value: null })
    mockPreferences.set.mockResolvedValue(undefined)
    mockPreferences.remove.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('defaultSessionName is undefined before load', async () => {
      const svc = await createService()
      expect(svc.defaultSessionName()).toBeUndefined()
    })

    it('defaultPassword is false before load', async () => {
      const svc = await createService()
      expect(svc.defaultPassword()).toBe(false)
    })

    it('relayHttpUrl is undefined before load', async () => {
      const svc = await createService()
      expect(svc.relayHttpUrl()).toBeUndefined()
    })

    it('relayWsUrl is undefined before load', async () => {
      const svc = await createService()
      expect(svc.relayWsUrl()).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // ensureLoaded
  // -------------------------------------------------------------------------

  describe('ensureLoaded', () => {
    it('reads all three Preference keys', async () => {
      const svc = await createService()
      await svc.ensureLoaded()

      expect(mockPreferences.get).toHaveBeenCalledWith({
        key: 'hnch.defaultSessionName',
      })
      expect(mockPreferences.get).toHaveBeenCalledWith({
        key: 'hnch.defaultPassword',
      })
      expect(mockPreferences.get).toHaveBeenCalledWith({
        key: 'hnch.relayUrl',
      })
    })

    it('populates defaultSessionName from Preferences', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.defaultSessionName')
          return Promise.resolve({ value: 'Sprint 42' })
        return Promise.resolve({ value: null })
      })
      const svc = await createService()
      await svc.ensureLoaded()

      expect(svc.defaultSessionName()).toBe('Sprint 42')
    })

    it('populates defaultPassword true from Preferences', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.defaultPassword')
          return Promise.resolve({ value: 'true' })
        return Promise.resolve({ value: null })
      })
      const svc = await createService()
      await svc.ensureLoaded()

      expect(svc.defaultPassword()).toBe(true)
    })

    it('ignores non-boolean defaultPassword value', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.defaultPassword')
          return Promise.resolve({ value: 'not-a-boolean' })
        return Promise.resolve({ value: null })
      })
      const svc = await createService()
      await svc.ensureLoaded()

      expect(svc.defaultPassword()).toBe(false)
    })

    it('populates relayHttpUrl from Preferences', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.relayUrl')
          return Promise.resolve({ value: 'http://relay.example.com:1234' })
        return Promise.resolve({ value: null })
      })
      const svc = await createService()
      await svc.ensureLoaded()

      expect(svc.relayHttpUrl()).toBe('http://relay.example.com:1234')
    })

    it('leaves signals at defaults when all Preferences are null', async () => {
      const svc = await createService()
      await svc.ensureLoaded()

      expect(svc.defaultSessionName()).toBeUndefined()
      expect(svc.defaultPassword()).toBe(false)
      expect(svc.relayHttpUrl()).toBeUndefined()
    })

    it('is idempotent — concurrent calls share one in-flight load', async () => {
      mockPreferences.get.mockResolvedValue({ value: null })
      const svc = await createService()

      // Fire two concurrent calls; Preferences.get should run only once per key.
      await Promise.all([svc.ensureLoaded(), svc.ensureLoaded()])

      // 3 keys × 1 batch = 3 calls total (not 6)
      expect(mockPreferences.get).toHaveBeenCalledTimes(3)
    })
  })

  // -------------------------------------------------------------------------
  // setDefaultSessionName
  // -------------------------------------------------------------------------

  describe('setDefaultSessionName', () => {
    it('updates signal and persists to Preferences', async () => {
      const svc = await createService()
      await svc.setDefaultSessionName('My Team')

      expect(svc.defaultSessionName()).toBe('My Team')
      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.defaultSessionName',
        value: 'My Team',
      })
    })

    it('clears signal and removes Preferences key when set to undefined', async () => {
      const svc = await createService()
      // First set a value
      await svc.setDefaultSessionName('Old Name')
      // Then clear it
      await svc.setDefaultSessionName(undefined)

      expect(svc.defaultSessionName()).toBeUndefined()
      expect(mockPreferences.remove).toHaveBeenCalledWith({
        key: 'hnch.defaultSessionName',
      })
    })
  })

  // -------------------------------------------------------------------------
  // setDefaultPassword
  // -------------------------------------------------------------------------

  describe('setDefaultPassword', () => {
    it('updates signal to true and persists', async () => {
      const svc = await createService()
      await svc.setDefaultPassword(true)

      expect(svc.defaultPassword()).toBe(true)
      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.defaultPassword',
        value: 'true',
      })
    })

    it('updates signal to false and persists', async () => {
      const svc = await createService()
      await svc.setDefaultPassword(true)
      await svc.setDefaultPassword(false)

      expect(svc.defaultPassword()).toBe(false)
      expect(mockPreferences.set).toHaveBeenLastCalledWith({
        key: 'hnch.defaultPassword',
        value: 'false',
      })
    })
  })

  // -------------------------------------------------------------------------
  // setRelayUrl
  // -------------------------------------------------------------------------

  describe('setRelayUrl', () => {
    it('updates relayHttpUrl signal and persists', async () => {
      const svc = await createService()
      await svc.setRelayUrl('http://localhost:1234')

      expect(svc.relayHttpUrl()).toBe('http://localhost:1234')
      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.relayUrl',
        value: 'http://localhost:1234',
      })
    })

    it('clears signal and removes Preferences key when set to undefined', async () => {
      const svc = await createService()
      await svc.setRelayUrl('http://localhost:1234')
      await svc.setRelayUrl(undefined)

      expect(svc.relayHttpUrl()).toBeUndefined()
      expect(mockPreferences.remove).toHaveBeenCalledWith({
        key: 'hnch.relayUrl',
      })
    })
  })

  // -------------------------------------------------------------------------
  // relayWsUrl computed signal
  // -------------------------------------------------------------------------

  describe('relayWsUrl', () => {
    it('is undefined when no relay URL is set', async () => {
      const svc = await createService()
      expect(svc.relayWsUrl()).toBeUndefined()
    })

    it('converts http:// to ws://', async () => {
      const svc = await createService()
      await svc.setRelayUrl('http://relay.example.com:1234')

      expect(svc.relayWsUrl()).toBe('ws://relay.example.com:1234')
    })

    it('converts https:// to wss://', async () => {
      const svc = await createService()
      await svc.setRelayUrl('https://relay.example.com')

      expect(svc.relayWsUrl()).toBe('wss://relay.example.com')
    })

    it('updates reactively when relayHttpUrl changes', async () => {
      const svc = await createService()
      await svc.setRelayUrl('http://host-a:1234')
      expect(svc.relayWsUrl()).toBe('ws://host-a:1234')

      await svc.setRelayUrl('https://host-b')
      expect(svc.relayWsUrl()).toBe('wss://host-b')

      await svc.setRelayUrl(undefined)
      expect(svc.relayWsUrl()).toBeUndefined()
    })
  })
})
