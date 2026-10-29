/**
 * Presence as y-websocket clients drive it (contract item 8): real y-protocols
 * `Awareness` instances that echo every change back, as y-websocket 3 does.
 */

import { env } from 'cloudflare:workers';
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { describe, expect, it } from 'vitest';
import { MAX_ROOM_PARTICIPANTS } from '@hnch/shared/auth';
import { MAX_STATES_PER_SOCKET } from './presence';
import type { RoomMeta } from './room';
import { Peer, createRoom, eventually } from './test-support/peer';

const settle = () => new Promise((r) => setTimeout(r, 50));
const roomStub = (uuid: string) => env.ROOM.get(env.ROOM.idFromName(uuid));

/** The client IDs listed in an awareness frame. */
function clientIdsIn(frame: Uint8Array): number[] {
  const outer = decoding.createDecoder(frame);
  decoding.readVarUint(outer); // message type
  const decoder = decoding.createDecoder(decoding.readVarUint8Array(outer));
  const ids: number[] = [];
  for (let n = decoding.readVarUint(decoder); n > 0; n--) {
    ids.push(decoding.readVarUint(decoder));
    decoding.readVarUint(decoder); // clock
    decoding.readVarString(decoder); // state
  }
  return ids;
}

describe('a crowded room', () => {
  it('admits 12 clients that echo the opening presence, and shows each to all', async () => {
    const { uuid } = await createRoom();
    const peers: Peer[] = [];
    for (let i = 0; i < 12; i++) {
      const peer = await Peer.join(uuid);
      peer.announce({ participantId: `p-${i}` });
      peers.push(peer);
      // Everyone so far sees everyone else.
      await eventually(() => {
        for (const p of peers) expect(p.participants()).toHaveLength(peers.length - 1);
      }, 5_000);
    }
    await settle();
    expect(peers.map((p) => p.closeEvent)).toEqual(peers.map(() => null));
    for (const [i, peer] of peers.entries()) {
      const others = peers.filter((_, j) => j !== i).map((p) => `p-${peers.indexOf(p)}`);
      expect(peer.participants().toSorted()).toEqual(others.toSorted());
    }
  });
});

describe('the relay own state', () => {
  it('is listed once, even though peers echo it back', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    // Alice echoes the relay's state once she reads her opening awareness
    // frame; wait for it, so that echo goes out before her announce and the
    // observer's wait below covers both.
    await eventually(() => expect(alice.frames.length).toBeGreaterThanOrEqual(2));
    // Echoes nothing, so it only watches what the room relays.
    const observer = await Peer.join(uuid);
    observer.mute();
    alice.announce({ participantId: 'p-alice' });
    // Once the room relays alice's state it holds it, for bob's opening frame.
    await eventually(() => expect(observer.participants()).toEqual(['p-alice']));

    const bob = await Peer.join(uuid);
    await eventually(() => expect(bob.participants()).toEqual(['p-alice']));
    const opening = bob.frames.find((f) => f.type === 'awareness')!;
    const ids = clientIdsIn(opening.bytes);

    // Alice's state and the relay's own `{}`, each once.
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('a client that reconnects', () => {
  it('is held and shown to the others again once it announces at a newer clock', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    alice.announce({ participantId: 'p-alice' });
    await eventually(() => expect(bob.participants()).toEqual(['p-alice']));

    // The link drops; the relay removes the state and bob sees it go.
    alice.drop();
    await eventually(() => expect(bob.participants()).toEqual([]));

    // The same Awareness reconnects and re-announces, as relay-client does.
    const back = await Peer.join(uuid, '', alice.awareness);
    back.announce({ participantId: 'p-alice' });
    await eventually(() => expect(bob.participants()).toEqual(['p-alice']), 1_000);

    // And the relay holds it for whoever joins next.
    const carol = await Peer.join(uuid);
    await eventually(() => expect(carol.participants()).toEqual(['p-alice']));
  });
});

describe('the document load', () => {
  const docLoaded = (uuid: string) =>
    runInDurableObject(
      roomStub(uuid),
      (room) => (room as unknown as { doc: unknown }).doc !== null,
    );

  it('waits for a sync frame; awareness alone after a wake never loads it', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    // Each peer answers the room's opening sync-step-1 as soon as it reads it.
    // Once the room relays what each sends after that, it has handled those
    // answers too, so none reaches the woken room and loads the doc there.
    await eventually(() => {
      for (const p of [alice, bob]) expect(p.frames.length).toBeGreaterThanOrEqual(2);
    });
    alice.announce({ participantId: 'p-alice' });
    bob.announce({ participantId: 'p-bob' });
    await eventually(() => {
      expect(bob.participants()).toEqual(['p-alice']);
      expect(alice.participants()).toEqual(['p-bob']);
    });

    await evictDurableObject(roomStub(uuid));
    expect(await docLoaded(uuid)).toBe(false);

    alice.announce({ participantId: 'p-alice', again: true });
    // Bob is shown it once the woken room has handled the frame.
    await eventually(() =>
      expect(bob.awareness.getStates().get(alice.awareness.clientID)).toMatchObject({
        again: true,
      }),
    );
    expect(await docLoaded(uuid)).toBe(false);

    alice.doc.getMap('m').set('k', 1);
    await eventually(async () => expect(await docLoaded(uuid)).toBe(true));
  });
});

describe('room metadata', () => {
  it('records its schema version when the room is made', async () => {
    const { uuid } = await createRoom();
    const meta = await runInDurableObject(roomStub(uuid), (_room, state) =>
      state.storage.kv.get<RoomMeta>('meta'),
    );
    expect(meta?.schemaVersion).toBe(1);
    expect(meta?.tombstonedAt).toBeNull();
  });
});

describe('presence across an eviction', () => {
  /** An awareness frame removing `clientId` at `clock`, as a peer echoes a removal. */
  function removalFrame(clientId: number, clock: number): Uint8Array {
    const update = encoding.createEncoder();
    encoding.writeVarUint(update, 1);
    encoding.writeVarUint(update, clientId);
    encoding.writeVarUint(update, clock);
    encoding.writeVarString(update, 'null');
    const frame = encoding.createEncoder();
    encoding.writeVarUint(frame, 1);
    encoding.writeVarUint8Array(frame, encoding.toUint8Array(update));
    return encoding.toUint8Array(frame);
  }

  it('does not bring back a state another socket removed', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    // Echoes nothing, so it only watches what the room relays.
    const observer = await Peer.join(uuid);
    observer.mute();
    alice.announce({ participantId: 'p-alice' });
    await eventually(() => {
      expect(bob.participants()).toEqual(['p-alice']);
      expect(observer.participants()).toEqual(['p-alice']);
    });

    // Bob's frame removes alice's state; alice's socket stays open but does not
    // answer the removal by announcing herself again, as a live client would.
    alice.mute();
    const clock = alice.awareness.meta.get(alice.awareness.clientID)!.clock;
    bob.send(removalFrame(alice.awareness.clientID, clock));
    // The room relays the removal once it has dropped the state.
    await eventually(() => expect(observer.participants()).toEqual([]));

    await evictDurableObject(roomStub(uuid));
    const carol = await Peer.join(uuid);
    await eventually(() => expect(carol.frames.some((f) => f.type === 'awareness')).toBe(true));
    expect(carol.participants()).toEqual([]);
  });
});

describe('a full room', () => {
  /** An awareness frame announcing `ids`, each with a state of `size` characters. */
  function announceFrame(ids: number[], size: number): Uint8Array {
    const update = encoding.createEncoder();
    encoding.writeVarUint(update, ids.length);
    for (const id of ids) {
      encoding.writeVarUint(update, id);
      encoding.writeVarUint(update, 1);
      encoding.writeVarString(update, JSON.stringify({ participantId: 'x'.repeat(size) }));
    }
    const frame = encoding.createEncoder();
    encoding.writeVarUint(frame, 1);
    encoding.writeVarUint8Array(frame, encoding.toUint8Array(update));
    return encoding.toUint8Array(frame);
  }

  it('accepts the echo of a joiner that was sent every state at the largest size', async () => {
    const { uuid } = await createRoom();
    const holders: Peer[] = [];
    // Every seat but the joiner's holds as many states as it may, of nearly the
    // largest size.
    const seats = MAX_ROOM_PARTICIPANTS - 1;
    const per = MAX_STATES_PER_SOCKET;
    for (let i = 0; i < seats; i++) {
      const peer = await Peer.join(uuid);
      // Only the joiner's echo is under test. Echoing holders would send the
      // room one frame per holder for every later holder's states, and that
      // backlog, not the joiner, would decide how long the test takes.
      peer.mute();
      const ids = Array.from({ length: per }, (_, j) => 100_000 + i * per + j);
      peer.send(announceFrame(ids, 990));
      holders.push(peer);
    }
    // The first holder is shown every later holder's states, so once it holds
    // them all the room has taken in every holder's frame.
    await eventually(
      () => expect(holders[0]!.awareness.getStates().size).toBe((seats - 1) * per + 1),
      5_000,
    );

    const joiner = await Peer.join(uuid);
    // Its opening presence holds every state, in that one frame. The `+ 1` is
    // the relay's own `{}` state, not a holder's: the joiner's local state is null.
    await eventually(
      () => expect(joiner.frames.some((f) => f.type === 'awareness')).toBe(true),
      5_000,
    );
    const opening = joiner.frames.find((f) => f.type === 'awareness')!;
    expect(clientIdsIn(opening.bytes)).toHaveLength(seats * per + 1);

    // The joiner's y-protocols echoed the whole opening presence in one update.
    // Frames are handled in order, so once the room relays what the joiner sends
    // next, it has dealt with the echo too.
    joiner.announce({ participantId: 'p-joiner' });
    await eventually(() => expect(holders[0]!.participants()).toContain('p-joiner'), 5_000);
    expect(joiner.closeEvent).toBeNull();
    expect(holders.map((p) => p.closeEvent)).toEqual(holders.map(() => null));
  }, 20_000);
});
