/**
 * A password changed while a join's password is being checked (contract item
 * 16): the join must be judged against the password in force when it is
 * admitted, not the one the check started with.
 */

import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Peer, call, createRoom, eventually, upgrade } from './test-support/peer';

const OLD = 'ab'.repeat(32);
const NEW = 'cd'.repeat(32);

/**
 * A held digest: `reached()` resolves once a caller is waiting on it, and
 * `release()` lets that caller go on. `reached` polls rather than awaiting a
 * promise, since the caller runs in the room's request context, not the test's.
 */
interface Hold {
  reached: () => Promise<void>;
  release: () => void;
}

/** Holds the first digest back, i.e. the join's check, until `release()`. */
function holdFirstDigest(): Hold {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = crypto.subtle.digest.bind(crypto.subtle);
  let first = true;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    if (first) {
      first = false;
      await gate;
    }
    return original(...args);
  });
  return { reached: () => eventually(() => expect(first).toBe(false)), release };
}

async function setPassword(uuid: string, passwordHash: string | null): Promise<void> {
  const res = await call(`/rooms/${uuid}/access`, {
    method: 'PATCH',
    body: JSON.stringify({ passwordHash }),
  });
  expect(res.status).toBe(200);
}

afterEach(() => vi.restoreAllMocks());

describe('a join whose password is checked while the password changes', () => {
  it('is refused if the old password no longer is the room password', async () => {
    const { uuid } = await createRoom({ passwordHash: OLD });
    const hold = holdFirstDigest();

    const joining = Peer.join(uuid, `?pw=${OLD}`);
    await hold.reached();
    await setPassword(uuid, NEW);
    hold.release();

    const peer = await joining;
    expect(await peer.closed()).toEqual({ code: 4002, reason: 'wrong-password' });
  });

  it('is admitted if the room became open', async () => {
    const { uuid } = await createRoom({ passwordHash: OLD });
    const hold = holdFirstDigest();

    const joining = Peer.join(uuid, `?pw=${NEW}`);
    await hold.reached();
    await setPassword(uuid, null);
    hold.release();

    const peer = await joining;
    await eventually(() => expect(peer.frames.length).toBeGreaterThanOrEqual(2));
    expect(peer.closeEvent).toBeNull();
  });

  it('is admitted if the new password is the one it sent', async () => {
    const { uuid } = await createRoom({ passwordHash: OLD });
    const hold = holdFirstDigest();

    const joining = Peer.join(uuid, `?pw=${NEW}`);
    await hold.reached();
    await setPassword(uuid, NEW);
    hold.release();

    const peer = await joining;
    await eventually(() => expect(peer.frames.length).toBeGreaterThanOrEqual(2));
    expect(peer.closeEvent).toBeNull();
  });
});

/** Arms a one-shot hold on the next digest, whichever caller reaches it. */
function holdNextDigest(): () => Hold {
  let armed: Promise<void> | null = null;
  const original = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const hold = armed;
    armed = null;
    if (hold !== null) await hold;
    return original(...args);
  });
  return () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    armed = gate;
    return { reached: () => eventually(() => expect(armed).not.toBe(gate)), release };
  };
}

describe('a password that keeps changing during the check', () => {
  it('is refused 4002 once the checks run out', async () => {
    const { uuid } = await createRoom({ passwordHash: OLD });
    const arm = holdNextDigest();

    const check1 = arm();
    // The joiner sends the password of the second change, so its last (stale)
    // check matches while the third is in force; it must still not be admitted.
    const joining = Peer.join(uuid, `?pw=${'02'.repeat(32)}`);
    await check1.reached();
    await setPassword(uuid, '01'.repeat(32));
    const check2 = arm();
    check1.release();
    await check2.reached();
    await setPassword(uuid, '02'.repeat(32));
    const check3 = arm();
    check2.release();
    await check3.reached();
    await setPassword(uuid, '03'.repeat(32));
    check3.release();

    const peer = await joining;
    expect(await peer.closed()).toEqual({ code: 4002, reason: 'wrong-password' });
  });
});

describe('a room deleted during the password check', () => {
  it('answers a plain 404 instead of admitting the join', async () => {
    const { uuid } = await createRoom({ passwordHash: OLD });
    const hold = holdFirstDigest();

    const joining = upgrade(uuid, `?pw=${OLD}`);
    await hold.reached();
    const stub = env.ROOM.get(env.ROOM.idFromName(uuid));
    await runInDurableObject(stub, (room) => room.testEvict());
    hold.release();

    expect((await joining).status).toBe(404);
  });
});
