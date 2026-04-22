import { DestroyRef, inject, Injectable, signal, type Signal } from '@angular/core'

/**
 * Shared wall-clock signal that ticks ~4 Hz (every 250 ms).
 *
 * The countdown label on Estimating and the timer-expiry watcher in
 * `RoundTimerService` both need a "now" that advances faster than
 * Angular's normal change-detection cadence. Consumers read the signal;
 * non-timer screens never subscribe, so the cost is zero for them.
 *
 * Uses `setInterval` (not `requestAnimationFrame`) deliberately:
 * `rAF` pauses in background tabs, but the host-writes-reveal path
 * needs to fire even when the tab is backgrounded. Browsers may
 * throttle the interval to ~1 Hz in background tabs — the fallback
 * reveal path (§2.4(c)) handles any resulting delay.
 */
@Injectable({ providedIn: 'root' })
export class TimerTickService {
  private readonly nowSignal = signal(Date.now())
  private readonly destroyRef = inject(DestroyRef)

  readonly now: Signal<number> = this.nowSignal.asReadonly()

  constructor() {
    const id = setInterval(() => this.nowSignal.set(Date.now()), 250)
    this.destroyRef.onDestroy(() => clearInterval(id))
  }
}
