/**
 * Unit tests for AppComponent's host-change toast — the client's sink for the
 * session events driver's `host-changed` event.
 *
 * The rule (the first host is a seed, the cause, the names, the wording) is
 * the shared driver's and is tested there. What is tested here is the sink: a
 * fake `onSessionEvent` captures the component's listener and hand-built
 * events are pushed through it, as `DocService` would deliver them.
 *
 * SessionEndService / SessionRejectionService / ParticipantRemovalService /
 * ThemeService are provided as empty stubs because they are eagerly injected
 * but their own behaviour is tested in dedicated suites.
 */

// Exercises: app/app.component:AppComponent (host-change toast)

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Module-level mocks — must be hoisted above imports

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

// Imports (after mocks)

import type { SessionEvent } from '@hnch/shared';

import { AppComponent } from './app.component';
import { DocService } from './core/doc/doc.service';
import { HapticService } from './core/haptic.service';
import { ParticipantRemovalService } from './core/participant-removal.service';
import { SessionEndService } from './core/session-end.service';
import { SessionRejectionService } from './core/session-rejection.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './services/toast.service';

function makeDocMock() {
  let listener: ((event: SessionEvent) => void) | null = null;
  return {
    onSessionEvent: vi.fn((l: (event: SessionEvent) => void) => {
      listener = l;
      return () => {
        listener = null;
      };
    }),
    /** Deliver an event as `DocService` would. */
    push(event: SessionEvent): void {
      listener?.(event);
    },
  };
}

describe('AppComponent — host-change toast', () => {
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
        { provide: ToastService, useValue: { info: toastInfoSpy } },
        // Eagerly-instantiated services that must be injectable but are not exercised here
        { provide: SessionEndService, useValue: {} },
        { provide: SessionRejectionService, useValue: {} },
        { provide: ParticipantRemovalService, useValue: {} },
        { provide: ThemeService, useValue: {} },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  it("a host change gives the warning haptic and toasts the event's message", () => {
    TestBed.createComponent(AppComponent);

    docMock.push({
      kind: 'host-changed',
      previousHostId: 'host-1',
      previousHostName: 'Bob',
      hostId: 'me',
      hostName: 'Alice',
      cause: 'disconnected',
      wasSelf: false,
      isSelf: true,
      message: 'Bob disconnected. You are now the host.',
    });

    expect(hapticSpy).toHaveBeenCalledOnce();
    expect(toastInfoSpy).toHaveBeenCalledExactlyOnceWith('Bob disconnected. You are now the host.');
  });

  it('the other kinds of session event give neither', () => {
    TestBed.createComponent(AppComponent);

    docMock.push({
      kind: 'ended',
      endedAt: 100,
      endedLocally: false,
      hostId: 'host-1',
      hostName: 'Bob',
      message: 'Session ended by Bob',
    });
    docMock.push({
      kind: 'removed',
      leftAt: 10,
      removedBy: 'host-1',
      removedByName: 'Bob',
      message: 'Removed by host',
    });

    expect(hapticSpy).not.toHaveBeenCalled();
    expect(toastInfoSpy).not.toHaveBeenCalled();
  });
});
