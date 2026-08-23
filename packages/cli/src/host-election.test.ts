/**
 * Unit tests for CLI host-election.ts (ADR-0010).
 *
 * Uses a real Y.Doc + real Awareness instance with fake timers.
 * Awareness states are injected directly (no WS transport) to keep
 * tests synchronous and deterministic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { patchSettings, upsertParticipant, leaveSession, DOC_SETTINGS_KEY } from '@hnch/shared';
import { startElection, HOST_ABSENCE_ELECTION_DEBOUNCE_MS } from './host-election.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Overwrite the awareness states map and emit a 'change' event so the
 * startElection listener re-evaluates. This bypasses the y-protocols wire
 * format — fine for unit tests, since we're not testing y-protocols itself.
 */
function setAwarenessStates(
  awareness: Awareness,
  peers: Array<{ clientID: number; participantId: string }>,
): void {
  awareness.states.clear();
  for (const { clientID, participantId } of peers) {
    awareness.states.set(clientID, { participantId });
  }
  awareness.emit('change', [
    { added: peers.map((p) => p.clientID), updated: [], removed: [] },
    'test',
  ]);
}

function removePeerFromAwareness(awareness: Awareness, clientID: number): void {
  awareness.states.delete(clientID);
  awareness.emit('change', [{ added: [], updated: [], removed: [clientID] }, 'test']);
}

function getDocHostId(doc: Y.Doc): string | undefined {
  return doc.getMap(DOC_SETTINGS_KEY).get('hostParticipantId') as string | undefined;
}

/**
 * Seed active participant records in the doc. The eligible peer set is
 * online ∩ active (ADR-0048), so awareness alone is no longer enough —
 * each online peer must also have an active (`!leftAt`) doc entry.
 */
function seedParticipants(doc: Y.Doc, ids: string[]): void {
  for (const id of ids) {
    upsertParticipant(doc, id, { displayName: id, joinedAt: 0 });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('startElection (ADR-0010)', () => {
  let doc: Y.Doc;
  let awareness: Awareness;

  beforeEach(() => {
    vi.useFakeTimers();
    doc = new Y.Doc();
    awareness = new Awareness(doc);
    // Suppress the Awareness 30s cleanup interval noise in fake-timer env
    vi.spyOn(globalThis, 'setInterval').mockImplementation((fn, delay, ...args) =>
      // Let only short timeouts through; skip the 30 000 ms one
      delay === 30_000
        ? (0 as unknown as ReturnType<typeof setInterval>)
        : setInterval(fn, delay, ...args),
    );
    patchSettings(doc, { hostParticipantId: 'host-1' });
    seedParticipants(doc, ['host-1', 'peer-a', 'peer-b']);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('host is online → no election fires after debounce', () => {
    setAwarenessStates(awareness, [
      { clientID: 1, participantId: 'host-1' },
      { clientID: 2, participantId: 'peer-a' },
    ]);

    const handle = startElection(doc, awareness, 'peer-a');
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS + 100);

    expect(getDocHostId(doc)).toBe('host-1');
    handle.stop();
  });

  it('host goes offline → after debounce, lowest-ID peer is elected', () => {
    setAwarenessStates(awareness, [
      { clientID: 1, participantId: 'host-1' },
      { clientID: 2, participantId: 'peer-a' },
      { clientID: 3, participantId: 'peer-b' },
    ]);

    const handle = startElection(doc, awareness, 'peer-a');

    // Host drops out
    removePeerFromAwareness(awareness, 1);

    // Debounce not yet elapsed — no change
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS - 100);
    expect(getDocHostId(doc)).toBe('host-1');

    // Debounce elapses — peer-a wins (lex-lowest: 'peer-a' < 'peer-b')
    vi.advanceTimersByTime(200);
    expect(getDocHostId(doc)).toBe('peer-a');

    handle.stop();
  });

  it('host rejoins before debounce → timer cancelled, no election', () => {
    setAwarenessStates(awareness, [
      { clientID: 1, participantId: 'host-1' },
      { clientID: 2, participantId: 'peer-a' },
    ]);

    const handle = startElection(doc, awareness, 'peer-a');

    removePeerFromAwareness(awareness, 1);
    vi.advanceTimersByTime(3_000);

    // Host comes back
    awareness.states.set(1, { participantId: 'host-1' });
    awareness.emit('change', [{ added: [1], updated: [], removed: [] }, 'test']);

    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);
    expect(getDocHostId(doc)).toBe('host-1');

    handle.stop();
  });

  it('I am NOT the lowest-ID peer → no write when debounce fires', () => {
    setAwarenessStates(awareness, [
      { clientID: 1, participantId: 'host-1' },
      { clientID: 2, participantId: 'peer-a' },
      { clientID: 3, participantId: 'peer-b' },
    ]);

    // peer-b starts election; peer-a is lex-lower so peer-b must not write
    const handle = startElection(doc, awareness, 'peer-b');

    removePeerFromAwareness(awareness, 1);
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);

    expect(getDocHostId(doc)).toBe('host-1');

    handle.stop();
  });

  it('stop() before debounce fires → no election happens', () => {
    setAwarenessStates(awareness, [
      { clientID: 1, participantId: 'host-1' },
      { clientID: 2, participantId: 'peer-a' },
    ]);

    const handle = startElection(doc, awareness, 'peer-a');
    removePeerFromAwareness(awareness, 1);

    // Stop before the timer fires
    handle.stop();
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);

    expect(getDocHostId(doc)).toBe('host-1');
  });

  it('no online peers when debounce fires → guard prevents write', () => {
    setAwarenessStates(awareness, [
      { clientID: 1, participantId: 'host-1' },
      { clientID: 2, participantId: 'peer-a' },
    ]);

    const handle = startElection(doc, awareness, 'peer-a');

    // Both go offline before debounce elapses
    removePeerFromAwareness(awareness, 1);
    removePeerFromAwareness(awareness, 2);

    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);

    expect(getDocHostId(doc)).toBe('host-1');

    handle.stop();
  });

  it('host change in doc while debounce is pending → election aborts', () => {
    setAwarenessStates(awareness, [
      { clientID: 1, participantId: 'host-1' },
      { clientID: 2, participantId: 'peer-a' },
    ]);

    const handle = startElection(doc, awareness, 'peer-a');
    removePeerFromAwareness(awareness, 1);

    // A different client wins and writes to the doc before our debounce
    // (simulated by patching the settings directly)
    patchSettings(doc, { hostParticipantId: 'peer-a' });

    // Now simulate timer firing from peer-a's old debounce
    // tryPromote checks: cachedMissing === hostId after the doc write changed hostId
    // So it should be a no-op (host is now 'peer-a', not the missing 'host-1')
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);

    // hostParticipantId should still be 'peer-a' (the value written above),
    // not corrupted by the debounce firing
    expect(getDocHostId(doc)).toBe('peer-a');

    handle.stop();
  });

  it('kicked-but-lingering peer cannot win election (ADR-0048 parity with client)', () => {
    setAwarenessStates(awareness, [
      { clientID: 1, participantId: 'host-1' },
      { clientID: 2, participantId: 'peer-a' },
      { clientID: 3, participantId: 'peer-b' },
    ]);

    // peer-a is kicked: leftAt set in the doc, but its awareness entry lingers.
    leaveSession(doc, 'peer-a');

    // peer-b runs the election. Old CLI would let lex-lowest 'peer-a' win/block;
    // now 'peer-a' is inactive and excluded → 'peer-b' wins.
    const handle = startElection(doc, awareness, 'peer-b');

    removePeerFromAwareness(awareness, 1);
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);

    expect(getDocHostId(doc)).toBe('peer-b');

    handle.stop();
  });

  it('kicked-but-lingering peer cannot block election when it is lex-lowest online', () => {
    setAwarenessStates(awareness, [
      { clientID: 1, participantId: 'host-1' },
      { clientID: 2, participantId: 'peer-a' },
    ]);

    // peer-a kicked but still in awareness; it is the only other online id.
    leaveSession(doc, 'peer-a');

    // peer-a itself must NOT promote — it's inactive.
    const handle = startElection(doc, awareness, 'peer-a');

    removePeerFromAwareness(awareness, 1);
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);

    expect(getDocHostId(doc)).toBe('host-1');

    handle.stop();
  });

  it('host is kicked (leftAt set, awareness lingering) → election still fires', () => {
    setAwarenessStates(awareness, [
      { clientID: 1, participantId: 'host-1' },
      { clientID: 2, participantId: 'peer-a' },
      { clientID: 3, participantId: 'peer-b' },
    ]);

    const handle = startElection(doc, awareness, 'peer-a');

    // Host is kicked: `leftAt` lands on the participant record while the
    // awareness entry lingers (ADR-0036). This is a participants-map write —
    // no settings or awareness event follows it.
    leaveSession(doc, 'host-1');

    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS + 100);

    // Host is online-but-inactive → ineligible (ADR-0048) → peer-a wins.
    expect(getDocHostId(doc)).toBe('peer-a');

    handle.stop();
  });

  it('stop() removes awareness and doc observers (no further evaluation)', () => {
    setAwarenessStates(awareness, [
      { clientID: 1, participantId: 'host-1' },
      { clientID: 2, participantId: 'peer-a' },
    ]);

    const handle = startElection(doc, awareness, 'peer-a');
    handle.stop();

    // After stop, awareness changes must NOT trigger elections
    removePeerFromAwareness(awareness, 1);
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);

    expect(getDocHostId(doc)).toBe('host-1');
  });
});
