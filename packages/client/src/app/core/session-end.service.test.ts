/**
 * SessionEndService unit tests — the client's sink for the session events
 * driver's `ended` event.
 *
 * The rule (once per `sessionEndedAt`, local vs remote, the name chain) is
 * the shared driver's and is tested there. What is tested here is the sink:
 * a fake `onSessionEvent` captures the service's listener and hand-built
 * events are pushed through it, as `DocService` would deliver them.
 */

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEvent } from '@hnch/shared';

vi.mock('@ionic/angular/standalone', () => ({}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { SessionEndService } from './session-end.service';
import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';
import { ToastService } from '../services/toast.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENDED: SessionEvent = {
  kind: 'ended',
  endedAt: 100,
  endedLocally: false,
  hostId: 'p-host',
  hostName: 'Hana',
  message: 'Session ended by Hana',
};

function makeDocMock() {
  let listener: ((event: SessionEvent) => void) | null = null;
  return {
    onSessionEvent: vi.fn((l: (event: SessionEvent) => void) => {
      listener = l;
      return () => {
        listener = null;
      };
    }),
    // The UUID the relay issued. `meta().roomUuid` is the doc's word for it.
    relayRoomUuid: vi.fn<() => string | null>(() => 'relay-uuid'),
    teardown: vi.fn(),
    /** Deliver an event as `DocService` would. */
    push(event: SessionEvent): void {
      listener?.(event);
    },
  };
}

/** Drain the microtask queue enough for the async sink chain. */
async function flushAll(): Promise<void> {
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

  it("happy path: teardown → forget the session → toast the event's message → navigate, in order", async () => {
    const callOrder: string[] = [];
    docMock.teardown.mockImplementation(() => {
      callOrder.push('teardown');
    });
    lastSessionMock.removeByUuid.mockImplementation(async () => {
      callOrder.push('clear');
    });
    toastMock.info.mockImplementation(async () => {
      callOrder.push('toast');
    });
    routerMock.navigate.mockImplementation(async () => {
      callOrder.push('navigate');
      return true;
    });

    TestBed.inject(SessionEndService);
    docMock.push(ENDED);
    await flushAll();

    expect(callOrder).toEqual(['teardown', 'clear', 'toast', 'navigate']);
    expect(toastMock.info).toHaveBeenCalledExactlyOnceWith('Session ended by Hana');
    expect(routerMock.navigate).toHaveBeenCalledWith(['/home']);
  });

  it('failure path: the cache cannot be written → warn logged, toast + navigate still called', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const clearError = new Error('Storage failed');
    const callOrder: string[] = [];

    docMock.teardown.mockImplementation(() => {
      callOrder.push('teardown');
    });
    lastSessionMock.removeByUuid.mockImplementation(async () => {
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
    docMock.push(ENDED);
    await flushAll();

    expect(warnSpy).toHaveBeenCalledWith('Failed to clear lastSession cache:', clearError);
    expect(callOrder).toContain('toast');
    expect(callOrder).toContain('navigate');
    expect(callOrder.indexOf('toast')).toBeGreaterThan(callOrder.indexOf('clear-attempt'));

    warnSpy.mockRestore();
  });

  // The doc is writable by everyone in the session, its UUID included.
  it('forgets the session by the UUID the relay issued, not the one in the doc', async () => {
    TestBed.inject(SessionEndService);
    docMock.push(ENDED);
    await flushAll();

    expect(lastSessionMock.removeByUuid).toHaveBeenCalledExactlyOnceWith('relay-uuid');
    expect(lastSessionMock.clearAll).not.toHaveBeenCalled();
  });

  it('forgets nothing else when there is no UUID to go by', async () => {
    docMock.relayRoomUuid.mockReturnValue(null);
    TestBed.inject(SessionEndService);
    docMock.push(ENDED);
    await flushAll();

    expect(docMock.teardown).toHaveBeenCalledOnce();
    expect(lastSessionMock.removeByUuid).not.toHaveBeenCalled();
    expect(lastSessionMock.clearAll).not.toHaveBeenCalled();
  });

  it('ignores the other kinds of session event', async () => {
    TestBed.inject(SessionEndService);
    docMock.push({
      kind: 'removed',
      leftAt: 10,
      removedBy: 'p-host',
      removedByName: 'Hana',
      message: 'Removed by host',
    });
    docMock.push({
      kind: 'host-changed',
      previousHostId: 'p-host',
      previousHostName: 'Hana',
      hostId: 'p-jo',
      hostName: 'Jo',
      cause: null,
      wasSelf: false,
      isSelf: false,
      message: 'Jo is now the host',
    });
    await flushAll();

    expect(docMock.teardown).not.toHaveBeenCalled();
    expect(toastMock.info).not.toHaveBeenCalled();
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });
});
