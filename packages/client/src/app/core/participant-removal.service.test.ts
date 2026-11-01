/**
 * ParticipantRemovalService unit tests (ADR-0036 §5) — the client's sink for
 * the session events driver's `removed` event.
 *
 * The rule (voluntary leave, the first-sync gate, stale and double-fire
 * guards) is the shared driver's and is tested there. What is tested here is
 * the sink: a fake `onSessionEvent` captures the service's listener and
 * hand-built events are pushed through it, as `DocService` would deliver them.
 */

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEvent } from '@hnch/shared';

vi.mock('@ionic/angular/standalone', () => ({}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { ParticipantRemovalService } from './participant-removal.service';
import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';
import { ToastService } from '../services/toast.service';

const REMOVED: SessionEvent = {
  kind: 'removed',
  leftAt: 1_700_000_000_001,
  removedBy: 'host-1',
  removedByName: 'Hana',
  message: 'Removed by host',
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
    teardown: vi.fn(),
    // What the doc says its UUID is — which any participant can rewrite...
    meta: vi.fn(() => ({ roomUuid: 'uuid-from-the-doc' })),
    // ...and the one the relay issued, which the entry was recorded under.
    relayRoomUuid: vi.fn<() => string | null>(() => 'test-uuid'),
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

describe('ParticipantRemovalService', () => {
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
        ParticipantRemovalService,
        { provide: DocService, useValue: docMock },
        { provide: LastSessionService, useValue: lastSessionMock },
        { provide: ToastService, useValue: toastMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  it('removal: teardown → forget → toast → navigate, in order and exactly once', async () => {
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

    TestBed.inject(ParticipantRemovalService);
    docMock.push(REMOVED);
    await flushAll();

    expect(callOrder).toEqual(['teardown', 'clear', 'toast', 'navigate']);
    expect(lastSessionMock.removeByUuid).toHaveBeenCalledWith('test-uuid');
    expect(toastMock.info).toHaveBeenCalledExactlyOnceWith('Removed by host');
    expect(routerMock.navigate).toHaveBeenCalledExactlyOnceWith(['/home']);
  });

  // The doc is writable by everyone in the session. Whoever rewrote its UUID
  // would otherwise decide which of this device's sessions is forgotten.
  it('removal: forgets the session by the UUID the relay issued, not the one in the doc', async () => {
    TestBed.inject(ParticipantRemovalService);
    docMock.push(REMOVED);
    await flushAll();

    expect(lastSessionMock.removeByUuid).toHaveBeenCalledExactlyOnceWith('test-uuid');
    expect(lastSessionMock.clearAll).not.toHaveBeenCalled();
  });

  it('removal: forgets nothing else when there is no UUID to go by', async () => {
    docMock.relayRoomUuid.mockReturnValue(null);
    TestBed.inject(ParticipantRemovalService);
    docMock.push(REMOVED);
    await flushAll();

    expect(docMock.teardown).toHaveBeenCalledOnce();
    expect(lastSessionMock.clearAll).not.toHaveBeenCalled();
    expect(lastSessionMock.removeByUuid).not.toHaveBeenCalled();
  });

  it('ignores the other kinds of session event', async () => {
    TestBed.inject(ParticipantRemovalService);
    docMock.push({
      kind: 'ended',
      endedAt: 100,
      endedLocally: false,
      hostId: 'host-1',
      hostName: 'Hana',
      message: 'Session ended by Hana',
    });
    docMock.push({
      kind: 'host-changed',
      previousHostId: 'host-1',
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
