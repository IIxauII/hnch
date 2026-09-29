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
 * SessionEndService / SessionRejectionService / ParticipantRemovalService /
 * ThemeService are
 * provided as empty stubs because they are eagerly injected but their
 * own behaviour is tested in dedicated suites.
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
import { ParticipantIdService } from './core/participant-id.service';
import { ParticipantRemovalService } from './core/participant-removal.service';
import { SessionEndService } from './core/session-end.service';
import { SessionRejectionService } from './core/session-rejection.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './services/toast.service';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeDocMock() {
  const settingsSig = signal<SessionSettings | null>(null);
  const participantsSig = signal<readonly ParticipantSnapshot[]>([]);
  const onlineSig = signal<ReadonlySet<string>>(new Set());
  const relaySyncedSig = signal(true);
  return {
    settings: settingsSig.asReadonly(),
    participants: participantsSig.asReadonly(),
    onlineParticipantIds: onlineSig.asReadonly(),
    relaySynced: relaySyncedSig.asReadonly(),
    // writable handles for test scenarios
    _settings: settingsSig,
    _participants: participantsSig,
    _online: onlineSig,
    _relaySynced: relaySyncedSig,
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

  describe('says why', () => {
    const defaultScale = { id: 'fibonacci', cards: ['1'] };
    const alice = { id: 'host-1', displayName: 'Alice', joinedAt: 0, role: 'voter' } as const;
    const bob = { id: 'host-2', displayName: 'Bob', joinedAt: 0, role: 'voter' } as const;

    /** Alice is the host; then someone else is. What the toast says about it. */
    async function handover(
      participants: readonly ParticipantSnapshot[],
      online: string[],
      opts: { to?: string; inSync?: boolean } = {},
    ): Promise<string> {
      TestBed.createComponent(AppComponent);
      docMock._settings.set({ hostParticipantId: alice.id, defaultScale });
      docMock._participants.set(participants);
      docMock._online.set(new Set(online));
      docMock._relaySynced.set(opts.inSync ?? true);
      TestBed.flushEffects();
      await Promise.resolve();

      docMock._settings.set({ hostParticipantId: opts.to ?? bob.id, defaultScale });
      TestBed.flushEffects();
      await Promise.resolve();

      expect(toastInfoSpy).toHaveBeenCalledOnce();
      return String(toastInfoSpy.mock.calls[0]![0]);
    }

    it('a host whose connection is gone has disconnected', async () => {
      expect(await handover([alice, bob], [bob.id])).toBe(
        'Alice disconnected. Bob is now the host.',
      );
    });

    // "Make host" — or a peer that lost sight of the room and elected
    // itself. Either way nobody went anywhere, and which of the two it was
    // is not this client's to say.
    it('a host who is still here is no reason', async () => {
      expect(await handover([alice, bob], [alice.id, bob.id])).toBe('Bob is now the host');
    });

    it('a host who left the session has left', async () => {
      const gone = { ...alice, leftAt: 1 };
      expect(await handover([gone, bob], [bob.id])).toBe('Alice left. Bob is now the host.');
    });

    // To a client that is not in sync, nobody is online. It is the one that
    // is disconnected.
    it('nobody has disconnected as far as a client can tell that is not in sync', async () => {
      expect(await handover([alice, bob], [], { inSync: false })).toBe('Bob is now the host');
    });

    it('but who has left is in the doc, in sync or not', async () => {
      const gone = { ...alice, leftAt: 1 };
      expect(await handover([gone, bob], [], { inSync: false })).toBe(
        'Alice left. Bob is now the host.',
      );
    });

    it('the host that was is told who the host is now, and nothing about themselves', async () => {
      const me = { id: 'me', displayName: 'Me', joinedAt: 0, role: 'voter' } as const;
      TestBed.createComponent(AppComponent);
      docMock._settings.set({ hostParticipantId: me.id, defaultScale });
      docMock._participants.set([me, bob]);
      docMock._online.set(new Set([bob.id]));
      TestBed.flushEffects();
      await Promise.resolve();

      docMock._settings.set({ hostParticipantId: bob.id, defaultScale });
      TestBed.flushEffects();
      await Promise.resolve();

      expect(String(toastInfoSpy.mock.calls[0]![0])).toBe('Bob is now the host');
    });
  });
});
