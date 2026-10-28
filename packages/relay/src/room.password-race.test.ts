/**
 * A password changed while a join's password is being checked (contract item
 * 16): the join must be judged against the password in force when it is
 * admitted, not the one the check started with.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Peer, call, createRoom, eventually } from './test-support/peer';

const OLD = 'ab'.repeat(32);
const NEW = 'cd'.repeat(32);

/** Holds the first digest back, i.e. the join's check, until `release()`. */
function holdFirstDigest(): { release: () => void } {
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
  return { release };
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
    await new Promise((r) => setTimeout(r, 50));
    await setPassword(uuid, NEW);
    hold.release();

    const peer = await joining;
    expect(await peer.closed()).toEqual({ code: 4002, reason: 'wrong-password' });
  });

  it('is admitted if the room became open', async () => {
    const { uuid } = await createRoom({ passwordHash: OLD });
    const hold = holdFirstDigest();

    const joining = Peer.join(uuid, `?pw=${NEW}`);
    await new Promise((r) => setTimeout(r, 50));
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
    await new Promise((r) => setTimeout(r, 50));
    await setPassword(uuid, NEW);
    hold.release();

    const peer = await joining;
    await eventually(() => expect(peer.frames.length).toBeGreaterThanOrEqual(2));
    expect(peer.closeEvent).toBeNull();
  });
});
