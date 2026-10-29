/**
 * Persistence (contract item 10): updates fan out at once and reach storage
 * coalesced, so a busy room writes at most a few rows a minute. Storage rows
 * are what this item is about, so these tests read them.
 */

import { env } from 'cloudflare:workers';
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPACT_AFTER_ROWS,
  FLUSH_AFTER_MS,
  FLUSH_AT_BYTES,
  Room,
  SNAPSHOT_CHUNK_BYTES,
} from './room';
import { Peer, createRoom, eventually, restoreClock, setNow } from './test-support/peer';

const SETTLE_MS = 50;
const settle = () => new Promise((r) => setTimeout(r, SETTLE_MS));
const roomStub = (uuid: string) => env.ROOM.get(env.ROOM.idFromName(uuid));

async function rows(uuid: string): Promise<{ log: number; snapshot: number[] }> {
  return runInDurableObject(roomStub(uuid), (_room, state) => ({
    log: state.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM log').one().n,
    snapshot: state.storage.sql
      .exec<{ size: number }>('SELECT length(data) AS size FROM snapshot ORDER BY chunk')
      .toArray()
      .map((r) => r.size),
  }));
}

/**
 * What a peer joining after an eviction of the room object receives: returns
 * once the relay has answered its sync, so the doc holds all the relay loaded.
 */
async function reloaded(uuid: string): Promise<Peer> {
  await evictDurableObject(roomStub(uuid));
  const peer = await Peer.join(uuid);
  await peer.synced();
  return peer;
}

/**
 * `peer` pushes `n` votes. With an `observer`, returns once it has them: the
 * relay has then taken the updates in, at the clock of this moment — which the
 * flush rule reads, so tests must not move the clock before.
 */
async function edits(peer: Peer, n: number, prefix = 'v', observer?: Peer): Promise<void> {
  for (let i = 0; i < n; i++) peer.doc.getArray('votes').push([`${prefix}${i}`]);
  if (observer === undefined) {
    await settle();
    return;
  }
  const total = peer.doc.getArray('votes').length;
  await eventually(() => expect(observer.doc.getArray('votes').length).toBe(total), 5_000);
}

/**
 * Sends `from`'s awareness (an inbound event, so the relay checks its flush
 * rule) and returns once `observer` has it, by which time the relay has run
 * that check: it flushes in the same synchronous step that relays the frame.
 */
async function nudge(from: Peer, observer: Peer, round: number): Promise<void> {
  from.announce({ participantId: 'p-nudge', round });
  await eventually(
    () =>
      expect(observer.awareness.getStates().get(from.awareness.clientID)).toMatchObject({
        round,
      }),
    5_000,
  );
}

afterEach(() => {
  restoreClock();
  vi.restoreAllMocks();
});

describe('a reload', () => {
  it('gives the joiner the stored doc, however late the relay answers its sync', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    await edits(alice, 3);
    await runDurableObjectAlarm(roomStub(uuid));
    expect(await rows(uuid)).toEqual({ log: 1, snapshot: [] });

    // The reloaded object handles each frame later than any fixed wait in the
    // test, as it may on a loaded CI runner. Timers in this isolate fire in
    // order, so this holds every time.
    const handle = Room.prototype.webSocketMessage;
    vi.spyOn(Room.prototype, 'webSocketMessage').mockImplementation(async function (
      this: Room,
      ws,
      message,
    ) {
      await new Promise((r) => setTimeout(r, 4 * SETTLE_MS));
      return handle.call(this, ws, message);
    });

    expect((await reloaded(uuid)).doc.getArray('votes').length).toBe(3);
  });
});

describe('coalesced writes', () => {
  it('fans updates out at once and writes none of them yet', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    await edits(alice, 5);
    await eventually(() => expect(bob.doc.getArray('votes').length).toBe(5));
    expect(await rows(uuid)).toEqual({ log: 0, snapshot: [] });
  });

  it(`writes the buffer as one row once the oldest update is ${FLUSH_AFTER_MS / 1000} s old`, async () => {
    const t0 = Date.now();
    setNow(t0);
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    await edits(alice, 5);
    await nudge(alice, bob, 1);
    expect((await rows(uuid)).log).toBe(0);

    setNow(t0 + FLUSH_AFTER_MS);
    await nudge(alice, bob, 2);

    expect(await rows(uuid)).toEqual({ log: 1, snapshot: [] });
    expect((await reloaded(uuid)).doc.getArray('votes').length).toBe(5);
  });

  it('writes the buffer when the last socket closes', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    await edits(alice, 3);

    alice.close();
    await alice.closed();
    await settle();
    expect((await rows(uuid)).log).toBe(0);

    bob.close();
    await bob.closed();
    await settle();
    expect((await rows(uuid)).log).toBe(1);
  });

  it('writes the buffer when an alarm fires', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    await edits(alice, 3);
    await runDurableObjectAlarm(roomStub(uuid));
    expect((await rows(uuid)).log).toBe(1);
  });

  it(`writes the buffer once it reaches ${FLUSH_AT_BYTES / 1024} KiB`, async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    alice.doc.getText('notes').insert(0, 'x'.repeat(FLUSH_AT_BYTES));
    await eventually(async () => expect((await rows(uuid)).log).toBe(1));
  });
});

describe('compaction', () => {
  it(`folds the log into the snapshot past ${COMPACT_AFTER_ROWS} rows`, async () => {
    const t0 = Date.now();
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    for (let flush = 0; flush <= COMPACT_AFTER_ROWS; flush++) {
      setNow(t0 + flush * FLUSH_AFTER_MS);
      await edits(alice, 1, `f${flush}-`, bob);
      setNow(t0 + (flush + 1) * FLUSH_AFTER_MS);
      await nudge(alice, bob, flush);
      if (flush === COMPACT_AFTER_ROWS - 1) expect((await rows(uuid)).log).toBe(COMPACT_AFTER_ROWS);
    }

    const after = await rows(uuid);
    expect(after.log).toBe(0);
    expect(after.snapshot).toHaveLength(1);
    expect((await reloaded(uuid)).doc.getArray('votes').length).toBe(COMPACT_AFTER_ROWS + 1);
  });

  it('writes an update too large for one row as snapshot chunks of at most 1 MiB', async () => {
    const size = 2.5 * 1024 * 1024;
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    alice.doc.getText('notes').insert(0, 'x'.repeat(size));

    await eventually(async () => expect((await rows(uuid)).snapshot).toHaveLength(3));
    const { log, snapshot } = await rows(uuid);
    expect(log).toBe(0);
    for (const chunk of snapshot) expect(chunk).toBeLessThanOrEqual(SNAPSHOT_CHUNK_BYTES);

    const carol = await reloaded(uuid);
    expect(carol.doc.getText('notes').length).toBe(size);
  });
});

describe('when storage writes fail', () => {
  it('keeps relaying, closes nothing, and writes the whole doc once storage is back', async () => {
    const t0 = Date.now();
    setNow(t0);
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    await settle();

    await runInDurableObject(roomStub(uuid), (_room, state) => {
      // Each `storage.sql` access may be a new wrapper; fail them all.
      vi.spyOn(Object.getPrototypeOf(state.storage.sql), 'exec').mockImplementation(() => {
        throw new Error('SQLITE_IOERR');
      });
    });
    await edits(alice, 3, 'lost-', bob);
    setNow(t0 + FLUSH_AFTER_MS);
    await nudge(alice, bob, 1);
    expect(bob.doc.getArray('votes').length).toBe(3);
    expect(alice.closeEvent).toBeNull();
    expect(bob.closeEvent).toBeNull();

    vi.restoreAllMocks();
    await edits(alice, 1, 'after-', bob);
    setNow(t0 + 2 * FLUSH_AFTER_MS);
    await nudge(alice, bob, 2);

    expect((await rows(uuid)).snapshot).toHaveLength(1);
    const carol = await reloaded(uuid);
    expect(carol.doc.getArray('votes').toArray()).toEqual([
      'lost-0',
      'lost-1',
      'lost-2',
      'after-0',
    ]);
  });
});
