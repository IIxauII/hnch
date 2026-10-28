/**
 * A room's sockets: admission (item 5), sync (item 7) and presence (item 8).
 */

import { env } from 'cloudflare:workers';
import { evictDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { PRESENCE_TIMEOUT_MS } from './presence';
import { Peer, createRoom, eventually, restoreClock, setNow, upgrade } from './test-support/peer';

const HASH = 'ab'.repeat(32);

function roomStub(uuid: string) {
  return env.ROOM.get(env.ROOM.idFromName(uuid));
}

afterEach(() => restoreClock());

describe('joining a room', () => {
  it('opens with sync-step-1, then the presence the room holds', async () => {
    const { uuid } = await createRoom();
    const peer = await Peer.join(uuid);
    await eventually(() => expect(peer.frames.length).toBeGreaterThanOrEqual(2));
    expect(peer.frames.slice(0, 2).map((f) => f.type)).toEqual(['sync', 'awareness']);
  });

  it('refuses an unknown room before the upgrade', async () => {
    expect((await upgrade(crypto.randomUUID())).status).toBe(404);
  });

  it('refuses a password room without pw before the upgrade', async () => {
    const { uuid } = await createRoom({ passwordHash: HASH });
    expect((await upgrade(uuid)).status).toBe(400);
    expect((await upgrade(uuid, '?pw=')).status).toBe(400);
  });

  it('closes 4002 on a wrong pw, after the upgrade', async () => {
    const { uuid } = await createRoom({ passwordHash: HASH });
    const peer = await Peer.join(uuid, `?pw=${'cd'.repeat(32)}`);
    expect(await peer.closed()).toEqual({ code: 4002, reason: 'wrong-password' });
  });

  it('admits the right pw', async () => {
    const { uuid } = await createRoom({ passwordHash: HASH });
    const peer = await Peer.join(uuid, `?did=d1&pw=${HASH}`);
    await eventually(() => expect(peer.frames.length).toBeGreaterThanOrEqual(2));
    expect(peer.closeEvent).toBeNull();
  });

  it('accepts the room UUID in any case', async () => {
    const { uuid } = await createRoom();
    const peer = await Peer.join(uuid.toUpperCase());
    await eventually(() => expect(peer.frames.length).toBeGreaterThanOrEqual(2));
  });
});

describe('sync', () => {
  it('fans a doc edit out to the other peers, never back to its sender', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    await eventually(() => expect(bob.frames.length).toBeGreaterThanOrEqual(2));
    const mark = alice.frames.length;

    alice.doc.getMap('round').set('title', 'Login page');

    await eventually(() => expect(bob.doc.getMap('round').get('title')).toBe('Login page'));
    // Give an echo time to arrive, then check none did.
    await new Promise((r) => setTimeout(r, 50));
    expect(alice.since(mark).filter((f) => f.type === 'sync')).toEqual([]);
  });

  it('hands a later peer the whole doc, after everyone else left', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    alice.doc.getArray('votes').push(['3', '5', '8']);
    await new Promise((r) => setTimeout(r, 50));
    alice.close();
    await alice.closed();

    const bob = await Peer.join(uuid);
    await eventually(() => expect(bob.doc.getArray('votes').toArray()).toEqual(['3', '5', '8']));
  });

  it('keeps the doc across an eviction of the room object', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    alice.doc.getMap('round').set('title', 'Checkout');
    await new Promise((r) => setTimeout(r, 50));
    alice.close();
    await alice.closed();

    await evictDurableObject(roomStub(uuid));
    const bob = await Peer.join(uuid);
    await eventually(() => expect(bob.doc.getMap('round').get('title')).toBe('Checkout'));
  });

  it('ignores a frame type it does not know', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    alice.send(new Uint8Array([7, 1, 2, 3]));
    alice.doc.getMap('m').set('k', 1);
    await eventually(() => expect(bob.doc.getMap('m').get('k')).toBe(1));
    expect(alice.closeEvent).toBeNull();
  });

  it('closes 1008 a socket that announces more states than a client would', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    // One awareness frame with 9 clients: count, then (clientID, clock 1, "{}") each.
    const entries = Array.from({ length: 9 }, (_, i) => [20 + i, 1, 2, 123, 125]).flat();
    const update = [9, ...entries];
    alice.send(new Uint8Array([1, update.length, ...update]));
    expect((await alice.closed()).code).toBe(1008);
    expect(bob.closeEvent).toBeNull();
  });

  it('closes a socket that sends a frame it cannot read', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    // Awareness frame whose state is not JSON.
    alice.send(new Uint8Array([1, 9, 1, 7, 1, 5, ...new TextEncoder().encode('{oops')]));
    expect((await alice.closed()).code).toBe(1003);
  });
});

describe('presence', () => {
  it('replays every state the room holds to a fresh socket', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    alice.announce({ participantId: 'p-alice' });
    await new Promise((r) => setTimeout(r, 50));

    const bob = await Peer.join(uuid);
    await eventually(() => expect(bob.participants()).toEqual(['p-alice']));
  });

  it('passes a state on to the others, never back to its sender', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    await eventually(() => expect(alice.frames.length).toBeGreaterThanOrEqual(2));
    const mark = alice.frames.length;

    alice.announce({ participantId: 'p-alice' });

    await eventually(() => expect(bob.participants()).toEqual(['p-alice']));
    await new Promise((r) => setTimeout(r, 50));
    expect(alice.since(mark)).toEqual([]);
  });

  it('removes what a socket announced when it closes, and tells the others', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    alice.announce({ participantId: 'p-alice' });
    await eventually(() => expect(bob.participants()).toEqual(['p-alice']));

    alice.close();

    await eventually(() => expect(bob.participants()).toEqual([]));
    const carol = await Peer.join(uuid);
    await new Promise((r) => setTimeout(r, 50));
    expect(carol.participants()).toEqual([]);
  });

  it('replays presence after the room object was evicted with sockets open', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    alice.announce({ participantId: 'p-alice' });
    await new Promise((r) => setTimeout(r, 50));

    await evictDurableObject(roomStub(uuid));

    const bob = await Peer.join(uuid);
    await eventually(() => expect(bob.participants()).toEqual(['p-alice']));
  });

  it(`neither replays nor keeps a state not renewed for ${PRESENCE_TIMEOUT_MS / 1000} s`, async () => {
    const start = Date.now();
    setNow(start);
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    alice.announce({ participantId: 'p-alice' });
    await eventually(() => expect(bob.participants()).toEqual(['p-alice']));
    // y-protocols re-announces a client that is told it was removed; a client
    // that went quiet does not.
    alice.mute();

    setNow(start + PRESENCE_TIMEOUT_MS);
    const carol = await Peer.join(uuid);
    await new Promise((r) => setTimeout(r, 50));

    expect(carol.participants()).toEqual([]);
    // The expiry reaches the peers that held it, too.
    await eventually(() => expect(bob.participants()).toEqual([]));
  });

  it('keeps a state its client renews', async () => {
    const start = Date.now();
    setNow(start);
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    alice.announce({ participantId: 'p-alice' });
    await new Promise((r) => setTimeout(r, 50));

    setNow(start + 15_000);
    alice.announce({ participantId: 'p-alice' });
    await new Promise((r) => setTimeout(r, 50));
    setNow(start + 40_000);

    const bob = await Peer.join(uuid);
    await eventually(() => expect(bob.participants()).toEqual(['p-alice']));
  });
});
