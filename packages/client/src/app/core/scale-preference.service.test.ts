/**
 * Unit tests for ScalePreferenceService — ADR-0019.
 *
 * Covers:
 *  - Signal initialisation and defaults
 *  - ensureLoaded: reads three Preference keys; validates + ignores bad data
 *  - availableScales computed signal (builtin presets + custom scales)
 *  - defaultScale computed signal with ID fallback logic
 *  - togglePresetCard: enable, disable, guard against removing last card
 *  - addCustomScale: ID generation (custom- prefix), persistence, return value
 *  - updateCustomScale: in-place edit, no-op for unknown id
 *  - deleteCustomScale: removal, idempotent on unknown id
 *  - setDefaultScaleId: updates signal + persists
 *
 * Mocks Capacitor Preferences. Uses the shared BUILTIN_SCALES constant
 * from @hnch/shared to avoid hardcoding card counts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_SCALES } from '@hnch/shared'

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
// Helpers
// ---------------------------------------------------------------------------

async function createService() {
  const { ScalePreferenceService } = await import('./scale-preference.service')
  return new ScalePreferenceService()
}

function allNull(): Promise<{ value: null }> {
  return Promise.resolve({ value: null })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScalePreferenceService', () => {
  beforeEach(() => {
    mockPreferences.get.mockReset()
    mockPreferences.set.mockReset()
    mockPreferences.get.mockImplementation(() => allNull())
    mockPreferences.set.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('presetOverrides is empty object', async () => {
      const svc = await createService()
      expect(svc.presetOverrides()).toEqual({})
    })

    it('customScales is empty array', async () => {
      const svc = await createService()
      expect(svc.customScales()).toEqual([])
    })

    it('defaultScaleId is fibonacci', async () => {
      const svc = await createService()
      expect(svc.defaultScaleId()).toBe('fibonacci')
    })

    it('availableScales includes all builtin presets', async () => {
      const svc = await createService()
      const ids = svc.availableScales().map((s) => s.id)
      expect(ids).toContain('fibonacci')
      expect(ids).toContain('t-shirt')
      expect(ids).toContain('powers-of-2')
    })

    it('defaultScale resolves to fibonacci scale', async () => {
      const svc = await createService()
      expect(svc.defaultScale().id).toBe('fibonacci')
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
        key: 'hnch.presetOverrides',
      })
      expect(mockPreferences.get).toHaveBeenCalledWith({
        key: 'hnch.customScales',
      })
      expect(mockPreferences.get).toHaveBeenCalledWith({
        key: 'hnch.defaultScaleId',
      })
    })

    it('loads preset overrides from Preferences', async () => {
      const overrides = { fibonacci: [0, 2] }
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.presetOverrides')
          return Promise.resolve({ value: JSON.stringify(overrides) })
        return allNull()
      })
      const svc = await createService()
      await svc.ensureLoaded()

      expect(svc.presetOverrides()).toEqual(overrides)
    })

    it('loads custom scales from Preferences', async () => {
      const custom = [{ id: 'custom-abc', label: 'My Scale', cards: ['S', 'M', 'L'] }]
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.customScales')
          return Promise.resolve({ value: JSON.stringify(custom) })
        return allNull()
      })
      const svc = await createService()
      await svc.ensureLoaded()

      expect(svc.customScales()).toEqual(custom)
    })

    it('loads defaultScaleId from Preferences', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.defaultScaleId')
          return Promise.resolve({ value: 't-shirt' })
        return allNull()
      })
      const svc = await createService()
      await svc.ensureLoaded()

      expect(svc.defaultScaleId()).toBe('t-shirt')
    })

    it('ignores malformed presetOverrides (non-object)', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.presetOverrides')
          return Promise.resolve({ value: '"just-a-string"' })
        return allNull()
      })
      const svc = await createService()
      await svc.ensureLoaded()

      expect(svc.presetOverrides()).toEqual({})
    })

    it('ignores malformed customScales (non-array)', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.customScales')
          return Promise.resolve({ value: '{"not":"array"}' })
        return allNull()
      })
      const svc = await createService()
      await svc.ensureLoaded()

      expect(svc.customScales()).toEqual([])
    })

    it('is idempotent — concurrent calls share one in-flight load', async () => {
      const svc = await createService()
      await Promise.all([svc.ensureLoaded(), svc.ensureLoaded()])
      // 3 keys × 1 batch = 3 calls total
      expect(mockPreferences.get).toHaveBeenCalledTimes(3)
    })
  })

  // -------------------------------------------------------------------------
  // togglePresetCard
  // -------------------------------------------------------------------------

  describe('togglePresetCard', () => {
    it('disables a card (adds its index to the disabled set)', async () => {
      const svc = await createService()
      await svc.togglePresetCard('fibonacci', 0)

      expect(svc.presetOverrides()['fibonacci']).toContain(0)
    })

    it('re-enables a disabled card (removes its index from the disabled set)', async () => {
      const svc = await createService()
      await svc.togglePresetCard('fibonacci', 0) // disable
      await svc.togglePresetCard('fibonacci', 0) // re-enable

      // Key should be absent (empty list is deleted)
      expect(svc.presetOverrides()['fibonacci']).toBeUndefined()
    })

    it('persists overrides to Preferences', async () => {
      const svc = await createService()
      await svc.togglePresetCard('fibonacci', 1)

      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.presetOverrides',
        value: expect.stringContaining('"fibonacci"'),
      })
    })

    it('does not allow disabling the last enabled card', async () => {
      const svc = await createService()
      const fibCards = BUILTIN_SCALES['fibonacci']!.cards
      // Disable all cards except the last one
      for (let i = 0; i < fibCards.length - 1; i++) {
        await svc.togglePresetCard('fibonacci', i)
      }
      const beforeCount = svc.presetOverrides()['fibonacci']?.length ?? 0

      // Attempt to disable the last remaining card
      await svc.togglePresetCard('fibonacci', fibCards.length - 1)

      // State must not have changed
      const afterCount = svc.presetOverrides()['fibonacci']?.length ?? 0
      expect(afterCount).toBe(beforeCount)
    })

    it('no-ops silently for unknown scale id', async () => {
      const svc = await createService()
      await svc.togglePresetCard('nonexistent-scale', 0)

      expect(svc.presetOverrides()).toEqual({})
      expect(mockPreferences.set).not.toHaveBeenCalled()
    })

    it('no-ops silently for out-of-range index', async () => {
      const svc = await createService()
      await svc.togglePresetCard('fibonacci', 9999)

      expect(svc.presetOverrides()).toEqual({})
      expect(mockPreferences.set).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // addCustomScale
  // -------------------------------------------------------------------------

  describe('addCustomScale', () => {
    it('appends the new scale and returns its id', async () => {
      const svc = await createService()
      const id = await svc.addCustomScale('Team Scale', ['XS', 'S', 'M', 'L', 'XL'])

      expect(id).toMatch(/^custom-/)
      expect(svc.customScales()).toHaveLength(1)
      expect(svc.customScales()[0]).toEqual({
        id,
        label: 'Team Scale',
        cards: ['XS', 'S', 'M', 'L', 'XL'],
      })
    })

    it('persists updated custom scales to Preferences', async () => {
      const svc = await createService()
      await svc.addCustomScale('Risk', ['Low', 'Med', 'High'])

      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.customScales',
        value: expect.stringContaining('"label":"Risk"'),
      })
    })

    it('generates unique ids across multiple additions', async () => {
      const svc = await createService()
      const id1 = await svc.addCustomScale('A', ['1'])
      const id2 = await svc.addCustomScale('B', ['2'])

      expect(id1).not.toBe(id2)
      expect(svc.customScales()).toHaveLength(2)
    })
  })

  // -------------------------------------------------------------------------
  // updateCustomScale
  // -------------------------------------------------------------------------

  describe('updateCustomScale', () => {
    it('updates label and cards in-place, preserving id', async () => {
      const svc = await createService()
      const id = await svc.addCustomScale('Old Label', ['a', 'b'])
      mockPreferences.set.mockClear()

      await svc.updateCustomScale(id, 'New Label', ['x', 'y', 'z'])

      const scales = svc.customScales()
      expect(scales).toHaveLength(1)
      expect(scales[0]).toEqual({ id, label: 'New Label', cards: ['x', 'y', 'z'] })
    })

    it('persists updated scales to Preferences', async () => {
      const svc = await createService()
      const id = await svc.addCustomScale('Before', ['1'])
      mockPreferences.set.mockClear()

      await svc.updateCustomScale(id, 'After', ['2'])

      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.customScales',
        value: expect.stringContaining('"After"'),
      })
    })

    it('no-ops silently for unknown id', async () => {
      const svc = await createService()
      await svc.addCustomScale('Real', ['r'])
      mockPreferences.set.mockClear()

      await svc.updateCustomScale('custom-nonexistent', 'Ghost', ['g'])

      expect(svc.customScales()[0]?.label).toBe('Real')
      expect(mockPreferences.set).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // deleteCustomScale
  // -------------------------------------------------------------------------

  describe('deleteCustomScale', () => {
    it('removes the scale by id', async () => {
      const svc = await createService()
      const id = await svc.addCustomScale('ToDelete', ['d'])
      await svc.deleteCustomScale(id)

      expect(svc.customScales()).toHaveLength(0)
    })

    it('only removes the matching scale when multiple exist', async () => {
      const svc = await createService()
      const id1 = await svc.addCustomScale('Keep', ['k'])
      const id2 = await svc.addCustomScale('Delete', ['d'])
      await svc.deleteCustomScale(id2)

      expect(svc.customScales()).toHaveLength(1)
      expect(svc.customScales()[0]!.id).toBe(id1)
    })

    it('is idempotent — deleting an unknown id does not throw', async () => {
      const svc = await createService()
      await svc.addCustomScale('Existing', ['e'])
      mockPreferences.set.mockClear()

      await svc.deleteCustomScale('custom-ghost-id')

      // State unchanged, no Preferences write
      expect(svc.customScales()).toHaveLength(1)
      expect(mockPreferences.set).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // setDefaultScaleId
  // -------------------------------------------------------------------------

  describe('setDefaultScaleId', () => {
    it('updates the defaultScaleId signal', async () => {
      const svc = await createService()
      await svc.setDefaultScaleId('t-shirt')

      expect(svc.defaultScaleId()).toBe('t-shirt')
    })

    it('persists to Preferences', async () => {
      const svc = await createService()
      await svc.setDefaultScaleId('powers-of-2')

      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.defaultScaleId',
        value: 'powers-of-2',
      })
    })
  })

  // -------------------------------------------------------------------------
  // defaultScale computed fallback logic
  // -------------------------------------------------------------------------

  describe('defaultScale fallback', () => {
    it('returns the scale matching defaultScaleId', async () => {
      const svc = await createService()
      await svc.setDefaultScaleId('t-shirt')

      expect(svc.defaultScale().id).toBe('t-shirt')
    })

    it('falls back to fibonacci when defaultScaleId is unknown', async () => {
      const svc = await createService()
      await svc.setDefaultScaleId('nonexistent-id')

      expect(svc.defaultScale().id).toBe('fibonacci')
    })

    it('resolves a custom scale by id when it is the default', async () => {
      const svc = await createService()
      const id = await svc.addCustomScale('My Custom', ['a', 'b'])
      await svc.setDefaultScaleId(id)

      // Scale wire format only exposes id + cards; label is not on Scale
      expect(svc.defaultScale().id).toBe(id)
      expect(svc.defaultScale().cards).toEqual(['a', 'b'])
    })
  })
})
