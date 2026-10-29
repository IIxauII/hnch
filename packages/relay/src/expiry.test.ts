/**
 * The Expiry backstop (contract item 11): rooms are listed under their UTC
 * creation day, the 04:00 UTC cron sweeps the last 30 days, and a room a sweep
 * finds live moves to that day.
 */

import { env } from 'cloudflare:workers';
import { createScheduledController, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';
import { OCCUPANCY_CHECK_MS, ROOM_TTL_MS, type RoomMeta } from './room';
import { utcDay } from './stubs';
import { createRoom, restoreClock, setNow } from './test-support/peer';
import { SWEEP_DAYS } from './worker';
import { SWEEP_BATCH, type Expiry } from './expiry';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEADLINE_MS = ROOM_TTL_MS + OCCUPANCY_CHECK_MS;

const expiryStub = (day: string) => env.EXPIRY.get(env.EXPIRY.idFromName(day));
const roomStub = (uuid: string) => env.ROOM.get(env.ROOM.idFromName(uuid));

async function listed(day: string): Promise<string[]> {
  return runInDurableObject(expiryStub(day), (_e, state) =>
    [...state.storage.kv.list({ prefix: 'room:' })].map(([k]) => k.slice('room:'.length)),
  );
}

async function exists(uuid: string): Promise<boolean> {
  return runInDurableObject(
    roomStub(uuid),
    (_r, state) => state.storage.kv.get<RoomMeta>('meta') !== undefined,
  );
}

/**
 * Midnight UTC `days` after 2040-01-01, plus `ms`. In the future, so the rooms'
 * real alarms (scheduled from this clock) never fire during the test.
 */
function at(days: number, ms = 0): number {
  return Date.UTC(2040, 0, 1) + days * DAY_MS + ms;
}

afterEach(() => {
  restoreClock();
  vi.restoreAllMocks();
});

describe('Expiry', () => {
  it('lists a new room under its UTC creation day', async () => {
    setNow(at(10, 23 * 60 * 60 * 1000));
    const { uuid } = await createRoom();
    expect(await listed(utcDay(at(10)))).toContain(uuid);
  });

  it('deletes due rooms, forgets deleted and gone ones, moves live ones to today', async () => {
    setNow(at(20));
    const due = await createRoom();
    setNow(at(20, DAY_MS / 2));
    const live = await createRoom();
    const day = utcDay(at(20));
    const gone = crypto.randomUUID();
    await expiryStub(day).register(gone);

    setNow(at(20, DEADLINE_MS));
    const today = utcDay(at(21));
    expect(await expiryStub(day).sweep(today)).toEqual({
      deleted: 1,
      gone: 1,
      moved: 1,
      live: 0,
      failed: 0,
    });

    expect(await exists(due.uuid)).toBe(false);
    expect(await exists(live.uuid)).toBe(true);
    expect(await listed(day)).toEqual([]);
    expect(await listed(today)).toEqual([live.uuid]);
  });

  it('keeps a room that failed to move listed where it was, and moves it next time', async () => {
    setNow(at(300, 23 * HOUR_MS));
    const { uuid } = await createRoom();
    const day = utcDay(at(300));
    const today = utcDay(at(301));
    // Spied on the prototype: RPC refuses a method that is an own property.
    const proto = await runInDurableObject(
      expiryStub(day),
      (e) => Object.getPrototypeOf(e) as Expiry,
    );
    const register = vi.spyOn(proto, 'register').mockImplementation(() => {
      throw new Error('Durable Object is overloaded');
    });
    const logged = vi.spyOn(console, 'error');

    setNow(at(301, 4 * HOUR_MS));
    expect(await expiryStub(day).sweep(today)).toMatchObject({ moved: 0, live: 1 });
    expect(logged.mock.calls.map((c) => String(c[0]))).toContainEqual(
      expect.stringContaining('room-relist-failed'),
    );
    expect(await listed(day)).toEqual([uuid]);

    register.mockRestore();
    expect(await expiryStub(day).sweep(today)).toMatchObject({ moved: 1, live: 0 });
    expect(await listed(day)).toEqual([]);
    expect(await listed(today)).toEqual([uuid]);
  });

  it(`works through more than ${SWEEP_BATCH} rooms over successive sweeps`, async () => {
    const day = utcDay(at(60));
    const total = SWEEP_BATCH + 5;
    for (let i = 0; i < total; i++) await expiryStub(day).register(crypto.randomUUID());
    // 40 live rooms would come first on every sweep if the sweep did not page.
    const first = await expiryStub(day).sweep(utcDay(at(61)));
    expect(first.gone).toBe(SWEEP_BATCH);
    const second = await expiryStub(day).sweep(utcDay(at(61)));
    expect(second.gone).toBe(5);
    expect(await listed(day)).toEqual([]);
  });

  it('frees its own storage once every room is dealt with', async () => {
    setNow(at(40));
    const { uuid } = await createRoom();
    const day = utcDay(at(40));
    setNow(at(40, DEADLINE_MS));
    await expiryStub(day).sweep(utcDay(at(41)));
    expect(await exists(uuid)).toBe(false);
    expect(await listed(day)).toEqual([]);
  });
});

describe('daily cron', () => {
  it(`sweeps each of the last ${SWEEP_DAYS} days, not today and not older`, async () => {
    const today = 100;
    const rooms = new Map<number, string>();
    for (const daysAgo of [0, 1, SWEEP_DAYS, SWEEP_DAYS + 1]) {
      setNow(at(today - daysAgo));
      rooms.set(daysAgo, (await createRoom()).uuid);
    }

    // Long past every deadline, so only the sweep decides which rooms go.
    setNow(at(today + 400));
    await worker.scheduled(
      createScheduledController({ scheduledTime: at(today, 4 * 60 * 60 * 1000) }),
      env,
    );

    for (const [daysAgo, uuid] of rooms) {
      const remainsListed = (await listed(utcDay(at(today - daysAgo)))).includes(uuid);
      expect(remainsListed, `${daysAgo} days ago`).toBe(
        daysAgo === 0 || daysAgo === SWEEP_DAYS + 1,
      );
    }
  });

  it(`keeps sweeping a room that lives past ${SWEEP_DAYS} days`, async () => {
    // Created late on day 200, so the day-201 sweep finds it live and moves it.
    setNow(at(200, 23 * HOUR_MS));
    const { uuid } = await createRoom();
    const cron = async (day: number) => {
      setNow(at(day, 4 * HOUR_MS));
      await worker.scheduled(
        createScheduledController({ scheduledTime: at(day, 4 * HOUR_MS) }),
        env,
      );
    };

    await cron(201);
    expect(await exists(uuid)).toBe(true);
    expect(await listed(utcDay(at(200)))).toEqual([]);
    expect(await listed(utcDay(at(201)))).toEqual([uuid]);

    // Day 200 is out of the day-231 sweep's window; day 201 is its oldest day.
    await cron(200 + SWEEP_DAYS + 1);
    expect(await exists(uuid)).toBe(false);
    expect(await listed(utcDay(at(201)))).toEqual([]);
  });
});
