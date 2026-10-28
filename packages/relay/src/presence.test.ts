/**
 * The relay's presence store against y-protocols' own Awareness, which is what
 * every client runs: updates a client encodes must apply here, and what the
 * store encodes must apply in a client.
 */

import * as encoding from 'lib0/encoding';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import {
  AwarenessTooLargeError,
  MAX_AWARENESS_BYTES,
  MAX_STATES_PER_SOCKET,
  Presence,
  PresenceLimitError,
  PRESENCE_TIMEOUT_MS,
} from './presence';

/** One awareness update with exactly these entries, in this order. */
function frameOf(entries: readonly [clientId: number, clock: number, state: string][]): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, entries.length);
  for (const [clientId, clock, state] of entries) {
    encoding.writeVarUint(encoder, clientId);
    encoding.writeVarUint(encoder, clock);
    encoding.writeVarString(encoder, state);
  }
  return encoding.toUint8Array(encoder);
}

function client(clientID: number): Awareness {
  const doc = new Y.Doc();
  doc.clientID = clientID;
  const awareness = new Awareness(doc);
  // The interval would keep the test isolate busy; nothing here needs it.
  clearInterval((awareness as unknown as { _checkInterval: number })._checkInterval);
  return awareness;
}

/** What a client sees after applying `update`. */
function seenBy(update: Uint8Array, observer = client(999)): Map<number, unknown> {
  applyAwarenessUpdate(observer, update, 'relay');
  const states = new Map(observer.getStates());
  states.delete(observer.clientID);
  return states;
}

describe('Presence', () => {
  it('holds a state a client announces and encodes it back unchanged', () => {
    const alice = client(1);
    alice.setLocalState({ participantId: 'p-alice', name: 'Alice' });
    const presence = new Presence();

    const changed = presence.apply('socket-a', encodeAwarenessUpdate(alice, [1]), 1_000);

    expect(changed).toEqual({ added: [1], updated: [], removed: [], previousOwners: [] });
    expect(seenBy(presence.encode([1]))).toEqual(
      new Map([[1, { participantId: 'p-alice', name: 'Alice' }]]),
    );
  });

  it('counts a renewal with the same state as an update', () => {
    const alice = client(1);
    alice.setLocalState({ participantId: 'p-alice' });
    const presence = new Presence();
    presence.apply('socket-a', encodeAwarenessUpdate(alice, [1]), 1_000);

    alice.setLocalState({ participantId: 'p-alice' });
    const changed = presence.apply('socket-a', encodeAwarenessUpdate(alice, [1]), 16_000);

    expect(changed).toEqual({ added: [], updated: [1], removed: [], previousOwners: [] });
  });

  it('ignores an update whose clock is not newer', () => {
    const alice = client(1);
    alice.setLocalState({ participantId: 'p-alice', v: 1 });
    const stale = encodeAwarenessUpdate(alice, [1]);
    alice.setLocalState({ participantId: 'p-alice', v: 2 });
    const presence = new Presence();
    presence.apply('socket-a', encodeAwarenessUpdate(alice, [1]), 1_000);

    const changed = presence.apply('socket-a', stale, 2_000);

    expect(changed).toEqual({ added: [], updated: [], removed: [], previousOwners: [] });
    expect(seenBy(presence.encode([1])).get(1)).toEqual({ participantId: 'p-alice', v: 2 });
  });

  it('drops a state its client clears, and tells observers it is gone', () => {
    const alice = client(1);
    alice.setLocalState({ participantId: 'p-alice' });
    const presence = new Presence();
    presence.apply('socket-a', encodeAwarenessUpdate(alice, [1]), 1_000);
    const observer = client(999);
    applyAwarenessUpdate(observer, presence.encode([1]), 'relay');

    removeAwarenessStates(alice, [1], 'left');
    const changed = presence.apply('socket-a', encodeAwarenessUpdate(alice, [1]), 2_000);

    expect(changed).toEqual({ added: [], updated: [], removed: [1], previousOwners: [] });
    expect(presence.encode(presence.clientIds())).toEqual(encodeAwarenessUpdate(client(5), []));
    expect(seenBy(presence.encode([1]), observer).has(1)).toBe(false);
  });

  it('removes every state a socket announced when the socket goes', () => {
    const alice = client(1);
    const bob = client(2);
    alice.setLocalState({ participantId: 'p-alice' });
    bob.setLocalState({ participantId: 'p-bob' });
    const presence = new Presence();
    presence.apply('socket-a', encodeAwarenessUpdate(alice, [1]), 1_000);
    presence.apply('socket-b', encodeAwarenessUpdate(bob, [2]), 1_000);
    const observer = client(999);
    applyAwarenessUpdate(observer, presence.encode([1, 2]), 'relay');

    const removed = presence.removeOwnedBy('socket-a', 2_000);

    expect(removed).toEqual([1]);
    expect(presence.clientIds()).toEqual([2]);
    // The removal is newer than what observers hold, so they apply it.
    expect([...seenBy(presence.encode(removed), observer).keys()]).toEqual([2]);
  });

  it(`expires a state not renewed for ${PRESENCE_TIMEOUT_MS / 1000} s, and only that one`, () => {
    const alice = client(1);
    const bob = client(2);
    alice.setLocalState({ participantId: 'p-alice' });
    bob.setLocalState({ participantId: 'p-bob' });
    const presence = new Presence();
    presence.apply('socket-a', encodeAwarenessUpdate(alice, [1]), 0);
    presence.apply('socket-b', encodeAwarenessUpdate(bob, [2]), 10_000);

    expect(presence.expire(PRESENCE_TIMEOUT_MS - 1)).toEqual([]);
    expect(presence.expire(PRESENCE_TIMEOUT_MS)).toEqual([1]);
    expect(presence.clientIds()).toEqual([2]);
  });

  it('restores what a socket held, with the time each state was last renewed', () => {
    const alice = client(1);
    alice.setLocalState({ participantId: 'p-alice' });
    const before = new Presence();
    before.apply('socket-a', encodeAwarenessUpdate(alice, [1]), 5_000);

    const after = new Presence();
    after.restore('socket-a', before.ownedBy('socket-a'));

    expect(seenBy(after.encode([1]))).toEqual(seenBy(before.encode([1])));
    expect(after.expire(5_000 + PRESENCE_TIMEOUT_MS - 1)).toEqual([]);
    expect(after.expire(5_000 + PRESENCE_TIMEOUT_MS)).toEqual([1]);
  });

  it('keeps a state under the socket that last announced it', () => {
    const alice = client(1);
    alice.setLocalState({ participantId: 'p-alice' });
    const presence = new Presence();
    presence.apply('socket-old', encodeAwarenessUpdate(alice, [1]), 1_000);

    alice.setLocalState({ participantId: 'p-alice' });
    presence.apply('socket-new', encodeAwarenessUpdate(alice, [1]), 2_000);

    expect(presence.removeOwnedBy('socket-old', 3_000)).toEqual([]);
    expect(presence.ownedBy('socket-new').map((e) => e.clientId)).toEqual([1]);
  });

  it(`refuses more than ${MAX_STATES_PER_SOCKET} states on one socket, changing nothing`, () => {
    const presence = new Presence();
    const crowd = Array.from({ length: MAX_STATES_PER_SOCKET + 1 }, (_, i) => {
      const a = client(100 + i);
      a.setLocalState({ participantId: `p-${i}` });
      return a;
    });
    for (const a of crowd.slice(0, MAX_STATES_PER_SOCKET)) {
      presence.apply('socket-a', encodeAwarenessUpdate(a, [a.clientID]), 0);
    }
    const last = crowd.at(-1)!;
    expect(() =>
      presence.apply('socket-a', encodeAwarenessUpdate(last, [last.clientID]), 0),
    ).toThrow(PresenceLimitError);
    expect(presence.clientIds()).toHaveLength(MAX_STATES_PER_SOCKET);
    // Another socket still has its own room.
    presence.apply('socket-b', encodeAwarenessUpdate(last, [last.clientID]), 0);
    expect(presence.clientIds()).toHaveLength(MAX_STATES_PER_SOCKET + 1);
  });

  it(`forgets a removed client's clock ${PRESENCE_TIMEOUT_MS / 1000} s after its removal`, () => {
    const alice = client(1);
    alice.setLocalState({ participantId: 'p-alice' });
    const presence = new Presence();
    presence.apply('socket-a', encodeAwarenessUpdate(alice, [1]), 0);
    presence.removeOwnedBy('socket-a', 1_000);
    expect(presence.remembered()).toBe(1);

    presence.expire(1_000 + PRESENCE_TIMEOUT_MS - 1);
    expect(presence.remembered()).toBe(1);
    presence.expire(1_000 + PRESENCE_TIMEOUT_MS);
    expect(presence.remembered()).toBe(0);
  });

  it('rejects an update whose state is not JSON', () => {
    const presence = new Presence();
    // 1 entry: clientID 7, clock 1, state "{oops"
    const bad = new Uint8Array([1, 7, 1, 5, ...new TextEncoder().encode('{oops')]);
    expect(() => presence.apply('socket-a', bad, 0)).toThrow();
    expect(presence.clientIds()).toEqual([]);
  });

  it('names the other sockets whose states an update took over or removed', () => {
    const alice = client(1);
    alice.setLocalState({ participantId: 'p-alice' });
    const presence = new Presence();
    presence.apply('socket-a', encodeAwarenessUpdate(alice, [1]), 0);

    // socket-b echoes a removal of alice's state at the clock it holds.
    const removal = client(1);
    removal.setLocalState({}); // clock 1
    removal.setLocalState(null);
    removal.meta.set(1, { clock: 1, lastUpdated: 0 });
    const echo = presence.apply('socket-b', encodeAwarenessUpdate(removal, [1]), 1);

    expect(echo).toEqual({ added: [], updated: [], removed: [1], previousOwners: ['socket-a'] });
  });

  it('reports the sockets of expired states', () => {
    const alice = client(1);
    alice.setLocalState({ participantId: 'p-alice' });
    const presence = new Presence();
    presence.apply('socket-a', encodeAwarenessUpdate(alice, [1]), 0);

    const owners = new Set<string>();
    expect(presence.expire(PRESENCE_TIMEOUT_MS, owners)).toEqual([1]);
    expect([...owners]).toEqual(['socket-a']);
  });

  it('never adopts the relay own state, and encodes it with a rising clock', () => {
    const presence = new Presence();
    presence.bindRelay(77);
    const echo = client(77);
    echo.setLocalState({});

    expect(presence.apply('socket-a', encodeAwarenessUpdate(echo, [77]), 0)).toEqual({
      added: [],
      updated: [],
      removed: [],
      previousOwners: [],
    });
    expect(presence.clientIds()).toEqual([]);

    const observer = client(999);
    applyAwarenessUpdate(observer, presence.encode([], 5_000), 'relay');
    expect(observer.getStates().get(77)).toEqual({});
    const before = observer.meta.get(77)!.clock;
    applyAwarenessUpdate(observer, presence.encode([], 5_000), 'relay');
    expect(observer.meta.get(77)!.clock).toBeGreaterThan(before);
  });

  describe('a frame that lists a client twice', () => {
    it('counts the net effect: a state added and an older removal still is a state held', () => {
      const presence = new Presence();
      const pairs = Array.from({ length: MAX_STATES_PER_SOCKET + 1 }, (_, i) => [
        [500 + i, 2, '{}'],
        [500 + i, 1, 'null'],
      ]).flat() as [number, number, string][];

      expect(() => presence.apply('socket-a', frameOf(pairs), 0)).toThrow(PresenceLimitError);
      expect(presence.clientIds()).toEqual([]);
      expect(presence.remembered()).toBe(0);
    });

    it('admits the same pairs up to the cap', () => {
      const presence = new Presence();
      const pairs = Array.from({ length: MAX_STATES_PER_SOCKET }, (_, i) => [
        [500 + i, 2, '{}'],
        [500 + i, 1, 'null'],
      ]).flat() as [number, number, string][];

      presence.apply('socket-a', frameOf(pairs), 0);
      expect(presence.ownedBy('socket-a')).toHaveLength(MAX_STATES_PER_SOCKET);
    });

    it('does not let a thief take another socket states past its cap', () => {
      const presence = new Presence();
      for (let i = 0; i < MAX_STATES_PER_SOCKET + 1; i++) {
        presence.apply(`victim-${i}`, frameOf([[700 + i, 5, '{"v":1}']]), 0);
      }
      const steal = Array.from({ length: MAX_STATES_PER_SOCKET + 1 }, (_, i) => [
        [700 + i, 7, '{"stolen":true}'],
        [700 + i, 6, 'null'],
      ]).flat() as [number, number, string][];

      expect(() => presence.apply('thief', frameOf(steal), 1)).toThrow(PresenceLimitError);
      expect(presence.ownedBy('thief')).toEqual([]);
      expect(presence.ownedBy('victim-0')).toHaveLength(1);
    });

    it('applies a removal after a state in order, as y-protocols does', () => {
      const presence = new Presence();
      const change = presence.apply(
        'socket-a',
        frameOf([
          [9, 1, '{}'],
          [9, 2, 'null'],
        ]),
        0,
      );
      expect(presence.clientIds()).toEqual([]);
      expect(change.added).toEqual([9]);
      expect(change.removed).toEqual([9]);
    });
  });

  it('records no removal for a client it never heard of', () => {
    const presence = new Presence();
    const change = presence.apply('socket-a', frameOf([[41, 3, 'null']]), 0);
    expect(change).toEqual({ added: [], updated: [], removed: [], previousOwners: [] });
    expect(presence.remembered()).toBe(0);
  });

  it(`refuses an update over ${MAX_AWARENESS_BYTES} bytes`, () => {
    const presence = new Presence();
    const entries = Array.from(
      { length: MAX_AWARENESS_BYTES },
      (_, i) => [1000 + i, 1, 'null'] as [number, number, string],
    );
    expect(() => presence.apply('socket-a', frameOf(entries), 0)).toThrow(AwarenessTooLargeError);
  });
});
