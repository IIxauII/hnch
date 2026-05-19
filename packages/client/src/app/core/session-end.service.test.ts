/**
 * SessionEndService unit tests.
 *
 * Uses Angular TestBed so the real service instance (including its
 * effect() wiring) is exercised. Driving the effect by mutating the
 * DocService signal mock proves the production sequencing — not a
 * hand-rolled copy of it.
 */

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', () => ({}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { SessionEndService } from './session-end.service';
import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';
import { ToastService } from '../services/toast.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MetaLike = { sessionEndedAt?: number | null; createdBy?: string; roomUuid?: string } | null;

function makeDocMock() {
  const metaSignal = signal<MetaLike>(null);

  return {
    meta: metaSignal.asReadonly(),
    _metaSignal: metaSignal,
    hasSession: vi.fn(() => true),
    endingSessionLocally: vi.fn(() => false),
    endSession: vi.fn(),
    participants: vi.fn(() => []),
    settings: vi.fn(() => null),
  };
}

/** Flush Angular effects + drain the microtask queue enough for async handlers. */
async function flushAll(): Promise<void> {
  TestBed.flushEffects();
  // drain microtask queue for async handleSessionEnd chain
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionEndService', () => {
  let docMock: ReturnType<typeof makeDocMock>;
  let lastSessionMock: {
    clear: ReturnType<typeof vi.fn>;
    removeByUuid: ReturnType<typeof vi.fn>;
    clearAll: ReturnType<typeof vi.fn>;
  };
  let toastMock: { info: ReturnType<typeof vi.fn> };
  let routerMock: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    docMock = makeDocMock();
    lastSessionMock = {
      clear: vi.fn(async () => {}),
      removeByUuid: vi.fn(async () => {}),
      clearAll: vi.fn(async () => {}),
    };
    toastMock = { info: vi.fn(async () => {}) };
    routerMock = { navigate: vi.fn(async () => true) };

    TestBed.configureTestingModule({
      providers: [
        SessionEndService,
        { provide: DocService, useValue: docMock },
        { provide: LastSessionService, useValue: lastSessionMock },
        { provide: ToastService, useValue: toastMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('happy path: endSession → clearAll → toast → navigate in order', async () => {
    const callOrder: string[] = [];
    docMock.endSession.mockImplementation(() => {
      callOrder.push('endSession');
    });
    lastSessionMock.clearAll.mockImplementation(async () => {
      callOrder.push('clear');
    });
    toastMock.info.mockImplementation(async () => {
      callOrder.push('toast');
    });
    routerMock.navigate.mockImplementation(async () => {
      callOrder.push('navigate');
      return true;
    });

    // Instantiate the real service — its effect() registers but hasn't fired yet.
    TestBed.inject(SessionEndService);

    // Drive a remote session-end: write sessionEndedAt into meta signal.
    // No roomUuid → service calls clearAll().
    docMock._metaSignal.set({ sessionEndedAt: Date.now(), createdBy: 'host-1' });

    await flushAll();

    expect(callOrder).toEqual(['endSession', 'clear', 'toast', 'navigate']);
  });

  it('failure path: clearAll() rejects → warn logged, toast + navigate still called', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const clearError = new Error('Storage failed');
    const callOrder: string[] = [];

    docMock.endSession.mockImplementation(() => {
      callOrder.push('endSession');
    });
    lastSessionMock.clearAll.mockImplementation(async () => {
      callOrder.push('clear-attempt');
      throw clearError;
    });
    toastMock.info.mockImplementation(async () => {
      callOrder.push('toast');
    });
    routerMock.navigate.mockImplementation(async () => {
      callOrder.push('navigate');
      return true;
    });

    TestBed.inject(SessionEndService);

    docMock._metaSignal.set({ sessionEndedAt: Date.now(), createdBy: 'host-1' });

    await flushAll();

    expect(warnSpy).toHaveBeenCalledWith('Failed to clear lastSession cache:', clearError);
    expect(callOrder).toContain('toast');
    expect(callOrder).toContain('navigate');
    expect(callOrder.indexOf('toast')).toBeGreaterThan(callOrder.indexOf('clear-attempt'));

    warnSpy.mockRestore();
  });

  it('calls removeByUuid when meta has roomUuid', async () => {
    TestBed.inject(SessionEndService);

    // Set roomUuid on meta before sessionEndedAt fires
    docMock._metaSignal.set({
      sessionEndedAt: Date.now(),
      createdBy: 'host-1',
      roomUuid: 'room-uuid-42',
    });

    await flushAll();

    expect(lastSessionMock.removeByUuid).toHaveBeenCalledWith('room-uuid-42');
    expect(lastSessionMock.clearAll).not.toHaveBeenCalled();
  });

  it('no-op when no active session: clear/toast/navigate never called', async () => {
    docMock.hasSession.mockReturnValue(false);

    TestBed.inject(SessionEndService);

    docMock._metaSignal.set({ sessionEndedAt: Date.now(), createdBy: 'host-1' });

    await flushAll();

    expect(lastSessionMock.clearAll).not.toHaveBeenCalled();
    expect(lastSessionMock.removeByUuid).not.toHaveBeenCalled();
    expect(toastMock.info).not.toHaveBeenCalled();
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });
});
