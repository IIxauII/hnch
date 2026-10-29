/**
 * TTL and deletion (contract item 11, ADR-0012): a room is deleted 24–25 h
 * after it was last occupied, whether or not its alarm survives.
 */

import { env } from 'cloudflare:workers';
import {
  createScheduledController,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';
import { OCCUPANCY_CHECK_MS, REARM_CHECK_MS, RETRY_MS, ROOM_TTL_MS, type RoomMeta } from './room';
import {
  Peer,
  call,
  createRoom,
  eventually,
  restoreClock,
  setNow,
  upgrade,
} from './test-support/peer';

const HOUR_MS = 60 * 60 * 1000;
const DEADLINE_MS = ROOM_TTL_MS + OCCUPANCY_CHECK_MS;

const roomStub = (uuid: string) => env.ROOM.get(env.ROOM.idFromName(uuid));
const codesStub = (code: string) => env.CODES.get(env.CODES.idFromName(code));

async function status(code: string): Promise<number> {
  return (await call(`/rooms/${code}`)).status;
}

async function alarmOf(uuid: string): Promise<number | null> {
  return runInDurableObject(roomStub(uuid), (_room, state) => state.storage.getAlarm());
}

async function metaOf(uuid: string): Promise<RoomMeta | undefined> {
  return runInDurableObject(roomStub(uuid), (_room, state) =>
    state.storage.kv.get<RoomMeta>('meta'),
  );
}

/** Rows of doc content the room holds (log plus snapshot). */
async function docRows(uuid: string): Promise<number> {
  return runInDurableObject(roomStub(uuid), (_room, state) =>
    ['log', 'snapshot']
      .map((t) => state.storage.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`).one().n)
      .reduce((a, b) => a + b, 0),
  );
}

/** Runs the room's alarm, which may throw. */
async function fireAlarm(uuid: string): Promise<void> {
  try {
    await runDurableObjectAlarm(roomStub(uuid));
  } catch {
    // A throwing alarm is what some tests are about.
  }
}

/** Makes the code's `release` fail until the returned restore is called. */
async function failRelease(code: string): Promise<() => Promise<void>> {
  await runInDurableObject(codesStub(code), (codes) => {
    vi.spyOn(codes, 'release').mockRejectedValue(new Error('Durable Object is overloaded'));
  });
  return () =>
    runInDurableObject(codesStub(code), (codes) => {
      vi.mocked(codes.release).mockRestore();
    });
}

afterEach(() => {
  restoreClock();
  vi.restoreAllMocks();
});

describe('room TTL', () => {
  it('checks occupancy an hour after creation', async () => {
    const t0 = Date.now();
    setNow(t0);
    const { uuid } = await createRoom();
    expect(await alarmOf(uuid)).toBe(t0 + HOUR_MS);
    expect((await metaOf(uuid))?.schemaVersion).toBe(1);
  });

  it('deletes a room nobody joined at about 25 h, and frees its code', async () => {
    const t0 = Date.now();
    setNow(t0);
    const { uuid, code } = await createRoom();

    setNow(t0 + HOUR_MS);
    await fireAlarm(uuid);
    expect(await alarmOf(uuid)).toBe(t0 + DEADLINE_MS);

    setNow(t0 + DEADLINE_MS - 1);
    expect(await status(code)).toBe(200);

    setNow(t0 + DEADLINE_MS);
    await fireAlarm(uuid);
    expect(await metaOf(uuid)).toBeUndefined();
    expect(await status(code)).toBe(404);
    expect(await codesStub(code).lookup()).toBeNull();
  });

  it('stamps occupancy hourly while sockets are open', async () => {
    const t0 = Date.now();
    setNow(t0);
    const { uuid } = await createRoom();
    await Peer.join(uuid);

    setNow(t0 + 5 * HOUR_MS);
    await fireAlarm(uuid);
    expect((await metaOf(uuid))?.lastOccupiedAt).toBe(t0 + 5 * HOUR_MS);
    expect(await alarmOf(uuid)).toBe(t0 + 6 * HOUR_MS);
  });

  it('keeps a room re-occupied at 23 h for a full TTL after its peer left', async () => {
    const t0 = Date.now();
    setNow(t0);
    const { uuid, code } = await createRoom();

    setNow(t0 + 23 * HOUR_MS);
    const alice = await Peer.join(uuid);
    await eventually(() => expect(alice.frames.length).toBeGreaterThanOrEqual(2));
    // The alarm comes in to an hour from the join.
    expect(await alarmOf(uuid)).toBeLessThanOrEqual(t0 + 24 * HOUR_MS);
    setNow(t0 + 23.5 * HOUR_MS);
    alice.close();
    await alice.closed();

    setNow(t0 + 24 * HOUR_MS);
    await fireAlarm(uuid);
    setNow(t0 + 25 * HOUR_MS);
    await fireAlarm(uuid);
    expect(await status(code)).toBe(200);

    // 24 h after the peer left, the room goes on the next check.
    setNow(t0 + 23 * HOUR_MS + DEADLINE_MS);
    expect(await status(code)).toBe(404);
  });

  it('expires lazily on entry when the alarm gave up after its retries', async () => {
    const t0 = Date.now();
    setNow(t0);
    const { uuid, code } = await createRoom();
    // After 7 failed runs the platform drops the alarm.
    await runInDurableObject(roomStub(uuid), (_room, state) => state.storage.deleteAlarm());

    setNow(t0 + DEADLINE_MS);
    expect(await status(code)).toBe(404);
    expect((await upgrade(uuid)).status).toBe(404);
    expect(await codesStub(code).lookup()).toBeNull();
    expect(await metaOf(uuid)).toBeUndefined();
  });

  it('never expires a room with a socket open, however old its occupancy stamp', async () => {
    const t0 = Date.now();
    setNow(t0);
    const { uuid, code } = await createRoom();
    const alice = await Peer.join(uuid);
    await eventually(() => expect(alice.frames.length).toBeGreaterThanOrEqual(2));
    await runInDurableObject(roomStub(uuid), (_room, state) => state.storage.deleteAlarm());

    setNow(t0 + 3 * DEADLINE_MS);
    expect(await status(code)).toBe(200);
    expect(await roomStub(uuid).expireIfDue()).toBe('live');
    expect(alice.closeEvent).toBeNull();
  });

  it('is deleted by the daily sweep when the alarm gave up and nobody comes back', async () => {
    const t0 = Date.now();
    setNow(t0);
    const { uuid, code } = await createRoom();
    await runInDurableObject(roomStub(uuid), (_room, state) => state.storage.deleteAlarm());

    setNow(t0 + DEADLINE_MS);
    await worker.scheduled(createScheduledController({ scheduledTime: t0 + 2 * DEADLINE_MS }), env);

    expect(await metaOf(uuid)).toBeUndefined();
    expect(await codesStub(code).lookup()).toBeNull();
  });

  it('retries a throwing alarm in 10 minutes', async () => {
    const t0 = Date.now();
    setNow(t0);
    const { uuid } = await createRoom();
    await runInDurableObject(roomStub(uuid), (_room, state) => {
      vi.spyOn(state.storage.kv, 'put').mockImplementation(() => {
        throw new Error('SQLITE_FULL');
      });
    });
    await Peer.join(uuid);

    setNow(t0 + HOUR_MS);
    await fireAlarm(uuid);
    expect(await alarmOf(uuid)).toBe(t0 + HOUR_MS + RETRY_MS);
  });

  it('re-arms on the next entry when storage failed the alarm and its retry', async () => {
    const t0 = Date.now();
    setNow(t0);
    const { uuid, code } = await createRoom();
    await runInDurableObject(roomStub(uuid), (_room, state) => {
      vi.spyOn(state.storage, 'setAlarm').mockRejectedValue(new Error('storage unavailable'));
    });

    setNow(t0 + HOUR_MS);
    await fireAlarm(uuid);
    expect(await alarmOf(uuid)).toBeNull();

    vi.restoreAllMocks();
    setNow(t0 + HOUR_MS + REARM_CHECK_MS);
    expect(await status(code)).toBe(200);
    expect(await alarmOf(uuid)).toBe(t0 + HOUR_MS + REARM_CHECK_MS + HOUR_MS);
  });
});

describe('deletion', () => {
  it('answers unknown between the tombstone and the code release, then retries the release', async () => {
    const t0 = Date.now();
    setNow(t0);
    const { uuid, code } = await createRoom();
    const alice = await Peer.join(uuid);
    alice.doc.getArray('votes').push(['5']);
    await new Promise((r) => setTimeout(r, 50));
    alice.close();
    await alice.closed();
    await new Promise((r) => setTimeout(r, 50));
    expect(await docRows(uuid)).toBe(1);
    const restoreRelease = await failRelease(code);

    setNow(t0 + DEADLINE_MS);
    expect(await status(code)).toBe(404);
    expect((await upgrade(uuid)).status).toBe(404);
    expect((await metaOf(uuid))?.tombstonedAt).toBe(t0 + DEADLINE_MS);
    // The content went with the tombstone; the code is still held, and a retry
    // is scheduled.
    expect(await docRows(uuid)).toBe(0);
    expect(await codesStub(code).lookup()).toBe(uuid);
    expect(await alarmOf(uuid)).toBe(t0 + DEADLINE_MS + RETRY_MS);

    await restoreRelease();
    setNow(t0 + DEADLINE_MS + RETRY_MS);
    await fireAlarm(uuid);
    expect(await codesStub(code).lookup()).toBeNull();
    expect(await metaOf(uuid)).toBeUndefined();
  });

  it('lets a new room claim the code of a tombstoned one', async () => {
    const t0 = Date.now();
    setNow(t0);
    const { uuid, code } = await createRoom();
    await failRelease(code);
    setNow(t0 + DEADLINE_MS);
    expect(await status(code)).toBe(404);

    const next = crypto.randomUUID();
    expect(await codesStub(code).claim(next)).toBe(true);
    expect(await codesStub(code).lookup()).toBe(next);
    expect(uuid).not.toBe(next);
  });
});
