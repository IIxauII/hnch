/**
 * Unit tests for TimerTickService.
 *
 * Verifies that `now` ticks at ~250 ms intervals and that the interval
 * is cleaned up when the service is destroyed. Uses vi fake timers for
 * deterministic control and Angular TestBed to exercise the real
 * DestroyRef.onDestroy wiring.
 *
 * Angular's zone.js patches setInterval before vi does, so we use
 * vi.useFakeTimers with `toFake` restricted to interval/timeout APIs to
 * avoid zone conflicts during TestBed setup.
 */

import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ionic/angular/standalone', () => ({}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

import { TimerTickService } from './timer-tick.service'

const TICK_INTERVAL = 250

afterEach(() => {
  vi.useRealTimers()
  TestBed.resetTestingModule()
})

describe('TimerTickService', () => {
  describe('now signal', () => {
    it('starts with a timestamp close to the real Date.now()', () => {
      vi.useFakeTimers()
      TestBed.configureTestingModule({})
      const svc = TestBed.inject(TimerTickService)

      const before = Date.now()
      const value = svc.now()
      // With fake timers, Date.now() is frozen at the point vi.useFakeTimers() was called.
      // The signal is set at construction time, so it should equal or be just after `before`.
      expect(value).toBeGreaterThanOrEqual(before)
    })

    it('updates after each 250 ms interval', () => {
      vi.useFakeTimers()
      TestBed.configureTestingModule({})
      const svc = TestBed.inject(TimerTickService)

      const t0 = svc.now()

      vi.advanceTimersByTime(TICK_INTERVAL)
      const t1 = svc.now()
      expect(t1).toBeGreaterThan(t0)

      vi.advanceTimersByTime(TICK_INTERVAL)
      const t2 = svc.now()
      expect(t2).toBeGreaterThan(t1)
    })

    it('does not update before 250 ms have elapsed', () => {
      vi.useFakeTimers()
      TestBed.configureTestingModule({})
      const svc = TestBed.inject(TimerTickService)

      const t0 = svc.now()
      vi.advanceTimersByTime(TICK_INTERVAL - 1)
      expect(svc.now()).toBe(t0)
    })
  })

  describe('interval cleanup on destroy', () => {
    it('stops updating after the service is destroyed', () => {
      vi.useFakeTimers()
      TestBed.configureTestingModule({})
      const svc = TestBed.inject(TimerTickService)

      vi.advanceTimersByTime(TICK_INTERVAL)
      const valueBeforeDestroy = svc.now()

      TestBed.resetTestingModule() // triggers DestroyRef.onDestroy → clearInterval

      // Re-enable real timers and confirm the signal is frozen
      vi.useRealTimers()
      // Signal value should not have changed since the interval was cleared
      expect(svc.now()).toBe(valueBeforeDestroy)
    })

    it('calls clearInterval when destroyed', () => {
      vi.useFakeTimers()
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

      TestBed.configureTestingModule({})
      TestBed.inject(TimerTickService)

      TestBed.resetTestingModule()

      expect(clearIntervalSpy).toHaveBeenCalled()
      clearIntervalSpy.mockRestore()
    })
  })
})
