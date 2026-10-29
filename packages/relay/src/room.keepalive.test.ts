/**
 * Keepalive (contract item 9). y-websocket 3 reconnects a socket that received
 * no frame for 30 s; the Node relay renewed its own `{}` awareness state every
 * 15 s to every socket. The Worker piggybacks one renewal on inbound traffic to
 * a socket that has been sent nothing for 10 s.
 */

import { env } from 'cloudflare:workers';
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import * as decoding from 'lib0/decoding';
import { afterEach, describe, expect, it } from 'vitest';
import { KEEPALIVE_AFTER_MS, KEEPALIVE_ALARM_MS, keepaliveFallback, type RoomMeta } from './room';
import { Peer, createRoom, eventually, restoreClock, setNow } from './test-support/peer';

const HOUR_MS = 60 * 60 * 1000;
const settle = () => new Promise((r) => setTimeout(r, 50));

function roomStub(uuid: string) {
  return env.ROOM.get(env.ROOM.idFromName(uuid));
}

/** The entries of an awareness frame: [clientID, clock, state text]. */
function awarenessEntries(frame: Uint8Array): [number, number, string][] {
  const outer = decoding.createDecoder(frame);
  expect(decoding.readVarUint(outer)).toBe(1);
  const inner = decoding.createDecoder(decoding.readVarUint8Array(outer));
  const count = decoding.readVarUint(inner);
  return Array.from({ length: count }, () => [
    decoding.readVarUint(inner),
    decoding.readVarUint(inner),
    decoding.readVarString(inner),
  ]);
}

/** A room with `peers` joined at `t0`, each past its opening frames. */
async function roomAt(t0: number, peers: number): Promise<{ uuid: string; peers: Peer[] }> {
  setNow(t0);
  const { uuid } = await createRoom();
  const joined: Peer[] = [];
  for (let i = 0; i < peers; i++) {
    const peer = await Peer.join(uuid);
    // sync-step-1, presence, and the reply to the peer's own step 1
    await eventually(() => expect(peer.frames.length).toBeGreaterThanOrEqual(3));
    joined.push(peer);
  }
  return { uuid, peers: joined };
}

afterEach(() => {
  restoreClock();
  keepaliveFallback.enabled = false;
});

describe('piggyback keepalive', () => {
  it('(a) sends a lone socket exactly one relay frame when it renews 10 s after its last frame', async () => {
    const t0 = Date.now();
    const {
      peers: [alice],
    } = await roomAt(t0, 1);
    alice!.announce({ participantId: 'p-alice' });
    await settle();
    const mark = alice!.frames.length;

    setNow(t0 + KEEPALIVE_AFTER_MS);
    alice!.announce({ participantId: 'p-alice' });
    await eventually(() => expect(alice!.since(mark)).toHaveLength(1));

    const [frame] = alice!.since(mark);
    expect(frame!.type).toBe('awareness');
    // One entry: the relay's own `{}` state, which clients don't count as a peer.
    const entries = awarenessEntries(frame!.bytes);
    expect(entries).toHaveLength(1);
    expect(entries[0]![2]).toBe('{}');
    expect(alice!.participants()).toEqual([]);

    // Just sent: the next renewal gets nothing.
    setNow(t0 + KEEPALIVE_AFTER_MS + 1);
    alice!.announce({ participantId: 'p-alice' });
    await settle();
    expect(alice!.since(mark)).toHaveLength(1);
  });

  it('(b) sends nothing to a socket that got a peer update 3 s ago', async () => {
    const t0 = Date.now();
    const {
      peers: [alice, bob],
    } = await roomAt(t0, 2);

    setNow(t0 + 7_000);
    bob!.announce({ participantId: 'p-bob' });
    await eventually(() => expect(alice!.participants()).toEqual(['p-bob']));
    const mark = alice!.frames.length;

    setNow(t0 + 10_000);
    alice!.announce({ participantId: 'p-alice' });
    await eventually(() => expect(bob!.participants()).toEqual(['p-alice']));
    await settle();
    expect(alice!.since(mark)).toEqual([]);
  });

  it('(c) sends one on the first message after the room object restarted', async () => {
    const t0 = Date.now();
    const { uuid, peers } = await roomAt(t0, 1);
    const alice = peers[0]!;
    await evictDurableObject(roomStub(uuid));
    const mark = alice.frames.length;

    setNow(t0 + 1_000);
    alice.announce({ participantId: 'p-alice' });

    await eventually(() => expect(alice.since(mark)).toHaveLength(1));
    expect(awarenessEntries(alice.since(mark)[0]!.bytes).map((e) => e[2])).toEqual(['{}']);
  });

  it('keeps one relay client ID with a rising clock across a restart', async () => {
    const t0 = Date.now();
    const { uuid, peers } = await roomAt(t0, 1);
    const alice = peers[0]!;
    const [first] = awarenessEntries(alice.frames.find((f) => f.type === 'awareness')!.bytes);

    await evictDurableObject(roomStub(uuid));
    const mark = alice.frames.length;
    setNow(t0 + 2_000);
    alice.announce({ participantId: 'p-alice' });
    await eventually(() => expect(alice.since(mark)).toHaveLength(1));
    const [renewal] = awarenessEntries(alice.since(mark)[0]!.bytes);

    expect(renewal![0]).toBe(first![0]);
    expect(renewal![1]).toBeGreaterThan(first![1]);
  });
});

describe('keepalive alarm fallback (default off)', () => {
  async function stateOf(uuid: string): Promise<{ alarm: number | null; meta: RoomMeta }> {
    return runInDurableObject(roomStub(uuid), async (_room, state) => ({
      alarm: await state.storage.getAlarm(),
      meta: state.storage.kv.get<RoomMeta>('meta')!,
    }));
  }

  it('is off: an occupied room only has its hourly alarm', async () => {
    const t0 = Date.now();
    const { uuid } = await roomAt(t0, 1);
    expect((await stateOf(uuid)).alarm).toBe(t0 + HOUR_MS);
  });

  it('(d) when on, arms the alarm for an all-quiet room and keeps the TTL deadline', async () => {
    keepaliveFallback.enabled = true;
    const t0 = Date.now();
    const { uuid, peers } = await roomAt(t0, 2);
    expect((await stateOf(uuid)).alarm).toBe(t0 + KEEPALIVE_ALARM_MS);
    const marks = peers.map((p) => p.frames.length);

    setNow(t0 + KEEPALIVE_ALARM_MS);
    expect(await runDurableObjectAlarm(roomStub(uuid))).toBe(true);

    // Every quiet socket got one relay frame…
    await eventually(() => {
      peers.forEach((p, i) => expect(p.since(marks[i]!)).toHaveLength(1));
    });
    // …the alarm comes back for the next round, and occupancy was not
    // restamped, so the room's deadline is where the hourly check left it.
    const after = await stateOf(uuid);
    expect(after.alarm).toBe(t0 + 2 * KEEPALIVE_ALARM_MS);
    expect(after.meta.lastOccupiedAt).toBe(t0);

    // The hourly occupancy check still happens on its own schedule.
    setNow(t0 + HOUR_MS);
    await runDurableObjectAlarm(roomStub(uuid));
    expect((await stateOf(uuid)).meta.lastOccupiedAt).toBe(t0 + HOUR_MS);
  });
});
