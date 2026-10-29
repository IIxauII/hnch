/**
 * Security properties of the relay that no functional test would notice
 * losing: the password compare stays constant-time, the hash clients send never
 * reaches storage, and nothing a peer sends reaches the logs.
 */

import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { passwordDigest } from './digest';
import type { RoomMeta } from './room';
import { Peer, call, createRoom, upgrade } from './test-support/peer';

const HASH = 'ab'.repeat(32);
const roomStub = (uuid: string) => env.ROOM.get(env.ROOM.idFromName(uuid));

afterEach(() => vi.restoreAllMocks());

describe('password check', () => {
  it('compares two 32-byte digests in constant time, whatever pw is', async () => {
    const { uuid } = await createRoom({ passwordHash: HASH });
    const compare = vi.spyOn(crypto.subtle, 'timingSafeEqual');

    for (const pw of [HASH, 'cd'.repeat(32), 'short', 'x'.repeat(300)]) {
      compare.mockClear();
      const res = await upgrade(uuid, `?pw=${pw}`);
      expect(res.status, pw.slice(0, 8)).toBe(101);
      res.webSocket?.accept();
      res.webSocket?.close();
      expect(compare, pw.slice(0, 8)).toHaveBeenCalledTimes(1);
      const [a, b] = compare.mock.calls[0]! as [ArrayBufferView, ArrayBufferView];
      expect([a.byteLength, b.byteLength]).toEqual([32, 32]);
    }
  });
});

describe('password at rest', () => {
  /** Every value the room holds in storage, as text. */
  async function storedText(uuid: string): Promise<string> {
    return runInDurableObject(roomStub(uuid), (_room, state) => {
      const parts = [...state.storage.kv.list()].map(([key, value]) =>
        JSON.stringify([key, value]),
      );
      for (const table of ['log', 'snapshot']) {
        for (const row of state.storage.sql.exec(`SELECT data FROM ${table}`)) {
          parts.push(new TextDecoder().decode(row['data'] as ArrayBuffer));
        }
      }
      return parts.join('\n');
    });
  }

  it('stores only the digest, after a create and after a password change', async () => {
    const { uuid } = await createRoom({ passwordHash: HASH });
    let stored = await storedText(uuid);
    expect(stored).not.toContain(HASH);
    expect(stored).toContain(await passwordDigest(uuid, HASH));

    const other = 'ef'.repeat(32);
    await call(`/rooms/${uuid}/access`, {
      method: 'PATCH',
      body: JSON.stringify({ passwordHash: other }),
    });
    stored = await storedText(uuid);
    expect(stored).not.toContain(other);
    const meta = await runInDurableObject(roomStub(uuid), (_room, state) =>
      state.storage.kv.get<RoomMeta>('meta'),
    );
    expect(meta?.digest).toBe(await passwordDigest(uuid, other));
  });
});

describe('logs', () => {
  it('never carry what a peer sent, even in a frame the relay rejects', async () => {
    const logged = vi.spyOn(console, 'error');
    const { uuid } = await createRoom();
    const peer = await Peer.join(uuid);
    const marker = 'Alice-Marker-7f3a';
    // An awareness frame whose state is not JSON, and quotes the marker.
    const state = new TextEncoder().encode(`{${marker}`);
    peer.send(new Uint8Array([1, state.length + 4, 1, 9, 1, state.length, ...state]));

    expect((await peer.closed()).code).toBe(1003);
    const lines = logged.mock.calls.map((args) => args.join(' '));
    expect(lines.some((l) => l.includes('room-frame-rejected'))).toBe(true);
    expect(lines.filter((l) => l.includes(marker))).toEqual([]);
  });
});
