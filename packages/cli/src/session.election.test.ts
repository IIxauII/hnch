/**
 * `wireSession` host-election *wiring* (ADR-0010, ADR-0048).
 *
 * The driver's behaviour — debounce, missing-host state, winner choice —
 * lives in `@hnch/shared` and is tested there with fake deps and fake
 * timers. What can only be verified here is that this adapter connects the
 * driver to the right sources and sink: any doc change, any awareness
 * change, and a promotion that lands in the settings map.
 *
 * That is deliberately not deleted coverage: subscribing the driver to the
 * wrong change source is exactly the defect this module once had.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import {
  joinDoc,
  promoteHost,
  startElection,
  DOC_SETTINGS_KEY,
  type ElectionDeps,
} from '@hnch/shared';

// The adapter under test is inside `wireSession`, which opens a relay socket
// on construction. Stub the transport — this suite is about the doc, not the
// wire (relay-backed session behaviour is covered by session.test.ts).
vi.mock('@hnch/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hnch/shared')>()),
  connectToRelay: vi.fn(() => ({
    awareness: undefined,
    disconnect: vi.fn(),
    updateCredentials: vi.fn(),
  })),
}));

vi.mock('@hnch/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hnch/shared')>();
  return { ...actual, startElection: vi.fn(actual.startElection) };
});

import { wireSession } from './session.js';

const startElectionMock = vi.mocked(startElection);

function wire(doc: Y.Doc, awareness: Awareness) {
  return wireSession({
    doc,
    awareness,
    roomCode: 'ABC123',
    roomUuid: 'room-uuid-1',
    participantId: 'peer-a',
    relayUrl: 'http://localhost:0',
  });
}

describe('CLI host-election wiring', () => {
  let doc: Y.Doc;
  let awareness: Awareness;
  let deps: ElectionDeps;
  let notify: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    doc = new Y.Doc();
    awareness = new Awareness(doc);
    promoteHost(doc, 'host-1');
    joinDoc(doc, { participantId: 'host-1', displayName: 'Host', joinedAt: 0 });

    notify = vi.fn();
    // Capture the deps the adapter hands to the shared driver, and swap the
    // driver's own callback for a spy so we can see what notifies it.
    startElectionMock.mockImplementation((d) => {
      deps = d;
      const unsubscribe = d.subscribe(notify);
      return { stop: unsubscribe };
    });
  });

  it('starts the shared driver with this peer as the caller', () => {
    const session = wire(doc, awareness);

    expect(startElectionMock).toHaveBeenCalledOnce();
    expect(deps.myId()).toBe('peer-a');
    expect(deps.projection()?.settings.hostParticipantId).toBe('host-1');

    session.disconnect();
  });

  it('notifies the driver on a doc change', () => {
    const session = wire(doc, awareness);
    notify.mockClear();

    // A participants-map write and nothing else — no awareness or settings
    // event. This is the kicked-host shape (ADR-0036).
    joinDoc(doc, { participantId: 'peer-b', displayName: 'Peer B', joinedAt: 0 });

    expect(notify).toHaveBeenCalled();
    session.disconnect();
  });

  it('notifies the driver on an awareness change', () => {
    const session = wire(doc, awareness);
    notify.mockClear();

    awareness.states.set(7, { participantId: 'peer-b' });
    awareness.emit('change', [{ added: [7], updated: [], removed: [] }, 'test']);

    expect(notify).toHaveBeenCalled();
    expect(deps.onlineIds()).toContain('peer-b');

    session.disconnect();
  });

  it('promoting writes the winner into the settings map', () => {
    const session = wire(doc, awareness);

    deps.promote('peer-a');

    expect(doc.getMap(DOC_SETTINGS_KEY).get('hostParticipantId')).toBe('peer-a');
    session.disconnect();
  });

  it('disconnect stops the driver — later changes no longer notify it', () => {
    const session = wire(doc, awareness);
    session.disconnect();
    notify.mockClear();

    joinDoc(doc, { participantId: 'peer-b', displayName: 'Peer B', joinedAt: 0 });
    awareness.emit('change', [{ added: [], updated: [], removed: [] }, 'test']);

    expect(notify).not.toHaveBeenCalled();
  });
});
