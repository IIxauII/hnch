/**
 * DocService host-election *wiring* (ADR-0010, ADR-0048).
 *
 * The driver's behaviour lives in `@hnch/shared` and is tested there with
 * fake deps and fake timers. What can only be verified here is that this
 * adapter connects the driver to the right sources and sink: the projection
 * rebuild, the awareness handler, `updateSettings`, and a handle whose life
 * is scoped to the session rather than to the app.
 *
 * Uses the real service (prior art: doc.service.terminal.test.ts) — the
 * hand-rolled harness in doc.service.test.ts cannot exercise the service's
 * own wiring. `@ionic/angular/standalone` is mocked so the ESM-only
 * `@ionic/core` chain never loads under vitest.
 */

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIBONACCI_SCALE, startElection, type ElectionDeps } from '@hnch/shared';
import type { Awareness } from 'y-protocols/awareness';

vi.mock('@ionic/angular/standalone', () => ({
  ToastController: class {
    create = vi.fn().mockResolvedValue({ present: vi.fn() });
  },
}));

vi.mock('@hnch/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hnch/shared')>();
  return { ...actual, startElection: vi.fn(actual.startElection) };
});

import { DocService } from './doc.service';
import { AppPreferenceService } from '../app-preference.service';
import { ParticipantIdService } from '../participant-id.service';
import { ToastService } from '../../services/toast.service';

const startElectionMock = vi.mocked(startElection);

const SESSION = {
  participantId: 'p-host',
  displayName: 'Host',
  defaultScale: FIBONACCI_SCALE,
  roomUuid: 'room-uuid-1',
  roomCode: 'ABC123',
  now: () => 1_700_000_000_000,
};

describe('DocService — host-election wiring', () => {
  let svc: DocService;
  let deps: ElectionDeps;
  let notify: ReturnType<typeof vi.fn>;
  let stop: ReturnType<typeof vi.fn>;
  let onlineIdsAtStart: ReadonlySet<string>;

  beforeEach(() => {
    vi.clearAllMocks();
    notify = vi.fn();
    stop = vi.fn();

    // Capture the deps the adapter hands to the shared driver, and swap the
    // driver's own callback for a spy so we can see what notifies it.
    onlineIdsAtStart = new Set();
    startElectionMock.mockImplementation((d) => {
      deps = d;
      // Snapshot what the driver would see on its initial, synchronous
      // evaluation — the real driver evaluates before startElection returns.
      onlineIdsAtStart = new Set(d.onlineIds());
      d.subscribe(notify);
      return { stop };
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DocService,
        { provide: AppPreferenceService, useValue: { relayWsUrl: () => null } },
        { provide: ParticipantIdService, useValue: { id: signal<string | null>('p-host') } },
        { provide: ToastService, useValue: {} },
      ],
    });
    svc = TestBed.inject(DocService);
  });

  afterEach(() => {
    svc.endSession();
  });

  it('starts a session-scoped driver on attach, with the live projection and own id', () => {
    expect(startElectionMock).not.toHaveBeenCalled(); // idle app arms nothing

    svc.createSession(SESSION);

    expect(startElectionMock).toHaveBeenCalledOnce();
    expect(deps.myId()).toBe('p-host');
    expect(deps.projection()?.settings.hostParticipantId).toBe('p-host');
  });

  it('sees the local peer as online on its very first evaluation', () => {
    // Awareness is seeded before attach, so the driver's synchronous initial
    // evaluation cannot mistake a present host for an absent one and arm a
    // debounce against it.
    svc.createSession(SESSION);

    expect(onlineIdsAtStart).toContain('p-host');
  });

  it('notifies the driver on a projection rebuild', () => {
    svc.createSession(SESSION);
    notify.mockClear();

    // A participants-map write and nothing else — no awareness event. This is
    // the kicked-host shape (ADR-0036).
    svc.upsertParticipant('peer-b', { displayName: 'Peer B', joinedAt: 0 });

    expect(notify).toHaveBeenCalled();
  });

  it('notifies the driver on an awareness change', () => {
    svc.createSession(SESSION);
    notify.mockClear();

    const awareness = (svc as unknown as { awareness: Awareness }).awareness;
    awareness.states.set(7, { participantId: 'peer-b' });
    awareness.emit('change', [{ added: [7], updated: [], removed: [] }, 'test']);

    expect(notify).toHaveBeenCalled();
    expect(deps.onlineIds()).toContain('peer-b');
  });

  it('promoting reaches updateSettings', () => {
    svc.createSession(SESSION);

    deps.promote('peer-b');

    expect(svc.settings()?.hostParticipantId).toBe('peer-b');
  });

  it('ends the session → the handle is stopped', () => {
    svc.createSession(SESSION);
    expect(stop).not.toHaveBeenCalled();

    svc.endSession();

    expect(stop).toHaveBeenCalledOnce();
  });
});
