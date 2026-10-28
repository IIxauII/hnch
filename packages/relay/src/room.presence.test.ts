/**
 * Presence as y-websocket clients drive it (contract item 8): real y-protocols
 * `Awareness` instances that echo every change back, as y-websocket 3 does.
 */

import { env } from 'cloudflare:workers';
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { describe, expect, it } from 'vitest';
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
    alice.announce({ participantId: 'p-alice' });
    await settle();

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
    alice.announce({ participantId: 'p-alice' });
    await settle();

    await evictDurableObject(roomStub(uuid));
    expect(await docLoaded(uuid)).toBe(false);

    alice.announce({ participantId: 'p-alice', again: true });
    await settle();
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
    alice.announce({ participantId: 'p-alice' });
    await eventually(() => expect(bob.participants()).toEqual(['p-alice']));

    // Bob's frame removes alice's state; alice's socket stays open but does not
    // answer the removal by announcing herself again, as a live client would.
    alice.mute();
    const clock = alice.awareness.meta.get(alice.awareness.clientID)!.clock;
    bob.send(removalFrame(alice.awareness.clientID, clock));
    await settle();

    await evictDurableObject(roomStub(uuid));
    const carol = await Peer.join(uuid);
    await settle();
    expect(carol.participants()).toEqual([]);
  });
});
