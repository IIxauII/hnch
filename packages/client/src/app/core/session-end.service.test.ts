/**
 * SessionEndService unit tests — the client's sink for the session events
 * driver's `ended` event.
 *
 * The rule (once per `sessionEndedAt`, local vs remote, the name chain) is
 * the shared driver's and is tested there; the way out (teardown, forget,
 * toast, Home) is `SessionExitService`'s and is tested there. What is tested
 * here is the sink: a fake `onSessionEvent` captures the service's listener,
 * hand-built events are pushed through it as `DocService` would deliver
 * them, and the sink asks for the `ended` exit.
 */

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEvent } from '@hnch/shared';

vi.mock('@ionic/angular/standalone', () => ({ NavController: class NavController {} }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { SessionEndService } from './session-end.service';
import { DocService } from './doc/doc.service';
import { SessionExitService } from './session-exit.service';

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
    /** Deliver an event as `DocService` would. */
    push(event: SessionEvent): void {
      listener?.(event);
    },
  };
}

describe('SessionEndService', () => {
  let docMock: ReturnType<typeof makeDocMock>;
  let exitMock: { exit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    docMock = makeDocMock();
    exitMock = { exit: vi.fn(async () => {}) };

    TestBed.configureTestingModule({
      providers: [
        SessionEndService,
        { provide: DocService, useValue: docMock },
        { provide: SessionExitService, useValue: exitMock },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("leaves the session as ended, with the event's message", () => {
    TestBed.inject(SessionEndService);
    docMock.push(ENDED);

    expect(exitMock.exit).toHaveBeenCalledExactlyOnceWith({
      kind: 'ended',
      message: 'Session ended by Hana',
    });
  });

  it('ignores the other kinds of session event', () => {
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

    expect(exitMock.exit).not.toHaveBeenCalled();
  });
});
