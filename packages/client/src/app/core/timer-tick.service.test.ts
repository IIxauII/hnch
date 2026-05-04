/**
 * Unit tests for TimerTickService.
 *
 * Verifies:
 * - `now` signal initializes to approximately the current time
 * - `now` signal updates when the 250 ms interval fires
 * - The interval is cleared when the service's injection context is destroyed
 * - The service registers a 250 ms interval
 *
 * Notes:
 * - Zone.js intercepts `clearInterval` at the zone level, so we cannot
 *   spy on `globalThis.clearInterval` reliably. The destroy cleanup is
 *   tested behaviorally: after component destruction the `now` signal
 *   must stop advancing.
 * - To give the service a component-scoped DestroyRef (not root), we
 *   provide TimerTickService directly in the test component's `providers`
 *   array. This makes its interval tied to the component's lifetime.
 */

import { Component, inject } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ionic/angular/standalone', () => ({}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

import { TimerTickService } from './timer-tick.service'

/**
 * Provide the service at component scope so its `inject(DestroyRef)` is
 * tied to the component lifecycle, not the root environment injector.
 */
@Component({
  selector: 'app-test-host',
  template: '',
  standalone: true,
  providers: [TimerTickService],
})
class TestHostComponent {
  readonly timerTick = inject(TimerTickService)
}

describe('TimerTickService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHostComponent],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes now to approximately the current wall-clock time', () => {
    const before = Date.now()
    const fixture = TestBed.createComponent(TestHostComponent)
    fixture.detectChanges()
    const service = fixture.componentInstance.timerTick
    const after = Date.now()

    const value = service.now()
    expect(typeof value).toBe('number')
    expect(value).toBeGreaterThanOrEqual(before)
    expect(value).toBeLessThanOrEqual(after + 1)
  })

  it('now signal reflects Date.now() updates when the interval fires', async () => {
    const fixture = TestBed.createComponent(TestHostComponent)
    fixture.detectChanges()
    const service = fixture.componentInstance.timerTick

    const initial = service.now()

    // Wait for at least one 250 ms tick to fire.
    await new Promise<void>((resolve) => {
      const start = Date.now()
      const check = (): void => {
        if (service.now() > initial || Date.now() - start > 2_000) {
          resolve()
        } else {
          setTimeout(check, 50)
        }
      }
      setTimeout(check, 50)
    })

    expect(service.now()).toBeGreaterThan(initial)
  })

  it('registers a 250 ms interval on construction', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const fixture = TestBed.createComponent(TestHostComponent)
    fixture.detectChanges()

    const calls = setIntervalSpy.mock.calls
    const has250ms = calls.some((args) => args[1] === 250)
    expect(has250ms).toBe(true)
  })

  it('stops ticking after the component (and its scoped service) is destroyed', async () => {
    const fixture = TestBed.createComponent(TestHostComponent)
    fixture.detectChanges()
    const service = fixture.componentInstance.timerTick

    // Confirm the service is live before destroying.
    await new Promise<void>((resolve) => setTimeout(resolve, 300))
    expect(service.now()).toBeGreaterThan(0)

    fixture.destroy()
    const snapshotAfterDestroy = service.now()

    // Wait one full interval period — value must not advance.
    await new Promise<void>((resolve) => setTimeout(resolve, 300))

    expect(service.now()).toBe(snapshotAfterDestroy)
  })
})
