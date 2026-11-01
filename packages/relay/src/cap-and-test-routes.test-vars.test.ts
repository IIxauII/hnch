/**
 * The ADR-0027 test vars, as the e2e relay runs them (contract item 15):
 * HNCH_ROOM_CAP=3 and HNCH_ENABLE_TEST_ROUTES=1 (see vitest.config.ts).
 * Also the participant cap itself (ADR-0024, item 5), at the lowered value.
 */

import { env } from 'cloudflare:workers';
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Codes } from './codes';
import { REFUSED_BOUND_DETAIL, REFUSED_SOCKETS_BOUND } from './room';
import { Peer, call, createRoom, eventually, upgrade } from './test-support/peer';
import { handleFetch } from './worker';

const HASH = 'ab'.repeat(32);
const WRONG = 'cd'.repeat(32);
const settle = () => new Promise((r) => setTimeout(r, 50));
const roomStub = (uuid: string) => env.ROOM.get(env.ROOM.idFromName(uuid));
const codesStub = (code: string) => env.CODES.get(env.CODES.idFromName(code));

/** The sockets the room counts against its cap: its own `openSockets()`. */
const seatedCount = (uuid: string) =>
  runInDurableObject(
    roomStub(uuid),
    (room) => (room as unknown as { openSockets(): WebSocket[] }).openSockets().length,
  );
/** The sockets the room accepted only to refuse, still held while their clients don't close. */
const refusedCount = (uuid: string) =>
  runInDurableObject(roomStub(uuid), (_room, state) => state.getWebSockets('refused').length);

async function joined(uuid: string, query = ''): Promise<Peer> {
  const peer = await Peer.join(uuid, query);
  await eventually(() => expect(peer.frames.length).toBeGreaterThanOrEqual(2));
  return peer;
}

afterEach(() => vi.restoreAllMocks());

describe('participant cap (HNCH_ROOM_CAP=3)', () => {
  it('closes the socket past the cap with 4006 room-full', async () => {
    const { uuid } = await createRoom();
    for (let i = 0; i < 3; i++) await joined(uuid);
    const fourth = await Peer.join(uuid);
    expect(await fourth.closed()).toEqual({ code: 4006, reason: 'room-full' });
  });

  it('shares nothing with a socket refused 4006, either way', async () => {
    const { uuid } = await createRoom();
    const seated = [await joined(uuid), await joined(uuid), await joined(uuid)];
    seated[0]!.announce({ participantId: 'member' });
    seated[0]!.doc.getMap('round').set('title', 'Login page');
    await eventually(() => {
      for (const peer of seated.slice(1)) {
        expect(peer.doc.getMap('round').get('title')).toBe('Login page');
        expect(peer.participants()).toEqual(['member']);
      }
    });

    const intruder = await Peer.join(uuid);
    intruder.announce({ participantId: 'intruder' });
    intruder.doc.getMap('injected').set('by', 'intruder');
    expect(await intruder.closed()).toEqual({ code: 4006, reason: 'room-full' });
    await settle();

    // Room → intruder: nothing.
    expect(intruder.frames).toEqual([]);
    expect(intruder.doc.getMap('round').get('title')).toBeUndefined();
    expect(intruder.participants()).toEqual([]);
    // Intruder → room: nothing.
    for (const peer of seated) {
      expect(peer.doc.getMap('injected').size).toBe(0);
      expect(peer.participants()).not.toContain('intruder');
    }
  });

  it('gives no seat to a refused socket that is still closing', async () => {
    const { uuid } = await createRoom({ passwordHash: HASH });
    const seated = [await joined(uuid, `?pw=${HASH}`), await joined(uuid, `?pw=${HASH}`)];
    // Its client never reads the close, so the relay's side stays CLOSING.
    const refused = await upgrade(uuid, `?pw=${WRONG}`);
    expect(refused.status).toBe(101);
    expect(await refusedCount(uuid)).toBe(1);

    const third = await joined(uuid, `?pw=${HASH}`);
    const fourth = await Peer.join(uuid, `?pw=${HASH}`);
    expect(await fourth.closed()).toEqual({ code: 4006, reason: 'room-full' });
    for (const peer of [...seated, third]) expect(peer.closeEvent).toBeNull();
    expect(await refusedCount(uuid)).toBe(1);

    // Once its client answers the close it drains, and an eviction keeps the
    // three peers seated: still full.
    refused.webSocket!.accept();
    await eventually(async () => expect(await refusedCount(uuid)).toBe(0));
    await evictDurableObject(roomStub(uuid));
    const fifth = await Peer.join(uuid, `?pw=${HASH}`);
    expect(await fifth.closed()).toEqual({ code: 4006, reason: 'room-full' });
    for (const peer of [...seated, third]) expect(peer.closeEvent).toBeNull();
  });

  it('admits exactly the cap when joins arrive at once', async () => {
    const { uuid } = await createRoom();
    const peers = await Promise.all(Array.from({ length: 6 }, () => Peer.join(uuid)));
    await eventually(() => {
      for (const p of peers) {
        expect(p.closeEvent !== null || p.frames.length >= 2).toBe(true);
      }
    });
    await settle();
    const refused = peers.filter((p) => p.closeEvent?.code === 4006);
    expect(refused).toHaveLength(3);
    expect(peers.filter((p) => p.closeEvent === null)).toHaveLength(3);
  });

  it('never counts a refused socket as a peer', async () => {
    const { uuid } = await createRoom({ passwordHash: HASH });
    const peers = [await joined(uuid, `?pw=${HASH}`), await joined(uuid, `?pw=${HASH}`)];
    // Refusals of either kind leave the room at two.
    const wrong = await Peer.join(uuid, `?pw=${WRONG}`);
    expect((await wrong.closed()).code).toBe(4002);
    const third = await joined(uuid, `?pw=${HASH}`);
    const full = await Peer.join(uuid, `?pw=${HASH}`);
    expect((await full.closed()).code).toBe(4006);

    // A seat frees up when a peer leaves.
    peers[0]!.close();
    await peers[0]!.closed();
    await eventually(async () => expect(await seatedCount(uuid)).toBe(2));
    const late = await joined(uuid, `?pw=${HASH}`);
    expect(late.closeEvent).toBeNull();
    expect(third.closeEvent).toBeNull();
  });
});

describe('DELETE /test/rooms/:uuid (HNCH_ENABLE_TEST_ROUTES=1)', () => {
  it('deletes the room and answers 200 {evicted}', async () => {
    const { uuid, code } = await createRoom();
    const res = await call(`/test/rooms/${uuid}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ evicted: uuid });

    expect((await call(`/rooms/${code}`)).status).toBe(404);
    expect((await upgrade(uuid)).status).toBe(404);
    expect(await codesStub(code).lookup()).toBeNull();
  });

  it('answers the gate-off 404 for an unknown or malformed UUID', async () => {
    for (const id of [crypto.randomUUID(), 'not-a-uuid', '12345']) {
      const res = await call(`/test/rooms/${id}`, { method: 'DELETE' });
      expect(res.status, id).toBe(404);
      expect(await res.json()).toEqual({ error: 'not-found' });
    }
  });

  it('answers the gate-off 404 when the room object fails, never a 503', async () => {
    const fail = () => Promise.reject(new Error('Durable Object is overloaded'));
    const broken = {
      ...env,
      ROOM: {
        idFromName: (name: string) => env.ROOM.idFromName(name),
        get: () => new Proxy({}, { get: () => fail }),
      },
    } as unknown as Env;
    const res = await handleFetch(
      new Request(`http://relay.test/test/rooms/${crypto.randomUUID()}`, { method: 'DELETE' }),
      broken,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
  });

  it('leaves open sockets connected, as the Node relay did, and writes nothing more', async () => {
    const { uuid, code } = await createRoom();
    const alice = await joined(uuid);
    const bob = await joined(uuid);
    alice.doc.getArray('votes').push(['3']);
    await eventually(() => expect(bob.doc.getArray('votes').length).toBe(1));
    // Hold the code release back so the tombstoned room's storage stays readable.
    // Spied on the prototype: RPC refuses a method that is an own property.
    const release = await runInDurableObject(codesStub(code), (codes) =>
      vi
        .spyOn(Object.getPrototypeOf(codes) as Codes, 'release')
        .mockRejectedValue(new Error('Durable Object is overloaded')),
    );

    expect((await call(`/test/rooms/${uuid}`, { method: 'DELETE' })).status).toBe(200);
    expect(release).toHaveBeenCalledWith(uuid);
    alice.doc.getArray('votes').push(['5']);
    await settle();
    alice.close();
    bob.close();
    await alice.closed();
    await bob.closed();
    await settle();

    expect(
      await runInDurableObject(roomStub(uuid), (_room, state) => ({
        log: state.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM log').one().n,
        snapshot: state.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM snapshot').one()
          .n,
      })),
    ).toEqual({ log: 0, snapshot: 0 });
  });
});

describe('refused-socket bound (#566)', () => {
  /** Refused upgrades whose clients never answer the close, so each keeps its socket. */
  async function holdRefused(uuid: string, query: string, count: number): Promise<Response[]> {
    const held: Response[] = [];
    for (let i = 0; i < count; i++) {
      const res = await upgrade(uuid, query);
      expect(res.status, `refusal ${i}`).toBe(101);
      held.push(res);
    }
    return held;
  }

  async function expectBoundRefusal(res: Response): Promise<void> {
    expect(res.status).toBe(503);
    expect(res.webSocket).toBeNull();
    expect(res.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await res.json()).toEqual({ error: 'unavailable', detail: REFUSED_BOUND_DETAIL });
  }

  it('answers a wrong password with 503 at the bound, and still admits the right one', async () => {
    const { uuid } = await createRoom({ passwordHash: HASH });
    const held = await holdRefused(uuid, `?pw=${WRONG}`, REFUSED_SOCKETS_BOUND);
    expect(await refusedCount(uuid)).toBe(REFUSED_SOCKETS_BOUND);

    await expectBoundRefusal(await upgrade(uuid, `?pw=${WRONG}`));
    expect(await refusedCount(uuid)).toBe(REFUSED_SOCKETS_BOUND);

    const peer = await joined(uuid, `?pw=${HASH}`);
    expect(peer.closeEvent).toBeNull();
    expect(await seatedCount(uuid)).toBe(1);
    expect(held).toHaveLength(REFUSED_SOCKETS_BOUND);
  });

  it('answers room-full with the same 503 at the bound', async () => {
    const { uuid } = await createRoom({ passwordHash: HASH });
    for (let i = 0; i < 3; i++) await joined(uuid, `?pw=${HASH}`);
    // Kept until the end: a client the test lets go of is one that has gone
    // away, and the runtime drops its refused socket.
    const held = await holdRefused(uuid, `?pw=${HASH}`, REFUSED_SOCKETS_BOUND);

    await expectBoundRefusal(await upgrade(uuid, `?pw=${HASH}`));
    await expectBoundRefusal(await upgrade(uuid, `?pw=${WRONG}`));
    expect(held).toHaveLength(REFUSED_SOCKETS_BOUND);
  });

  it('refuses with a close code again once a held socket drains', async () => {
    const { uuid } = await createRoom({ passwordHash: HASH });
    const held = await holdRefused(uuid, `?pw=${WRONG}`, REFUSED_SOCKETS_BOUND);
    await expectBoundRefusal(await upgrade(uuid, `?pw=${WRONG}`));

    held[0]!.webSocket!.accept();
    await eventually(async () => expect(await refusedCount(uuid)).toBe(REFUSED_SOCKETS_BOUND - 1));

    const wrong = await Peer.join(uuid, `?pw=${WRONG}`);
    expect(await wrong.closed()).toEqual({ code: 4002, reason: 'wrong-password' });
  });
});
