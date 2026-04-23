import { DestroyRef, inject, Injectable, signal, type Signal } from '@angular/core'

/**
 * Shared wall-clock signal that ticks ~4 Hz (every 250 ms).
 *
 * Drives the elapsed-time stopwatch on the Estimating screen.
 * Non-estimating screens never subscribe, so the cost is zero for them.
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
