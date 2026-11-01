/**
 * A refused join (wrong password, room full) as workerd runs it: the client
 * gets its close code at once and the relay logs no error for it.
 *
 * Both halves need the real process. workerd ≤ 1.20261019.1 reports a
 * plain-accepted Durable Object socket's end as the invocation's uncaught
 * "Network connection lost." (cloudflare/workerd#5290), and the in-process
 * worker tests can't see that log line. And a hibernatable socket closed by the
 * relay before its client's first frame has arrived keeps its TCP connection
 * for about 10 s after the closing handshake (#577), which only shows across a
 * socket: a client that waits for the server to end the connection, as Node's
 * WebSocket does, sees the close that late.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestRelay } from './start-relay.mjs';
import type { TestRelay } from './start-relay.d.mts';

const HASH = 'ab'.repeat(32);
const WRONG = 'cd'.repeat(32);
const CAP = 3;
/** After the marker shows up, how long a late error line gets to arrive. */
const SETTLE_MS = 1_500;
/** A refusal's close has to reach the client within this (#577). */
const CLOSE_WITHIN_MS = 1_000;
const NETWORK_LOST = /Network connection lost/;
/** y-websocket's first frame on open: sync-step-1 with an empty state vector. */
const SYNC_STEP_1 = new Uint8Array([0, 0, 1, 0]);

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
  /** Milliseconds from connecting to the close event. */
  readonly closedAfter: () => number;
}

/** Connects as a client does: its first frame on open is a sync-step-1. */
function connect(uuid: string, query = ''): Socket {
  const started = performance.now();
  let closedAt = Number.NaN;
  const ws = new WebSocket(`${relay.wsUrl}/ws/${uuid}${query}`);
  ws.binaryType = 'arraybuffer';
  ws.addEventListener('error', () => {});
  const opened = new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => {
      ws.send(SYNC_STEP_1);
      resolve();
    });
    ws.addEventListener('close', () => reject(new Error('closed before open')));
  });
  opened.catch(() => {});
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.addEventListener('close', (e) => {
      closedAt = performance.now();
      resolve({ code: e.code, reason: e.reason });
    });
  });
  return { ws, opened, closed, closedAfter: () => closedAt - started };
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
  it('closes 4002 and 4006 within a second, without the relay logging an error', async () => {
    const locked = await createRoom({ passwordHash: HASH });
    const wrong = connect(locked, `?pw=${WRONG}`);
    expect(await wrong.closed).toEqual({ code: 4002, reason: 'wrong-password' });
    expect(wrong.closedAfter()).toBeLessThan(CLOSE_WITHIN_MS);

    const open = await createRoom();
    const seated = Array.from({ length: CAP }, () => connect(open));
    await Promise.all(seated.map((s) => s.opened));
    const extra = connect(open);
    expect(await extra.closed).toEqual({ code: 4006, reason: 'room-full' });
    expect(extra.closedAfter()).toBeLessThan(CLOSE_WITHIN_MS);

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
