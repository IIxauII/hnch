/**
 * Host-only access changes (ADR-0059): participant keys bind ids, the relay's
 * access holder gates `PATCH /rooms/:uuid/access`, and `POST /rooms/:uuid/host`
 * moves it, claiming an unset holder for the doc host (ADR-0060).
 */

import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { participantKey } from './participant-key';
import { Peer, call, eventually, restoreClock, setNow } from './test-support/peer';

const HASH = 'ab'.repeat(32);

interface Device {
  readonly id: string;
  readonly deviceKey: string;
}

function device(id: string): Device {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return { id, deviceKey: [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('') };
}

async function createKeyed(creator: Device): Promise<string> {
  const res = await call('/rooms', {
    method: 'POST',
    body: JSON.stringify({ creator: { participantId: creator.id, deviceKey: creator.deviceKey } }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { uuid: string }).uuid;
}

async function createKeyless(): Promise<string> {
  const res = await call('/rooms', { method: 'POST', body: '{}' });
  expect(res.status).toBe(201);
  return ((await res.json()) as { uuid: string }).uuid;
}

const pkOf = (who: Device, uuid: string): Promise<string> => participantKey(who.deviceKey, uuid);

/** Joins as `who`, proving its id with its key (or `pk` given, or none with null). */
async function join(uuid: string, who: Device, pk?: string | null): Promise<Peer> {
  const key = pk === undefined ? await pkOf(who, uuid) : pk;
  const query = `?did=${encodeURIComponent(who.id)}${key === null ? '' : `&pk=${key}`}`;
  const peer = await Peer.join(uuid, query);
  await peer.synced();
  return peer;
}

/** Writes `settings.hostParticipantId` from a peer, and waits for the relay to have it. */
async function setDocHost(uuid: string, peer: Peer, host: string): Promise<void> {
  peer.doc.getMap('settings').set('hostParticipantId', host);
  const probe = await Peer.join(uuid);
  await probe.synced();
  expect(probe.doc.getMap('settings').get('hostParticipantId')).toBe(host);
  probe.close();
}

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

async function answer(res: Response): Promise<Answer> {
  return { status: res.status, body: await res.json() };
}

async function patch(
  uuid: string,
  who: Device | null,
  passwordHash: string | null = HASH,
  pk?: string,
): Promise<Answer> {
  const headers: Record<string, string> = {};
  const body: Record<string, unknown> = { passwordHash };
  if (who !== null) {
    headers['Authorization'] = `Bearer ${pk ?? (await pkOf(who, uuid))}`;
    body['participantId'] = who.id;
  }
  return answer(
    await call(`/rooms/${uuid}/access`, { method: 'PATCH', headers, body: JSON.stringify(body) }),
  );
}

async function handoff(uuid: string, who: Device, target: string): Promise<Answer> {
  return answer(
    await call(`/rooms/${uuid}/host`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await pkOf(who, uuid)}` },
      body: JSON.stringify({ participantId: who.id, target }),
    }),
  );
}

/** The access holder as stored, null when unset. */
async function holderOf(uuid: string): Promise<string | null> {
  const stub = env.ROOM.get(env.ROOM.idFromName(uuid));
  return runInDurableObject(
    stub,
    (_room, state) =>
      state.storage.kv.get<{ accessHolder?: string | null }>('meta')?.accessHolder ?? null,
  );
}

const OK = { status: 200, body: { accessMode: 'password' } };
const UNAUTHENTICATED = { status: 401, body: { reason: 'unauthenticated' } };
const NOT_HOST = { status: 401, body: { reason: 'not-host' } };
const BAD_TARGET = { status: 409, body: { reason: 'bad-target' } };

afterEach(() => restoreClock());

describe('PATCH /rooms/:uuid/access with participant keys', () => {
  it('lets the creator change access right after a keyed create, before any socket', async () => {
    const alice = device('alice');
    const uuid = await createKeyed(alice);
    expect(await patch(uuid, alice)).toEqual(OK);
  });

  it('refuses a never-joined id, a wrong key and a missing key as unauthenticated', async () => {
    const alice = device('alice');
    const uuid = await createKeyed(alice);
    expect(await patch(uuid, device('mallory'))).toEqual(UNAUTHENTICATED);
    expect(await patch(uuid, alice, HASH, 'cd'.repeat(32))).toEqual(UNAUTHENTICATED);
    expect(await patch(uuid, alice, HASH, 'nope')).toEqual(UNAUTHENTICATED);
    expect(await patch(uuid, null)).toEqual(UNAUTHENTICATED);
  });

  it('refuses a bound non-host as not-host, and lets the host through', async () => {
    const [alice, bob] = [device('alice'), device('bob')];
    const uuid = await createKeyed(alice);
    const a = await join(uuid, alice);
    await join(uuid, bob);
    await setDocHost(uuid, a, alice.id);
    expect(await patch(uuid, bob)).toEqual(NOT_HOST);
    expect(await patch(uuid, alice)).toEqual(OK);
  });

  it('refuses a forger of the doc host while a holder is set', async () => {
    const [alice, bob] = [device('alice'), device('bob')];
    const uuid = await createKeyed(alice);
    await join(uuid, alice);
    const b = await join(uuid, bob);
    await setDocHost(uuid, b, bob.id);
    expect(await patch(uuid, bob)).toEqual(NOT_HOST);
  });
});

describe('the holder lapsing and the doc host claiming it', () => {
  const T0 = Date.UTC(2026, 10, 11, 12);

  /** alice created and holds; bob is connected and the doc names bob host (as an election would). */
  async function bobElected(): Promise<{ uuid: string; alice: Device; bob: Device; a: Peer }> {
    const [alice, bob] = [device('alice'), device('bob')];
    setNow(T0);
    const uuid = await createKeyed(alice);
    const a = await join(uuid, alice);
    const b = await join(uuid, bob);
    await setDocHost(uuid, b, bob.id);
    return { uuid, alice, bob, a };
  }

  it('lapses after 5 s without a holder socket, and the doc host claims it', async () => {
    const { uuid, alice, bob, a } = await bobElected();
    a.close();
    await a.closed();
    setNow(T0 + 4_999);
    expect(await patch(uuid, bob)).toEqual(NOT_HOST);
    setNow(T0 + 5_000);
    expect(await patch(uuid, bob)).toEqual(OK);
    expect(await patch(uuid, alice)).toEqual(NOT_HOST);
  });

  it('lapses with no close event at all: a creator that never connected', async () => {
    const [alice, bob] = [device('alice'), device('bob')];
    setNow(T0);
    const uuid = await createKeyed(alice);
    const b = await join(uuid, bob);
    await setDocHost(uuid, b, bob.id);
    setNow(T0 + 5_000);
    expect(await patch(uuid, bob)).toEqual(OK);
  });

  it('keeps the holder through a 4 s blip', async () => {
    const [alice, bob] = [device('alice'), device('bob')];
    setNow(T0);
    const uuid = await createKeyed(alice);
    const a = await join(uuid, alice);
    await join(uuid, bob);
    await setDocHost(uuid, a, alice.id);
    a.close();
    await a.closed();
    setNow(T0 + 4_000);
    await join(uuid, alice);
    setNow(T0 + 60_000);
    expect(await patch(uuid, alice)).toEqual(OK);
    expect(await patch(uuid, bob)).toEqual(NOT_HOST);
  });

  it('lapses when the holder comes back while the doc names another host', async () => {
    const { uuid, alice, bob, a } = await bobElected();
    a.close();
    await a.closed();
    setNow(T0 + 1_000);
    await join(uuid, alice);
    expect(await patch(uuid, alice)).toEqual(NOT_HOST);
    expect(await patch(uuid, bob)).toEqual(OK);
  });

  it('lets the doc host claim only while it has an open bound socket', async () => {
    const [alice, bob] = [device('alice'), device('bob')];
    setNow(T0);
    const uuid = await createKeyed(alice);
    const b = await join(uuid, bob);
    await setDocHost(uuid, b, bob.id);
    b.close();
    await b.closed();
    setNow(T0 + 5_000);
    expect(await patch(uuid, bob)).toEqual(NOT_HOST);
    await join(uuid, bob);
    expect(await patch(uuid, bob)).toEqual(OK);
  });
});

describe('handoff with the holder unset (ADR-0060)', () => {
  const T0 = Date.UTC(2026, 10, 11, 12);

  /** alice created and held, then lapsed; bob is the doc host, carol is connected. */
  async function lapsed(): Promise<{ uuid: string; alice: Device; bob: Device; carol: Device }> {
    const [alice, bob, carol] = [device('alice'), device('bob'), device('carol')];
    setNow(T0);
    const uuid = await createKeyed(alice);
    const a = await join(uuid, alice);
    const b = await join(uuid, bob);
    await join(uuid, carol);
    await setDocHost(uuid, b, bob.id);
    a.close();
    await a.closed();
    setNow(T0 + 5_000);
    return { uuid, alice, bob, carol };
  }

  it('lets the doc host claim and hand off, and not the old holder', async () => {
    const { uuid, alice, bob, carol } = await lapsed();
    expect(await handoff(uuid, bob, carol.id)).toEqual({
      status: 200,
      body: { accessHolder: carol.id },
    });
    expect(await holderOf(uuid)).toBe(carol.id);
    expect(await handoff(uuid, alice, bob.id)).toEqual(NOT_HOST);
  });

  it('refuses a caller that is not the doc host', async () => {
    const { uuid, bob, carol } = await lapsed();
    expect(await handoff(uuid, carol, bob.id)).toEqual(NOT_HOST);
    expect(await holderOf(uuid)).toBeNull();
  });

  it('refuses the doc host id with a wrong key, and a never-joined id, as unauthenticated', async () => {
    const { uuid, carol } = await lapsed();
    expect(await handoff(uuid, device('bob'), carol.id)).toEqual(UNAUTHENTICATED);
    expect(await handoff(uuid, device('mallory'), carol.id)).toEqual(UNAUTHENTICATED);
    expect(await holderOf(uuid)).toBeNull();
  });

  it('refuses a contested doc host', async () => {
    const { uuid, bob, carol } = await lapsed();
    const impostor = await join(uuid, device('bob'));
    expect(await handoff(uuid, bob, carol.id)).toEqual(NOT_HOST);
    impostor.close();
    await impostor.closed();
    expect((await handoff(uuid, bob, carol.id)).status).toBe(200);
  });

  it('refuses a doc host with no open bound socket', async () => {
    const [alice, bob, carol] = [device('alice'), device('bob'), device('carol')];
    setNow(T0);
    const uuid = await createKeyed(alice);
    const b = await join(uuid, bob);
    await join(uuid, carol);
    await setDocHost(uuid, b, bob.id);
    b.close();
    await b.closed();
    setNow(T0 + 5_000);
    expect(await handoff(uuid, bob, carol.id)).toEqual(NOT_HOST);
    expect(await holderOf(uuid)).toBeNull();
  });

  it('leaves the holder unset when the target is refused', async () => {
    const { uuid, bob, carol } = await lapsed();
    expect(await handoff(uuid, bob, device('dave').id)).toEqual(BAD_TARGET);
    expect(await holderOf(uuid)).toBeNull();
    expect(await handoff(uuid, bob, carol.id)).toEqual({
      status: 200,
      body: { accessHolder: carol.id },
    });
  });

  it('lets the keyed doc host of a keyless-created room hand off', async () => {
    const [bob, carol] = [device('bob'), device('carol')];
    const uuid = await createKeyless();
    const b = await join(uuid, bob);
    await join(uuid, carol);
    await setDocHost(uuid, b, bob.id);
    expect(await holderOf(uuid)).toBeNull();
    expect(await handoff(uuid, bob, carol.id)).toEqual({
      status: 200,
      body: { accessHolder: carol.id },
    });
  });
});

describe('binding', () => {
  it('admits a socket with a mismatched pk, but its id is contested while it is open', async () => {
    const [alice, bob] = [device('alice'), device('bob')];
    const uuid = await createKeyed(alice);
    await join(uuid, alice);
    await join(uuid, bob);
    const impostor = await join(uuid, device('bob'));
    expect(impostor.closeEvent).toBeNull();
    expect(await handoff(uuid, alice, bob.id)).toEqual(BAD_TARGET);

    const bare = await join(uuid, bob, null);
    impostor.close();
    await impostor.closed();
    expect(await handoff(uuid, alice, bob.id)).toEqual(BAD_TARGET);
    bare.close();
    await bare.closed();
    expect((await handoff(uuid, alice, bob.id)).status).toBe(200);
  });

  it('keeps a socket proven across a restart of the object', async () => {
    const [alice, bob] = [device('alice'), device('bob')];
    const uuid = await createKeyed(alice);
    await join(uuid, alice);
    await join(uuid, bob);
    await evictDurableObject(env.ROOM.get(env.ROOM.idFromName(uuid)));
    expect((await handoff(uuid, alice, bob.id)).status).toBe(200);
  });

  it('refuses a contested caller as not-host', async () => {
    const alice = device('alice');
    const uuid = await createKeyed(alice);
    const a = await join(uuid, alice);
    await setDocHost(uuid, a, alice.id);
    await join(uuid, device('alice'));
    expect(await patch(uuid, alice)).toEqual(NOT_HOST);
  });

  it('never binds a socket refused for its password', async () => {
    const [alice, carol, impostor] = [device('alice'), device('carol'), device('carol')];
    const res = await call('/rooms', {
      method: 'POST',
      body: JSON.stringify({
        passwordHash: HASH,
        creator: { participantId: alice.id, deviceKey: alice.deviceKey },
      }),
    });
    const { uuid } = (await res.json()) as { uuid: string };
    const pk = await pkOf(impostor, uuid);
    const refused = await Peer.join(uuid, `?pw=${'cd'.repeat(32)}&did=carol&pk=${pk}`);
    expect((await refused.closed()).code).toBe(4002);

    await Peer.join(uuid, `?pw=${HASH}&did=alice&pk=${await pkOf(alice, uuid)}`);
    await Peer.join(uuid, `?pw=${HASH}&did=carol&pk=${await pkOf(carol, uuid)}`);
    expect((await handoff(uuid, alice, carol.id)).status).toBe(200);
  });
});

describe('released-client grace', () => {
  it('lets a keyless create make one keyless PATCH, and no second', async () => {
    const uuid = await createKeyless();
    expect(await patch(uuid, null)).toEqual(OK);
    expect(await patch(uuid, null)).toEqual(UNAUTHENTICATED);
  });

  it('ends at 60 s, and once a socket was admitted', async () => {
    const T0 = Date.UTC(2026, 10, 11, 12);
    setNow(T0);
    const late = await createKeyless();
    setNow(T0 + 60_000);
    expect(await patch(late, null)).toEqual(UNAUTHENTICATED);

    const joined = await createKeyless();
    const peer = await Peer.join(joined);
    await peer.synced();
    expect(await patch(joined, null)).toEqual(UNAUTHENTICATED);
  });

  it('gives a room from before ADR-0059 no grace', async () => {
    const uuid = await createKeyless();
    const stub = env.ROOM.get(env.ROOM.idFromName(uuid));
    await runInDurableObject(stub, (_room, state) => {
      const meta = state.storage.kv.get<Record<string, unknown>>('meta')!;
      for (const field of ['accessHolder', 'holderAbsentSince', 'everAdmitted', 'keylessGrace']) {
        delete meta[field];
      }
      state.storage.kv.put('meta', meta);
    });
    await evictDurableObject(stub);
    expect(await patch(uuid, null)).toEqual(UNAUTHENTICATED);
  });
});

describe('POST /rooms validation', () => {
  it('refuses a malformed creator', async () => {
    for (const creator of [{ participantId: 'a' }, { participantId: '', deviceKey: HASH }, 'x']) {
      const res = await call('/rooms', { method: 'POST', body: JSON.stringify({ creator }) });
      expect(res.status, JSON.stringify(creator)).toBe(400);
    }
  });
});

describe('POST /rooms/:uuid/host', () => {
  it('moves the holder: the target can PATCH and the old holder cannot', async () => {
    const [alice, bob] = [device('alice'), device('bob')];
    const uuid = await createKeyed(alice);
    const a = await join(uuid, alice);
    await join(uuid, bob);
    expect(await handoff(uuid, alice, bob.id)).toEqual({
      status: 200,
      body: { accessHolder: bob.id },
    });
    await setDocHost(uuid, a, bob.id);
    expect(await patch(uuid, bob)).toEqual(OK);
    expect(await patch(uuid, alice)).toEqual(NOT_HOST);
  });

  it('refuses an unbound or offline target with 409, holder unchanged', async () => {
    const [alice, bob, carol] = [device('alice'), device('bob'), device('carol')];
    const uuid = await createKeyed(alice);
    const a = await join(uuid, alice);
    const b = await join(uuid, bob);
    await setDocHost(uuid, a, alice.id);
    expect(await handoff(uuid, alice, carol.id)).toEqual(BAD_TARGET);
    b.close();
    await eventually(async () => expect(await handoff(uuid, alice, bob.id)).toEqual(BAD_TARGET));
    expect(await patch(uuid, alice)).toEqual(OK);
  });

  it('is holder-only, and answers 404 for an unknown room', async () => {
    const [alice, bob] = [device('alice'), device('bob')];
    const uuid = await createKeyed(alice);
    await join(uuid, alice);
    await join(uuid, bob);
    expect(await handoff(uuid, bob, alice.id)).toEqual(NOT_HOST);
    expect(await handoff(crypto.randomUUID(), alice, bob.id)).toEqual({
      status: 404,
      body: { reason: 'unknown-room' },
    });
  });
});
