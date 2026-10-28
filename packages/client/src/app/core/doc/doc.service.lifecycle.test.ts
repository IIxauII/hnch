/**
 * DocService session-lifecycle acts that are not forwards (#516).
 *
 * `joinSession` and `endSessionForEveryone` are the two members the command
 * binding deliberately left on the service: the first opens a session (there
 * is nothing bound yet to open it with), the second wraps `commands.endSession`
 * with the local flag that keeps the leaver's own disconnect from reading as a
 * remote kick. Both are exercised here against the real service rather than the
 * hand-rolled harness in `doc.service.test.ts`.
 *
 * `@ionic/angular/standalone` is mocked so the ESM-only `@ionic/core` chain
 * never loads under vitest.
 */

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIBONACCI_SCALE, type SessionEvent } from '@hnch/shared';

vi.mock('@ionic/angular/standalone', () => ({
  ToastController: class {
    create = vi.fn().mockResolvedValue({ present: vi.fn() });
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn().mockImplementation(() => ({
    whenSynced: Promise.resolve(),
    destroy: vi.fn(),
  })),
}));

import { DocService } from './doc.service';
import { AppPreferenceService } from '../app-preference.service';
import { ParticipantIdService } from '../participant-id.service';
import { ToastService } from '../../services/toast.service';

const HOST_SESSION = {
  participantId: 'p-host',
  displayName: 'Host',
  defaultScale: FIBONACCI_SCALE,
  roomUuid: 'room-uuid-1',
  roomCode: 'ABC123',
};

function mount(myId: string): DocService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      DocService,
      { provide: AppPreferenceService, useValue: { resolvedRelayHttpUrl: () => 'http://x.test' } },
      { provide: ParticipantIdService, useValue: { id: signal<string | null>(myId) } },
      { provide: ToastService, useValue: { error: vi.fn() } },
    ],
  });
  return TestBed.inject(DocService);
}

describe('DocService — joinSession', () => {
  let svc: DocService;

  beforeEach(() => {
    svc = mount('p-joiner');
  });

  it('writes the joiner into the roster and binds the command set to them', () => {
    svc.joinSession({ participantId: 'p-joiner', displayName: 'Joiner', roomCode: 'ABC123' });

    expect(svc.hasSession()).toBe(true);
    expect(svc.roomCode()).toBe('ABC123');
    expect(svc.participants().map((p) => p.id)).toEqual(['p-joiner']);

    // The bound set acts as the joiner without being told who they are.
    expect(svc.commands.rename('Renamed').applied).toBe(true);
    expect(svc.participants()[0]?.displayName).toBe('Renamed');
  });

  it('carries the avatar colour through when one is set (ADR-0043)', () => {
    svc.joinSession({ participantId: 'p-joiner', displayName: 'Joiner', avatarColor: 'red' });

    expect(svc.participants()[0]?.avatarColor).toBe('red');
    // No roomCode passed — the signal stays null rather than inventing one.
    expect(svc.roomCode()).toBeNull();
  });

  it('refuses a second session while one is still attached', () => {
    svc.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });

    expect(() => svc.joinSession({ participantId: 'p-2', displayName: 'Two' })).toThrow();
  });

  it('rebinds the command set after teardown and a second join', () => {
    svc.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });
    svc.teardown();

    // Unbound between sessions — the adapter refuses rather than writing into
    // a destroyed doc.
    expect(svc.commands.rename('Nope')).toEqual({ applied: false, reason: 'not-found' });

    svc.joinSession({ participantId: 'p-second', displayName: 'Second' });
    expect(svc.commands.rename('Renamed').applied).toBe(true);
    expect(svc.participants()[0]?.displayName).toBe('Renamed');
  });
});

describe('DocService — endSessionForEveryone', () => {
  it('sets the local flag once the host-gated command applies', () => {
    const svc = mount('p-host');
    svc.createSession(HOST_SESSION);

    expect(svc.endingSessionLocally()).toBe(false);
    expect(svc.endSessionForEveryone().applied).toBe(true);
    expect(svc.endingSessionLocally()).toBe(true);
  });

  it('leaves the flag false when the host gate refuses', () => {
    const svc = mount('p-joiner');
    svc.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });

    // No settings synced yet, so there is no host record to authorise against.
    expect(svc.endSessionForEveryone().applied).toBe(false);
    expect(svc.endingSessionLocally()).toBe(false);
  });
});

describe('DocService — session events', () => {
  /** Let the driver's deferred delivery run. */
  const settle = (): Promise<void> =>
    new Promise((r) => {
      setTimeout(r, 0);
    });

  it("delivers the host's own end as 'Session ended.' — the flag is set after the write, read at delivery", async () => {
    const svc = mount('p-host');
    svc.createSession(HOST_SESSION);
    const events: SessionEvent[] = [];
    svc.onSessionEvent((event) => events.push(event));

    svc.endSessionForEveryone();
    expect(events).toEqual([]);
    await settle();

    expect(events).toEqual([
      expect.objectContaining({ kind: 'ended', endedLocally: true, message: 'Session ended.' }),
    ]);
  });

  it('delivers nothing when the session is torn down before the flush', async () => {
    const svc = mount('p-host');
    svc.createSession(HOST_SESSION);
    const events: SessionEvent[] = [];
    svc.onSessionEvent((event) => events.push(event));

    svc.endSessionForEveryone();
    svc.teardown();
    await settle();

    expect(events).toEqual([]);
  });

  it('stops delivering to a listener once it unsubscribes', async () => {
    const svc = mount('p-host');
    svc.createSession(HOST_SESSION);
    const events: SessionEvent[] = [];
    const off = svc.onSessionEvent((event) => events.push(event));

    off();
    svc.endSessionForEveryone();
    await settle();

    expect(events).toEqual([]);
  });
});
