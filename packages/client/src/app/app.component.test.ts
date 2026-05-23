/**
 * Unit tests for the host-change toast effect in AppComponent.
 *
 * The effect tracks `docService.settings().hostParticipantId` via a
 * `previousHostId` internal signal and fires a toast (+ haptic) only
 * when the hostId changes after the first observation. Scenarios:
 *  - First observation (prev=null) → seed without toast
 *  - Subsequent same-hostId → no toast
 *  - hostId changes → toast + haptic
 *  - hostId transitions to null → reset tracking, no toast
 *
 * HostElectionService / SessionEndService / ParticipantRemovalService /
 * ThemeService are provided as empty stubs because they are eagerly
 * injected but their own behaviour is tested in dedicated suites.
 */

// Exercises: app/app.component:AppComponent (host-change toast effect)

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — must be hoisted above imports
// ---------------------------------------------------------------------------

vi.mock('@ionic/angular/standalone', async () => {
  const { Component } = await import('@angular/core');

  @Component({ selector: 'ion-app', template: '<ng-content />', standalone: true })
  class IonApp {}

  @Component({ selector: 'ion-router-outlet', template: '', standalone: true })
  class IonRouterOutlet {}

  return { IonApp, IonRouterOutlet };
});

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: vi.fn().mockResolvedValue(undefined),
    notification: vi.fn().mockResolvedValue(undefined),
  },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING' },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@capacitor/device', () => ({
  Device: { getId: vi.fn().mockResolvedValue({ identifier: 'test-device-id' }) },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import type { ParticipantSnapshot, SessionSettings } from '@hnch/shared';

import { AppComponent } from './app.component';
import { DocService } from './core/doc/doc.service';
import { HapticService } from './core/haptic.service';
import { HostElectionService } from './core/host-election.service';
import { ParticipantIdService } from './core/participant-id.service';
import { ParticipantRemovalService } from './core/participant-removal.service';
import { SessionEndService } from './core/session-end.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './services/toast.service';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeDocMock() {
  const settingsSig = signal<SessionSettings | null>(null);
  const participantsSig = signal<readonly ParticipantSnapshot[]>([]);
  return {
    settings: settingsSig.asReadonly(),
    participants: participantsSig.asReadonly(),
    // writable handles for test scenarios
    _settings: settingsSig,
    _participants: participantsSig,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppComponent — host-change toast effect', () => {
  let docMock: ReturnType<typeof makeDocMock>;
  let toastInfoSpy: ReturnType<typeof vi.fn>;
  let hapticSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    docMock = makeDocMock();
    toastInfoSpy = vi.fn().mockResolvedValue(undefined);
    hapticSpy = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: DocService, useValue: docMock },
        { provide: HapticService, useValue: { notificationWarning: hapticSpy } },
        { provide: ParticipantIdService, useValue: { id: signal<string | null>('me') } },
        { provide: ToastService, useValue: { info: toastInfoSpy } },
        // Eagerly-instantiated services that must be injectable but are not exercised here
        { provide: HostElectionService, useValue: {} },
        { provide: SessionEndService, useValue: {} },
        { provide: ParticipantRemovalService, useValue: {} },
        { provide: ThemeService, useValue: {} },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  it('does not fire a toast on the first hostId observation (seeds without toast)', async () => {
    TestBed.createComponent(AppComponent);
    TestBed.flushEffects();

    // First observation: null → 'host-1'
    docMock._settings.set({
      hostParticipantId: 'host-1',
      defaultScale: { id: 'fibonacci', cards: ['1'] },
    });
    docMock._participants.set([{ id: 'host-1', displayName: 'Alice', joinedAt: 0, role: 'voter' }]);
    TestBed.flushEffects();
    await Promise.resolve(); // flush async microtasks

    expect(toastInfoSpy).not.toHaveBeenCalled();
  });

  it('fires a toast and haptic when the host changes to a different peer', async () => {
    TestBed.createComponent(AppComponent);
    TestBed.flushEffects();

    const defaultScale = { id: 'fibonacci', cards: ['1'] };

    // Seed the initial host (no toast)
    docMock._settings.set({ hostParticipantId: 'host-1', defaultScale });
    docMock._participants.set([
      { id: 'host-1', displayName: 'Alice', joinedAt: 0, role: 'voter' },
      { id: 'host-2', displayName: 'Bob', joinedAt: 0, role: 'voter' },
    ]);
    TestBed.flushEffects();
    await Promise.resolve();

    // Now change the host
    docMock._settings.set({ hostParticipantId: 'host-2', defaultScale });
    TestBed.flushEffects();
    await Promise.resolve();

    expect(toastInfoSpy).toHaveBeenCalledOnce();
    expect(hapticSpy).toHaveBeenCalledOnce();

    const message = String(toastInfoSpy.mock.calls[0]![0]);
    expect(message).toContain('Bob');
  });

  it('does not fire a toast when the same host appears in consecutive observations', async () => {
    TestBed.createComponent(AppComponent);
    TestBed.flushEffects();

    const defaultScale = { id: 'fibonacci', cards: ['1'] };

    // Seed
    docMock._settings.set({ hostParticipantId: 'host-1', defaultScale });
    TestBed.flushEffects();
    await Promise.resolve();

    // Same hostId again
    docMock._settings.set({ hostParticipantId: 'host-1', defaultScale });
    TestBed.flushEffects();
    await Promise.resolve();

    expect(toastInfoSpy).not.toHaveBeenCalled();
  });

  it('resets tracking when settings become null (session ends)', async () => {
    TestBed.createComponent(AppComponent);
    TestBed.flushEffects();

    const defaultScale = { id: 'fibonacci', cards: ['1'] };

    // Seed host-1 → host-2 (toast fires once)
    docMock._settings.set({ hostParticipantId: 'host-1', defaultScale });
    docMock._participants.set([
      { id: 'host-1', displayName: 'Alice', joinedAt: 0, role: 'voter' },
      { id: 'host-2', displayName: 'Bob', joinedAt: 0, role: 'voter' },
    ]);
    TestBed.flushEffects();
    await Promise.resolve();
    docMock._settings.set({ hostParticipantId: 'host-2', defaultScale });
    TestBed.flushEffects();
    await Promise.resolve();

    const callCountAfterChange = toastInfoSpy.mock.calls.length;
    expect(callCountAfterChange).toBe(1);

    // Session ends → settings null resets tracking
    docMock._settings.set(null);
    TestBed.flushEffects();
    await Promise.resolve();

    // No additional toast on the null transition
    expect(toastInfoSpy).toHaveBeenCalledTimes(callCountAfterChange);
  });

  it('message says "You are now the host" when the local participant becomes host', async () => {
    TestBed.createComponent(AppComponent);
    TestBed.flushEffects();

    const defaultScale = { id: 'fibonacci', cards: ['1'] };

    // Initial host
    docMock._settings.set({ hostParticipantId: 'host-1', defaultScale });
    docMock._participants.set([
      { id: 'host-1', displayName: 'Alice', joinedAt: 0, role: 'voter' },
      { id: 'me', displayName: 'Me', joinedAt: 0, role: 'voter' },
    ]);
    TestBed.flushEffects();
    await Promise.resolve();

    // Local participant ('me' from ParticipantIdService mock) becomes host
    docMock._settings.set({ hostParticipantId: 'me', defaultScale });
    TestBed.flushEffects();
    await Promise.resolve();

    const message = String(toastInfoSpy.mock.calls[0]![0]);
    expect(message).toContain('You are now the host');
  });
});
