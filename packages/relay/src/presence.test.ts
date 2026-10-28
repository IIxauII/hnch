/**
 * The relay's presence store against y-protocols' own Awareness, which is what
 * every client runs: updates a client encodes must apply here, and what the
 * store encodes must apply in a client.
 */

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import {
  MAX_STATES_PER_SOCKET,
  Presence,
  PresenceLimitError,
  PRESENCE_TIMEOUT_MS,
} from './presence';

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

    expect(changed).toEqual({ added: [1], updated: [], removed: [] });
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

    expect(changed).toEqual({ added: [], updated: [1], removed: [] });
  });

  it('ignores an update whose clock is not newer', () => {
    const alice = client(1);
    alice.setLocalState({ participantId: 'p-alice', v: 1 });
    const stale = encodeAwarenessUpdate(alice, [1]);
    alice.setLocalState({ participantId: 'p-alice', v: 2 });
    const presence = new Presence();
    presence.apply('socket-a', encodeAwarenessUpdate(alice, [1]), 1_000);

    const changed = presence.apply('socket-a', stale, 2_000);

    expect(changed).toEqual({ added: [], updated: [], removed: [] });
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

    expect(changed).toEqual({ added: [], updated: [], removed: [1] });
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
});
