/**
 * HostElectionService unit tests (ADR-0010).
 *
 * Uses Angular TestBed + vi.useFakeTimers so the real service (including
 * its effect() wiring and 5-second debounce) is exercised without any
 * inline reimplementation of production logic.
 *
 * Pattern follows timer-tick.service.test.ts (TestBed + fake timers) and
 * participant-removal.service.test.ts (signal-based mock deps + flushEffects).
 *
 * @vitest-environment jsdom
 */

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ESM-only packages that cascade in via doc.service.ts imports.
vi.mock('@ionic/angular/standalone', () => ({}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

// Exercises: host-election.service:HostElectionService, HOST_ABSENCE_ELECTION_DEBOUNCE_MS
import { HostElectionService, HOST_ABSENCE_ELECTION_DEBOUNCE_MS } from './host-election.service';
import { DocService } from './doc/doc.service';
import { ParticipantIdService } from './participant-id.service';

// ---------------------------------------------------------------------------
// Signal-based mock factories
// (signals are required so the service's effect() tracks and re-runs on change)
// ---------------------------------------------------------------------------

function makeDocMock() {
  const hasSession = signal(true);
  const settings = signal<{ hostParticipantId: string } | null>({ hostParticipantId: 'host-1' });
  const onlineParticipantIds = signal<ReadonlySet<string>>(
    new Set(['host-1', 'peer-a', 'peer-b']),
  );
  const activeParticipants = signal<readonly { id: string }[]>([
    { id: 'host-1' },
    { id: 'peer-a' },
    { id: 'peer-b' },
  ]);
  const updateSettings = vi.fn<[{ hostParticipantId: string }], void>();

  return {
    hasSession: hasSession.asReadonly(),
    settings: settings.asReadonly(),
    onlineParticipantIds: onlineParticipantIds.asReadonly(),
    activeParticipants: activeParticipants.asReadonly(),
    updateSettings,
    // Writable handles for test scenarios:
    _hasSession: hasSession,
    _settings: settings,
    _onlineParticipantIds: onlineParticipantIds,
    _activeParticipants: activeParticipants,
  };
}

function makeParticipantIdMock(myId: string | null = 'peer-a') {
  const idSig = signal<string | null>(myId);
  return { id: idSig.asReadonly(), _id: idSig };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HostElectionService (ADR-0010)', () => {
  let docMock: ReturnType<typeof makeDocMock>;
  let participantIdMock: ReturnType<typeof makeParticipantIdMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    docMock = makeDocMock();
    participantIdMock = makeParticipantIdMock('peer-a');

    TestBed.configureTestingModule({
      providers: [
        HostElectionService,
        { provide: DocService, useValue: docMock },
        { provide: ParticipantIdService, useValue: participantIdMock },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('host is in the online set → no election fires after the debounce window', () => {
    TestBed.inject(HostElectionService);
    TestBed.flushEffects(); // effect runs: host-1 online → no debounce

    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS + 100);
    expect(docMock.updateSettings).not.toHaveBeenCalled();
  });

  it('host drops from awareness → debounce starts → lowest-ID peer writes promotion', () => {
    TestBed.inject(HostElectionService);
    TestBed.flushEffects();

    // Host goes offline
    docMock._onlineParticipantIds.set(new Set(['peer-a', 'peer-b']));
    TestBed.flushEffects(); // effect re-runs: host offline → setTimeout queued

    expect(docMock.updateSettings).not.toHaveBeenCalled(); // debounce not yet elapsed

    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);

    // peer-a is lexicographically first → it wins
    expect(docMock.updateSettings).toHaveBeenCalledOnce();
    expect(docMock.updateSettings).toHaveBeenCalledWith({ hostParticipantId: 'peer-a' });
  });

  it('host rejoins before debounce fires → timer cancelled, no promotion', () => {
    TestBed.inject(HostElectionService);
    TestBed.flushEffects();

    docMock._onlineParticipantIds.set(new Set(['peer-a', 'peer-b']));
    TestBed.flushEffects(); // debounce starts

    vi.advanceTimersByTime(3_000); // halfway through debounce
    expect(docMock.updateSettings).not.toHaveBeenCalled();

    // Host returns
    docMock._onlineParticipantIds.set(new Set(['host-1', 'peer-a', 'peer-b']));
    TestBed.flushEffects(); // effect re-runs: host online → debounce cancelled

    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS); // past original window
    expect(docMock.updateSettings).not.toHaveBeenCalled();
  });

  it('I am NOT the lowest-ID peer → debounce fires but I do not write', () => {
    participantIdMock._id.set('peer-b'); // peer-b; peer-a is lower
    TestBed.inject(HostElectionService);
    TestBed.flushEffects();

    docMock._onlineParticipantIds.set(new Set(['peer-a', 'peer-b']));
    TestBed.flushEffects();

    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);

    expect(docMock.updateSettings).not.toHaveBeenCalled();
  });

  it('kicked peer in awareness is ineligible — active set excludes them', () => {
    // peer-b was kicked: absent from activeParticipants but still in awareness (stale)
    docMock._activeParticipants.set([{ id: 'host-1' }, { id: 'peer-a' }]);
    TestBed.inject(HostElectionService);
    TestBed.flushEffects();

    // Host offline; peer-b stale in awareness
    docMock._onlineParticipantIds.set(new Set(['peer-a', 'peer-b']));
    TestBed.flushEffects();

    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);

    // Only peer-a is active-online → peer-a wins
    expect(docMock.updateSettings).toHaveBeenCalledWith({ hostParticipantId: 'peer-a' });
  });

  it('HOST_ABSENCE_ELECTION_DEBOUNCE_MS is 5 000 ms per ADR-0010', () => {
    expect(HOST_ABSENCE_ELECTION_DEBOUNCE_MS).toBe(5_000);
  });
});
