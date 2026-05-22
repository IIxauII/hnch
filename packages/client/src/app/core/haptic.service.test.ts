// Exercises: haptic.service:HapticService

import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: vi.fn().mockResolvedValue(undefined),
    notification: vi.fn().mockResolvedValue(undefined),
  },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING' },
}));

vi.mock('@ionic/angular/standalone', () => ({}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { HapticService } from './haptic.service';

describe('HapticService', () => {
  function setup(): HapticService {
    TestBed.configureTestingModule({ providers: [HapticService] });
    return TestBed.inject(HapticService);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  it('impactLight() calls Haptics.impact with ImpactStyle.Light', () => {
    const svc = setup();
    svc.impactLight();
    expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Light });
  });

  it('impactMedium() calls Haptics.impact with ImpactStyle.Medium', () => {
    const svc = setup();
    svc.impactMedium();
    expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Medium });
  });

  it('impactHeavy() calls Haptics.impact with ImpactStyle.Heavy', () => {
    const svc = setup();
    svc.impactHeavy();
    expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Heavy });
  });

  it('notificationSuccess() calls Haptics.notification with NotificationType.Success', () => {
    const svc = setup();
    svc.notificationSuccess();
    expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Success });
  });

  it('notificationWarning() calls Haptics.notification with NotificationType.Warning', () => {
    const svc = setup();
    svc.notificationWarning();
    expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Warning });
  });
});
