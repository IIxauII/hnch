/**
 * A refused join (wrong password, room full) as workerd runs it: the client
 * gets its close code and the relay logs no error for it.
 *
 * workerd ≤ 1.20261019.1 reports a plain-accepted Durable Object socket's end
 * as the invocation's uncaught "Network connection lost."
 * (cloudflare/workerd#5290), so `refuse()` must not use a plain accept. The
 * in-process worker tests can't see that log line; this runs the real process.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestRelay } from './start-relay.mjs';
import type { TestRelay } from './start-relay.d.mts';

const HASH = 'ab'.repeat(32);
const WRONG = 'cd'.repeat(32);
const CAP = 3;
/** After the marker shows up, how long a late error line gets to arrive. */
const SETTLE_MS = 1_500;
const NETWORK_LOST = /Network connection lost/;

let relay: TestRelay;

beforeAll(async () => {
  relay = await startTestRelay({ roomCap: CAP });
}, 60_000);

afterAll(async () => {
  await relay?.stop();
}, 60_000);

interface Socket {
  readonly ws: WebSocket;
  readonly opened: Promise<void>;
  readonly closed: Promise<{ code: number; reason: string }>;
}

function connect(uuid: string, query = ''): Socket {
  const ws = new WebSocket(`${relay.wsUrl}/ws/${uuid}${query}`);
  ws.binaryType = 'arraybuffer';
  ws.addEventListener('error', () => {});
  const opened = new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('close', () => reject(new Error('closed before open')));
  });
  opened.catch(() => {});
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.addEventListener('close', (e) => resolve({ code: e.code, reason: e.reason }));
  });
  return { ws, opened, closed };
}

async function createRoom(body: Record<string, unknown> = {}): Promise<string> {
  const res = await fetch(`${relay.httpUrl}/rooms`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { uuid: string }).uuid;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('a refused join', () => {
  it('closes 4002 and 4006 without the relay logging an error', async () => {
    const locked = await createRoom({ passwordHash: HASH });
    expect(await connect(locked, `?pw=${WRONG}`).closed).toEqual({
      code: 4002,
      reason: 'wrong-password',
    });

    const open = await createRoom();
    const seated = Array.from({ length: CAP }, () => connect(open));
    await Promise.all(seated.map((s) => s.opened));
    expect(await connect(open).closed).toEqual({ code: 4006, reason: 'room-full' });

    // A marker through the same log path, sent after both refusals have
    // closed: a truncated awareness frame makes the relay log
    // `room-frame-rejected`. Once it is in the output, the pipe is live and any
    // error from the refusals has had its turn; then allow a little more.
    const marker = seated[0]!;
    marker.ws.send(new Uint8Array([1]));
    expect((await marker.closed).code).toBe(1003);
    const deadline = Date.now() + 10_000;
    while (!relay.output().includes('room-frame-rejected') && Date.now() < deadline) {
      await sleep(50);
    }
    expect(relay.output().includes('room-frame-rejected'), 'marker logged').toBe(true);
    await sleep(SETTLE_MS);

    for (const s of seated) s.ws.close(1000);
    // Only the offending lines, if any, so a failure doesn't dump the log.
    const lost = relay
      .output()
      .split('\n')
      .filter((line) => NETWORK_LOST.test(line))
      .map((line) => line.trim());
    expect(lost).toEqual([]);
  });
});
