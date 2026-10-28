/**
 * `wireSession` session-events *wiring* — what the CLI adapter feeds the
 * shared session events driver, and what reaches `onSessionEvent`.
 *
 * The rules themselves (once per end, the host seed, the causes, the
 * removal guards, the wording) are `@hnch/shared`'s and are tested in
 * `session-events.test.ts` against plain projections. What can only be
 * verified here is the adapter: which reading stands for "ended locally",
 * first sync and presence trust, and that `disconnect()` stops delivery.
 *
 * `connectToRelay` is stubbed and its options captured, as the rejoin suite
 * does, so the sync edges are driven by hand and remote writes arrive as
 * applied Yjs updates — no in-process relay, whose BroadcastChannel would
 * couple the peers and hide join-time ordering.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import {
  AWARENESS_PARTICIPANT_ID_FIELD,
  connectToRelay,
  endSession,
  FIBONACCI_SCALE,
  initDoc,
  joinDoc,
  kick,
  promoteHost,
  type ConnectToRelayOptions,
  type RelayConnection,
  type SessionEvent,
} from '@hnch/shared';

vi.mock('@hnch/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hnch/shared')>()),
  connectToRelay: vi.fn(),
}));

import { wireSession, type SessionHandle } from './session.js';

const connectToRelayMock = vi.mocked(connectToRelay);

const SELF = 'p-self';

let opts: ConnectToRelayOptions;
let session: SessionHandle | null = null;

function wire(doc: Y.Doc, overrides: { clearLeftStatusOnSync?: boolean } = {}): SessionHandle {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField(AWARENESS_PARTICIPANT_ID_FIELD, SELF);
  session = wireSession({
    doc,
    awareness,
    roomCode: 'ABC123',
    roomUuid: 'room-uuid-1',
    participantId: SELF,
    relayUrl: 'http://relay.test',
    ...overrides,
  });
  return session;
}

/** Wire a session and record every event it delivers. */
function wireAndListen(doc: Y.Doc, overrides: { clearLeftStatusOnSync?: boolean } = {}) {
  const s = wire(doc, overrides);
  const events: SessionEvent[] = [];
  s.onSessionEvent((event) => events.push(event));
  return { session: s, events };
}

/** A doc created by `participantId` — the creator and host. */
function createdBy(participantId: string, displayName: string): Y.Doc {
  const doc = new Y.Doc();
  initDoc(doc, {
    roomUuid: 'room-uuid-1',
    createdAt: 1,
    participantId,
    displayName,
    defaultScale: FIBONACCI_SCALE,
  });
  return doc;
}

/** A doc this peer has joined but not yet synced: only its own record. */
function joinedBySelf(): Y.Doc {
  const doc = new Y.Doc();
  joinDoc(doc, { participantId: SELF, displayName: 'Sam', joinedAt: 2 });
  return doc;
}

/** Apply what `from` has and `to` lacks — a relay message, in effect. */
function sync(from: Y.Doc, to: Y.Doc): void {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)));
}

/** Let the driver's deferred delivery run. */
const settle = (): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, 0);
  });

describe('wireSession — session events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectToRelayMock.mockImplementation((o) => {
      opts = o;
      return {
        awareness: o.awareness,
        updateCredentials: vi.fn(),
        disconnect: vi.fn(),
      } as unknown as RelayConnection;
    });
  });

  afterEach(() => {
    // Also cancels the election driver's debounce armed by an absent host.
    session?.disconnect();
    session = null;
  });

  it("the host's own end reads 'Session ended.'", async () => {
    const { session: s, events } = wireAndListen(createdBy(SELF, 'Sam'));

    expect(s.commands.endSession().applied).toBe(true);
    await settle();

    expect(events).toEqual([
      expect.objectContaining({ kind: 'ended', endedLocally: true, message: 'Session ended.' }),
    ]);
  });

  it('a refused end leaves the flag down: a later remote end names the host', async () => {
    const doc = joinedBySelf();
    const { session: s, events } = wireAndListen(doc);
    // No settings have synced, so there is no host to authorise against.
    expect(s.commands.endSession().applied).toBe(false);

    const hostDoc = createdBy('p-host', 'Hana');
    sync(hostDoc, doc);
    endSession(hostDoc, 'p-host');
    sync(hostDoc, doc);
    await settle();

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'ended',
        endedLocally: false,
        message: 'Session ended by Hana',
      }),
    ]);
  });

  it('a joiner whose host arrives with the snapshot is told of no host change (UX-078)', async () => {
    const doc = joinedBySelf();
    const { events } = wireAndListen(doc);

    sync(createdBy('p-host', 'Hana'), doc);
    await settle();

    expect(events).toEqual([]);
  });

  it('a removal fires only once the first sync has landed (ADR-0036 §6)', async () => {
    const doc = joinedBySelf();
    const { events } = wireAndListen(doc, { clearLeftStatusOnSync: true });
    const hostDoc = createdBy('p-host', 'Hana');
    sync(hostDoc, doc);
    sync(doc, hostDoc);

    // Before the sync: a removal carried in, as the snapshot would carry one.
    kick(hostDoc, 'p-host', SELF);
    sync(hostDoc, doc);
    await settle();
    expect(events).toEqual([]);

    // The sync lands: the rejoin clears the stale removal, and a fresh one is live.
    opts.onSynced?.();
    opts.onSyncedChange?.(true);
    sync(doc, hostDoc);
    kick(hostDoc, 'p-host', SELF);
    sync(hostDoc, doc);
    await settle();

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'removed',
        removedBy: 'p-host',
        removedByName: 'Hana',
        message: 'Removed by host',
      }),
    ]);
  });

  it('disconnect() stops delivery, and so does the unsubscribe onSessionEvent returns', async () => {
    const doc = joinedBySelf();
    const s = wire(doc);
    const kept: SessionEvent[] = [];
    const dropped: SessionEvent[] = [];
    s.onSessionEvent((event) => kept.push(event));
    const off = s.onSessionEvent((event) => dropped.push(event));
    const hostDoc = createdBy('p-host', 'Hana');
    sync(hostDoc, doc);

    off();
    endSession(hostDoc, 'p-host');
    sync(hostDoc, doc);
    await settle();
    expect(kept).toHaveLength(1);
    expect(dropped).toEqual([]);

    // A later end is detected, then the session disconnects before the
    // deferred delivery runs: only the driver's stop() can drop it, since
    // the detection already happened before disconnect() unobserves the doc.
    endSession(hostDoc, 'p-host', () => Date.now() + 1_000);
    sync(hostDoc, doc);
    s.disconnect();
    await settle();
    expect(kept).toHaveLength(1);
  });

  describe('presence trust is the live reading, not the sticky first sync', () => {
    /**
     * Hana hosts and is never in this peer's awareness — the stub transport
     * carries none — so she counts as offline. She stays active (no
     * `leftAt`), so `left` cannot mask the cause. Jo then becomes host.
     */
    async function handOverWhileHanaIsAway(edges: boolean[]): Promise<SessionEvent[]> {
      const doc = joinedBySelf();
      const { events } = wireAndListen(doc);
      const hostDoc = createdBy('p-host', 'Hana');
      sync(hostDoc, doc);

      for (const synced of edges) opts.onSyncedChange?.(synced);

      joinDoc(hostDoc, { participantId: 'p-jo', displayName: 'Jo', joinedAt: 3 });
      promoteHost(hostDoc, 'p-jo');
      sync(hostDoc, doc);
      await settle();
      return events;
    }

    it('while in sync: "Hana disconnected. Jo is now the host."', async () => {
      const events = await handOverWhileHanaIsAway([true]);

      expect(events).toEqual([
        expect.objectContaining({
          kind: 'host-changed',
          cause: 'disconnected',
          message: 'Hana disconnected. Jo is now the host.',
        }),
      ]);
    });

    it('after the sync is lost again: no cause — "Jo is now the host"', async () => {
      const events = await handOverWhileHanaIsAway([true, false]);

      expect(events).toEqual([
        expect.objectContaining({
          kind: 'host-changed',
          cause: null,
          message: 'Jo is now the host',
        }),
      ]);
    });
  });
});
