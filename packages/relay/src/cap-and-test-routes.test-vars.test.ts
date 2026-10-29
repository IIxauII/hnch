/**
 * The ADR-0027 test vars, as the e2e relay runs them (contract item 15):
 * HNCH_ROOM_CAP=3 and HNCH_ENABLE_TEST_ROUTES=1 (see vitest.config.ts).
 * Also the participant cap itself (ADR-0024, item 5), at the lowered value.
 */

import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Peer, call, createRoom, eventually, upgrade } from './test-support/peer';
import { handleFetch } from './worker';

const HASH = 'ab'.repeat(32);
const settle = () => new Promise((r) => setTimeout(r, 50));
const roomStub = (uuid: string) => env.ROOM.get(env.ROOM.idFromName(uuid));
const codesStub = (code: string) => env.CODES.get(env.CODES.idFromName(code));

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
    const wrong = await Peer.join(uuid, `?pw=${'cd'.repeat(32)}`);
    expect((await wrong.closed()).code).toBe(4002);
    const third = await joined(uuid, `?pw=${HASH}`);
    const full = await Peer.join(uuid, `?pw=${HASH}`);
    expect((await full.closed()).code).toBe(4006);

    // A seat frees up when a peer leaves.
    peers[0]!.close();
    await peers[0]!.closed();
    await settle();
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
    await runInDurableObject(codesStub(code), (codes) => {
      vi.spyOn(codes, 'release').mockRejectedValue(new Error('Durable Object is overloaded'));
    });

    expect((await call(`/test/rooms/${uuid}`, { method: 'DELETE' })).status).toBe(200);
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
