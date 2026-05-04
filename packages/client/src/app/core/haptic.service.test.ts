/**
 * Unit tests for HapticService.
 *
 * HapticService is a thin injectable wrapper around @capacitor/haptics.
 * Each method delegates to the correct Haptics API with the expected
 * style/type argument. Mocks the plugin so tests are hermetic and run
 * on Node (no native bridge).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock @capacitor/haptics
// ---------------------------------------------------------------------------

const mockImpact = vi.fn<(opts: { style: string }) => Promise<void>>().mockResolvedValue(undefined)
const mockNotification = vi
  .fn<(opts: { type: string }) => Promise<void>>()
  .mockResolvedValue(undefined)

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: mockImpact,
    notification: mockNotification,
  },
  ImpactStyle: {
    Light: 'LIGHT',
    Medium: 'MEDIUM',
    Heavy: 'HEAVY',
  },
  NotificationType: {
    Success: 'SUCCESS',
    Warning: 'WARNING',
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createService() {
  const mod = await import('./haptic.service')
  return new mod.HapticService()
}

// ---------------------------------------------------------------------------

describe('HapticService', () => {
  let service: Awaited<ReturnType<typeof createService>>

  beforeEach(async () => {
    mockImpact.mockClear()
    mockNotification.mockClear()
    service = await createService()
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('impact methods', () => {
    it('impactLight calls Haptics.impact with ImpactStyle.Light', () => {
      service.impactLight()
      expect(mockImpact).toHaveBeenCalledOnce()
      expect(mockImpact).toHaveBeenCalledWith({ style: 'LIGHT' })
    })

    it('impactMedium calls Haptics.impact with ImpactStyle.Medium', () => {
      service.impactMedium()
      expect(mockImpact).toHaveBeenCalledOnce()
      expect(mockImpact).toHaveBeenCalledWith({ style: 'MEDIUM' })
    })

    it('impactHeavy calls Haptics.impact with ImpactStyle.Heavy', () => {
      service.impactHeavy()
      expect(mockImpact).toHaveBeenCalledOnce()
      expect(mockImpact).toHaveBeenCalledWith({ style: 'HEAVY' })
    })
  })

  describe('notification methods', () => {
    it('notificationSuccess calls Haptics.notification with NotificationType.Success', () => {
      service.notificationSuccess()
      expect(mockNotification).toHaveBeenCalledOnce()
      expect(mockNotification).toHaveBeenCalledWith({ type: 'SUCCESS' })
    })

    it('notificationWarning calls Haptics.notification with NotificationType.Warning', () => {
      service.notificationWarning()
      expect(mockNotification).toHaveBeenCalledOnce()
      expect(mockNotification).toHaveBeenCalledWith({ type: 'WARNING' })
    })
  })

  it('impact methods do not call notification', () => {
    service.impactLight()
    service.impactMedium()
    service.impactHeavy()
    expect(mockNotification).not.toHaveBeenCalled()
  })

  it('notification methods do not call impact', () => {
    service.notificationSuccess()
    service.notificationWarning()
    expect(mockImpact).not.toHaveBeenCalled()
  })
})
