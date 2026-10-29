/**
 * A room's sockets: admission (item 5), sync (item 7) and presence (item 8).
 */

import { env } from 'cloudflare:workers';
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { PRESENCE_TIMEOUT_MS } from './presence';
import { Room } from './room';
import { Peer, createRoom, eventually, restoreClock, setNow, upgrade } from './test-support/peer';

const HASH = 'ab'.repeat(32);
const settle = () => new Promise((r) => setTimeout(r, 50));

/** What the tests reach inside a Room. */
interface RoomInternals {
  openSockets(): WebSocket[];
  presence: { clientIds(): number[] };
}

/** The room's sockets: tagged refused, all, and those counted as peers. */
function socketsOf(uuid: string) {
  return runInDurableObject(roomStub(uuid), (room, state) => ({
    refused: state.getWebSockets('refused').length,
    all: state.getWebSockets().length,
    peers: (room as unknown as RoomInternals).openSockets().length,
  }));
}

function roomStub(uuid: string) {
  return env.ROOM.get(env.ROOM.idFromName(uuid));
}

afterEach(() => restoreClock());

function varint(n: number): number[] {
  const out: number[] = [];
  for (; n > 127; n = Math.floor(n / 128)) out.push((n % 128) | 128);
  out.push(n);
  return out;
}

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

  it('shares nothing with a refused socket, either way', async () => {
    const { uuid } = await createRoom({ passwordHash: HASH });
    const member = await Peer.join(uuid, `?pw=${HASH}`);
    member.announce({ participantId: 'member' });
    member.doc.getMap('round').set('title', 'Login page');
    await eventually(() =>
      expect(member.frames.filter((f) => f.type === 'awareness').length).toBeGreaterThan(0),
    );
    await settle();

    // Join (which sends sync-step-1), then at once presence and an edit,
    // before the refusal's close arrives or is answered.
    const intruder = await Peer.join(uuid, `?pw=${'cd'.repeat(32)}`);
    intruder.announce({ participantId: 'intruder' });
    intruder.doc.getMap('injected').set('by', 'intruder');
    expect(await intruder.closed()).toEqual({ code: 4002, reason: 'wrong-password' });
    await settle();

    // Room → intruder: nothing.
    expect(intruder.frames).toEqual([]);
    expect(intruder.doc.getMap('round').get('title')).toBeUndefined();
    expect(intruder.participants()).toEqual([]);
    // Intruder → room: nothing.
    expect(member.doc.getMap('injected').size).toBe(0);
    expect(member.participants()).toEqual([]);
    const late = await Peer.join(uuid, `?pw=${HASH}`);
    await eventually(() => expect(late.doc.getMap('round').get('title')).toBe('Login page'));
    expect(late.doc.getMap('injected').size).toBe(0);
    expect(late.participants()).toEqual(['member']);
  });

  it('keeps a refused socket out of the room on a wake, and drains it', async () => {
    const { uuid } = await createRoom({ passwordHash: HASH });
    const member = await Peer.join(uuid, `?pw=${HASH}`);
    member.announce({ participantId: 'member' });
    await eventually(() => expect(member.frames.length).toBeGreaterThanOrEqual(2));
    // Its client never reads the close, so the relay's side stays CLOSING.
    const refused = await upgrade(uuid, `?pw=${'cd'.repeat(32)}`);
    expect(refused.status).toBe(101);
    expect(await socketsOf(uuid)).toEqual({ refused: 1, all: 2, peers: 1 });

    // A wake rebuilds the object over the same sockets. evictDurableObject
    // can't do it here: it waits for the refused socket's close to finish
    // (or for its client's reference to go), so this builds a second instance
    // over the live state, as the runtime does after an eviction.
    const woke = await runInDurableObject(roomStub(uuid), (_room, state) => {
      const fresh = new Room(state, env) as unknown as RoomInternals;
      const [ws] = state.getWebSockets('refused');
      return {
        refusedState: ws!.readyState,
        peers: fresh.openSockets().length,
        owners: fresh.presence.clientIds().length,
      };
    });
    expect(woke).toEqual({ refusedState: WebSocket.CLOSING, peers: 1, owners: 1 });

    // A legitimate join is still admitted while it closes.
    const second = await Peer.join(uuid, `?pw=${HASH}`);
    await eventually(() => expect(second.participants()).toEqual(['member']));
    expect(await socketsOf(uuid)).toEqual({ refused: 1, all: 3, peers: 2 });

    // The client reads its close and answers it: the refused socket drains.
    const ws = refused.webSocket!;
    const closed = new Promise<number>((r) => ws.addEventListener('close', (e) => r(e.code)));
    ws.accept();
    expect(await closed).toBe(4002);
    await eventually(async () =>
      expect(await socketsOf(uuid)).toEqual({ refused: 0, all: 2, peers: 2 }),
    );

    // And a real eviction now restores just the peers.
    await evictDurableObject(roomStub(uuid));
    expect(await socketsOf(uuid)).toEqual({ refused: 0, all: 2, peers: 2 });
    expect(member.closeEvent).toBeNull();
    expect(second.closeEvent).toBeNull();
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

  it('closes 1009 a socket whose awareness frame is far past any client state', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    // 100k entries of (id, clock 1, "null"): about 600 KB.
    const body: number[] = [];
    const count = 100_000;
    for (let i = 0; i < count; i++) body.push(...varint(1000 + i), 1, 4, 110, 117, 108, 108);
    const update = [...varint(count), ...body];
    alice.send(new Uint8Array([1, ...varint(update.length), ...update]));
    expect((await alice.closed()).code).toBe(1009);
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
