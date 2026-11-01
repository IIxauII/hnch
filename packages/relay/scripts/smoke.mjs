#!/usr/bin/env node
// @ts-check
/**
 * Smoke checks against a running relay, through the real `@hnch/shared` relay
 * client the PWA and CLI ship. Needs `pnpm --filter @hnch/shared build` first.
 *
 *   BASE=https://hnch.dev node scripts/smoke.mjs <mode>
 *
 *   basic        health, unknown code, mint, resolve, sync both ways, presence,
 *                4002 / 400 → lookup / 404 → lookup, password change, fresh device
 *   cap          the 21st socket is closed 4006
 *   hold         one client held HOLD_SECONDS (default 120): expects 0 reconnects
 *   deploy-hold  three clients held HOLD_SECONDS (default 600) across a relay
 *                deploy: reports reconnects and resync times, expects state kept
 *   preflight    native-app CORS preflight on /rooms
 *
 * Every y-websocket client runs in its own process: y-websocket links clients
 * of one process on the same URL in memory, which would hide what the relay
 * does. Exits non-zero if any check fails.
 *
 * Sockets are the `ws` package's, as the CLI's are. Node's own WebSocket fires
 * no close after a refused handshake (HTTP 400, 404), so the client's lookup of
 * the reason would never start, and it waits for the server to end the TCP
 * connection before reporting a close (#577).
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import WebSocket from 'ws';

/** y-websocket's first frame on open: sync-step-1 with an empty state vector. */
const SYNC_STEP_1 = new Uint8Array([0, 0, 1, 0]);

const BASE = (process.env['BASE'] ?? 'http://localhost:1234').replace(/\/$/, '');
const HOLD_SECONDS = Number(process.env['HOLD_SECONDS'] ?? '0');
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
const log = (/** @type {unknown[]} */ ...a) =>
  console.log(new Date().toISOString().slice(11, 23), ...a);

// parent

async function runMode(/** @type {string} */ mode) {
  let failures = 0;
  const check = (/** @type {boolean} */ ok, /** @type {string} */ what) => {
    log(ok ? 'PASS' : 'FAIL', what);
    if (!ok) failures++;
  };
  /** @type {Record<string, (check: (ok: boolean, what: string) => void) => Promise<void>>} */
  const modes = { basic, cap, hold, 'deploy-hold': deployHold, preflight };
  const run = modes[mode];
  if (run === undefined) {
    console.error(`usage: BASE=<url> node scripts/smoke.mjs ${Object.keys(modes).join('|')}`);
    process.exit(2);
  }
  log(`${mode} against ${BASE}`);
  try {
    await run(check);
  } finally {
    for (const p of peers) p.kill();
  }
  log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * @typedef {{
 *   name: string, status: string, synced: boolean, rejection: string | null,
 *   map: Record<string, unknown>, peers: string[], connects: number,
 *   lastDrop: number | null, resyncs: number[],
 *   send(cmd: object): void, kill(): void,
 * }} PeerHandle
 */
/** @type {PeerHandle[]} */
const peers = [];

/**
 * Starts a client in its own process and joins it to a room.
 * @param {{ uuid: string, code: string, name: string, passwordHash?: string }} join
 * @returns {PeerHandle}
 */
function peer(join) {
  const child = spawn(process.execPath, [import.meta.filename, '--peer'], {
    env: { ...process.env, BASE },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  /** @type {PeerHandle} */
  const handle = {
    name: join.name,
    status: 'connecting',
    synced: false,
    rejection: null,
    map: {},
    peers: [],
    connects: 0,
    lastDrop: null,
    resyncs: [],
    send: (cmd) => child.stdin.write(`${JSON.stringify(cmd)}\n`),
    kill: () => child.kill('SIGKILL'),
  };
  createInterface({ input: child.stdout }).on('line', (line) => {
    /** @type {{ ev: string, [k: string]: any }} */
    const msg = JSON.parse(line);
    if (msg.ev === 'status') {
      if (msg['status'] === 'connected') handle.connects++;
      if (handle.status === 'connected' && msg['status'] !== 'connected')
        handle.lastDrop = Date.now();
      handle.status = msg['status'];
    } else if (msg.ev === 'synced') {
      if (msg['synced'] && handle.lastDrop !== null) {
        handle.resyncs.push(Date.now() - handle.lastDrop);
        handle.lastDrop = null;
      }
      handle.synced = msg['synced'];
    } else if (msg.ev === 'rejection') handle.rejection = msg['reason'];
    else if (msg.ev === 'map') handle.map = msg['entries'];
    else if (msg.ev === 'peers') handle.peers = msg['names'];
  });
  handle.send({ op: 'join', ...join });
  peers.push(handle);
  return handle;
}

async function until(/** @type {() => boolean} */ pred, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await sleep(50);
  }
  return pred();
}

async function shared() {
  return import('@hnch/shared');
}

/** @param {(ok: boolean, what: string) => void} check */
async function basic(check) {
  const { mintRoom, resolveRoom, patchRoomAccess } = await shared();
  const health = await (await fetch(`${BASE}/health`)).json();
  check(
    health.status === 'ok' && typeof health.version === 'string',
    `GET /health → ${JSON.stringify(health)}`,
  );

  const unknown = await fetch(`${BASE}/rooms/000000`);
  const unknownBody = await unknown.json().catch(() => null);
  check(
    unknown.status === 404 && unknownBody?.reason === 'unknown-room',
    `GET /rooms/000000 → ${unknown.status} ${JSON.stringify(unknownBody)}`,
  );

  const open = await mintRoom(BASE);
  check(/^[0-9a-f-]{36}$/.test(open.uuid) && open.code.length === 6, `POST /rooms → ${open.code}`);
  check((await resolveRoom(BASE, open.code)).accessMode === 'open', 'GET /rooms/:code → open');
  check(
    (await resolveRoom(BASE, open.code.toLowerCase())).uuid === open.uuid,
    'code lookup is case-insensitive',
  );

  const room = await mintRoom(BASE, { passwordHash: HASH });
  check((await resolveRoom(BASE, room.code)).accessMode === 'password', 'password room → password');

  let t = Date.now();
  const a = peer({ ...room, name: 'A', passwordHash: HASH });
  check(await until(() => a.synced), `A connects and syncs (${Date.now() - t} ms)`);
  a.send({ op: 'set', key: 'vote', value: 5 });

  t = Date.now();
  const b = peer({ ...room, name: 'B', passwordHash: HASH });
  check(
    await until(() => b.synced && b.map['vote'] === 5),
    `B receives A's write (${Date.now() - t} ms)`,
  );
  check(
    await until(() => b.peers.includes('A') && a.peers.includes('B')),
    'A and B see each other (presence)',
  );
  b.send({ op: 'set', key: 'vote', value: 8 });
  check(await until(() => a.map['vote'] === 8), "A receives B's write");

  const c = peer({ ...room, name: 'C', passwordHash: OTHER_HASH });
  check(
    await until(() => c.rejection === 'wrong-password'),
    `wrong pw → ${c.rejection} (close 4002)`,
  );
  c.kill();

  const d = peer({ ...room, name: 'D' });
  check(
    await until(() => d.rejection === 'wrong-password', 15_000),
    `missing pw → ${d.rejection} (HTTP 400, then lookup)`,
  );
  d.kill();

  const ghost = peer({ uuid: crypto.randomUUID(), code: 'ZZZZZZ', name: 'ghost' });
  check(
    await until(() => ghost.rejection === 'unknown-room', 15_000),
    `unknown uuid → ${ghost.rejection} (HTTP 404, then lookup)`,
  );
  ghost.kill();

  check(
    (await patchRoomAccess(BASE, room.uuid, null)).accessMode === 'open',
    'PATCH access null → open',
  );
  await patchRoomAccess(BASE, room.uuid, HASH);

  a.send({ op: 'leave' });
  t = Date.now();
  // A clean leave can take up to the 30 s awareness timeout (#542).
  check(await until(() => !b.peers.includes('A'), 35_000), `B sees A leave (${Date.now() - t} ms)`);
  b.send({ op: 'leave' });
  await sleep(1_000);

  t = Date.now();
  const e = peer({ ...room, name: 'E', passwordHash: HASH });
  check(
    await until(() => e.synced && e.map['vote'] === 8),
    `fresh device after the room emptied gets the state (${Date.now() - t} ms)`,
  );
}

/** @param {(ok: boolean, what: string) => void} check */
async function cap(check) {
  const { mintRoom } = await shared();
  const room = await mintRoom(BASE);
  const wsBase = BASE.replace(/^http/, 'ws');
  /** A bare socket that, as a client does, sends sync-step-1 on open. */
  const connect = (/** @type {number} */ n) => {
    const ws = new WebSocket(`${wsBase}/ws/${room.uuid}?did=smoke-${n}`);
    ws.on('open', () => ws.send(SYNC_STEP_1));
    ws.on('error', () => {});
    return ws;
  };
  /** @type {WebSocket[]} */
  const sockets = [];
  for (let i = 0; i < 20; i++) {
    const ws = connect(i);
    const opened = await new Promise((resolve) => {
      ws.on('open', () => resolve(true));
      ws.on('close', () => resolve(false));
    });
    if (!opened) {
      check(false, `socket ${i + 1} opens`);
      return;
    }
    sockets.push(ws);
  }
  check(true, '20 sockets open');
  const t = Date.now();
  const extra = connect(21);
  const close = await new Promise((resolve) => {
    extra.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });
  check(
    JSON.stringify(close) === JSON.stringify({ code: 4006, reason: 'room-full' }),
    `21st socket → ${JSON.stringify(close)} (${Date.now() - t} ms)`,
  );
  for (const ws of sockets) ws.close();
}

/** @param {(ok: boolean, what: string) => void} check */
async function hold(check) {
  const seconds = HOLD_SECONDS || 120;
  const { mintRoom } = await shared();
  const room = await mintRoom(BASE);
  const lone = peer({ ...room, name: 'lone' });
  check(await until(() => lone.synced), 'lone client connects');
  log(`holding for ${seconds} s`);
  await sleep(seconds * 1000);
  check(lone.connects === 1, `0 reconnects in ${seconds} s (connected ${lone.connects} time(s))`);
}

/** @param {(ok: boolean, what: string) => void} check */
async function deployHold(check) {
  const seconds = HOLD_SECONDS || 600;
  const { mintRoom } = await shared();
  const room = await mintRoom(BASE);
  const held = ['A', 'B', 'C'].map((name) => peer({ ...room, name }));
  check(await until(() => held.every((p) => p.synced)), 'three clients connect');
  held[0]?.send({ op: 'set', key: 'round', value: 'before-deploy' });
  check(await until(() => held.every((p) => p.map['round'] === 'before-deploy')), 'state shared');
  log(`holding for ${seconds} s; deploy the relay now`);
  await sleep(seconds * 1000);
  for (const p of held) {
    log(`${p.name}: ${p.connects - 1} reconnect(s), resync ms ${JSON.stringify(p.resyncs)}`);
  }
  check(
    await until(() => held.every((p) => p.synced && p.map['round'] === 'before-deploy')),
    'state kept and every client synced at the end',
  );
  check(
    await until(() => held.every((p) => p.peers.length === 2), 35_000),
    'every client sees the other two',
  );
}

/** @param {(ok: boolean, what: string) => void} check */
async function preflight(check) {
  for (const origin of ['capacitor://localhost', 'https://localhost']) {
    const res = await fetch(`${BASE}/rooms`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    const methods = res.headers.get('access-control-allow-methods') ?? '';
    const headers = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    check(
      res.status === 204 &&
        res.headers.get('access-control-allow-origin') === '*' &&
        methods.includes('POST') &&
        headers.includes('content-type'),
      `OPTIONS /rooms from ${origin} → ${res.status}, ${methods}, ${headers}`,
    );
  }
}

// child

async function runPeer() {
  const { connectToRelay } = await shared();
  const Y = await import('yjs');
  // The parent is gone: nobody to report to.
  process.stdout.on('error', () => process.exit(0));
  const out = (/** @type {object} */ msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  /** @type {import('@hnch/shared').RelayConnection | null} */
  let conn = null;
  /** @type {import('yjs').Doc | null} */
  let doc = null;

  for await (const line of createInterface({ input: process.stdin })) {
    const cmd = JSON.parse(line);
    if (cmd.op === 'join') {
      doc = new Y.Doc();
      const map = doc.getMap('smoke');
      map.observe(() => out({ ev: 'map', entries: map.toJSON() }));
      conn = connectToRelay({
        httpBaseUrl: BASE,
        roomUuid: cmd.uuid,
        doc,
        credentials: {
          roomCode: cmd.code,
          deviceId: `smoke-${cmd.name}`,
          ...(cmd.passwordHash ? { passwordHash: cmd.passwordHash } : {}),
        },
        onStatusChange: (status) => out({ ev: 'status', status }),
        onSyncedChange: (synced) => out({ ev: 'synced', synced }),
        onRejectionChange: (reason) => out({ ev: 'rejection', reason }),
        // As the CLI: `ws` stands in for the browser's WebSocket.
        WebSocketPolyfill: /** @type {import('@hnch/shared').WebSocketConstructorLike} */ (
          /** @type {unknown} */ (WebSocket)
        ),
      });
      const awareness = conn.awareness;
      awareness.setLocalStateField('participantId', `smoke-${cmd.name}`);
      awareness.setLocalStateField('smoke', cmd.name);
      awareness.on('change', () => {
        const names = [...awareness.getStates().entries()]
          .filter(([id]) => id !== awareness.clientID)
          .map(([, s]) => s?.['smoke'])
          .filter((n) => typeof n === 'string');
        out({ ev: 'peers', names });
      });
    } else if (cmd.op === 'set' && doc !== null) {
      doc.getMap('smoke').set(cmd.key, cmd.value);
    } else if (cmd.op === 'leave') {
      await conn?.flush(1_000);
      conn?.disconnect();
      process.exit(0);
    }
  }
}

if (process.argv[2] === '--peer') {
  await runPeer();
} else {
  await runMode(process.argv[2] ?? '');
}
