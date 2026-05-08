import { Injectable } from '@angular/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Thin injectable wrapper around `@capacitor/haptics`.
 *
 * Centralizes the Capacitor import and makes haptic calls mockable in
 * unit tests. All methods are fire-and-forget — the native bridge
 * promise is intentionally not awaited (haptic latency should never
 * block UI). The plugin is a safe no-op on web.
 *
 * See documentation for the full haptic map.
 */
@Injectable({ providedIn: 'root' })
export class HapticService {
  impactLight(): void {
    void Haptics.impact({ style: ImpactStyle.Light });
  }

  impactMedium(): void {
    void Haptics.impact({ style: ImpactStyle.Medium });
  }

  impactHeavy(): void {
    void Haptics.impact({ style: ImpactStyle.Heavy });
  }

  notificationSuccess(): void {
    void Haptics.notification({ type: NotificationType.Success });
  }

  notificationWarning(): void {
    void Haptics.notification({ type: NotificationType.Warning });
  }
}
