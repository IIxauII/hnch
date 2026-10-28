/**
 * ParticipantRemovalService unit tests (ADR-0036 §5) — the client's sink for
 * the session events driver's `removed` event.
 *
 * The rule (voluntary leave, the first-sync gate, stale and double-fire
 * guards) is the shared driver's and is tested there; the way out (teardown,
 * forget, toast, Home) is `SessionExitService`'s and is tested there. What is
 * tested here is the sink: a fake `onSessionEvent` captures the service's
 * listener, hand-built events are pushed through it as `DocService` would
 * deliver them, and the sink asks for the `removed` exit.
 */

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEvent } from '@hnch/shared';

vi.mock('@ionic/angular/standalone', () => ({ NavController: class NavController {} }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { ParticipantRemovalService } from './participant-removal.service';
import { DocService } from './doc/doc.service';
import { SessionExitService } from './session-exit.service';

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
    /** Deliver an event as `DocService` would. */
    push(event: SessionEvent): void {
      listener?.(event);
    },
  };
}

describe('ParticipantRemovalService', () => {
  let docMock: ReturnType<typeof makeDocMock>;
  let exitMock: { exit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    docMock = makeDocMock();
    exitMock = { exit: vi.fn(async () => {}) };

    TestBed.configureTestingModule({
      providers: [
        ParticipantRemovalService,
        { provide: DocService, useValue: docMock },
        { provide: SessionExitService, useValue: exitMock },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("leaves the session as removed, with the event's message", () => {
    TestBed.inject(ParticipantRemovalService);
    docMock.push(REMOVED);

    expect(exitMock.exit).toHaveBeenCalledExactlyOnceWith({
      kind: 'removed',
      message: 'Removed by host',
    });
  });

  it('ignores the other kinds of session event', () => {
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

    expect(exitMock.exit).not.toHaveBeenCalled();
  });
});
