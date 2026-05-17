/**
 * HTTP + WS server for the hnch relay.
 *
 * Routes:
 *
 *   - `GET /health` — liveness probe.
 *   - `POST /rooms` — mints a room, returns `{ uuid, code }`. Accepts
 *     optional `{ passwordHash }` to create a password-protected room
 *     (ADR-0008, ADR-0016, ADR-0017).
 *   - `GET /rooms/:code` — resolves a code to a UUID and reports the
 *     room's access mode, per ADR-0016. Responds
 *     `404 { reason: 'unknown-room' }` if the code is not live.
 *   - `PATCH /rooms/:uuid/access` — set or remove the password on a
 *     live room (ADR-0017). Existing connections are not evicted.
 *   - `WS /ws/:uuid` — handed to the y-websocket-compatible handler
 *     (see `ws-connection.ts`) after the `upgrade` event. Carries
 *     `JoinCredentials` as URL query params per ADR-0016. Missing `pw`
 *     on a password-protected room is rejected pre-upgrade (HTTP 400);
 *     unknown UUID is pre-upgrade HTTP 404. Wrong password is
 *     post-upgrade WS close 4002 per the ADR-0016 close-code table
 *     (see ADR-0035).
 *
 * Pre-upgrade rejections close the raw socket with a minimal HTTP
 * response so the client sees a clean `4xx` rather than a mysterious
 * closed WS — the post-upgrade close-code table from ADR-0016 is only
 * meaningful once the socket has been handed to the WS protocol.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  normalizeRoomCode,
  MAX_ROOM_PARTICIPANTS,
  JOIN_REJECTION_CLOSE_CODES,
  type JoinRejectionReason,
} from '@hnch/shared';
import { accessModeOf, type AccessMode, type RoomRecord, type RoomStore } from './room-store.js';
import { setupWSConnection, type WsRoom } from './ws-connection.js';

/**
 * Payload of a successful `GET /health` response.
 *
 * Aggregate operator-facing fields only — no room UUIDs, codes, participant
 * IDs, or session content (ADR-0001, ADR-0028).
 */
export interface HealthPayload {
  readonly status: 'ok';
  readonly version: string;
  readonly uptime: number;
}

/**
 * Relay version read from `packages/relay/package.json` at module load.
 *
 * Path is resolved relative to this file's URL so it works in both the source
 * layout (`src/server.ts` → `../package.json`) and the built layout
 * (`dist/server.js` → `../package.json`).
 */
const RELAY_VERSION: string = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, '..', 'package.json'), 'utf-8');
  const parsed = JSON.parse(raw) as { version?: unknown };
  if (typeof parsed.version !== 'string') {
    throw new Error('relay package.json missing version');
  }
  return parsed.version;
})();

/** Payload of a successful `POST /rooms` response. */
export interface CreateRoomResponse {
  readonly uuid: string;
  readonly code: string;
}

/** Payload of a successful `GET /rooms/:code` response (ADR-0016). */
export interface ResolveRoomResponse {
  readonly uuid: string;
  readonly accessMode: AccessMode;
}

/** Payload of a `GET /rooms/:code` miss (ADR-0016). */
export interface ResolveRoomRejection {
  readonly reason: Extract<JoinRejectionReason, 'unknown-room'>;
}

export interface RelayServerDeps {
  readonly roomStore: RoomStore;
}

/** Max bytes we'll read on a JSON body before giving up. */
const MAX_BODY_BYTES = 4 * 1024;

/**
 * Whether the test-only routes (DELETE /test/rooms/:uuid) are mounted.
 *
 * Frozen at module-load. Do not re-read for runtime branching — boot-time
 * semantics by ADR-0027 §2. Reflected in the boot banner so operators can
 * see the effective value at startup; emitted at WARN level when true.
 */
export const TEST_ROUTES_ENABLED: boolean = process.env['HNCH_ENABLE_TEST_ROUTES'] === '1';

/**
 * Effective room participant cap. Defaults to `MAX_ROOM_PARTICIPANTS` (20).
 * Test-only: can be lowered via `HNCH_ROOM_CAP` env var for e2e testing
 * (e.g., `HNCH_ROOM_CAP=3`). Clamped to `[1, MAX_ROOM_PARTICIPANTS]`.
 *
 * Frozen at module-load. Do not re-read for runtime branching — boot-time
 * semantics by ADR-0027 §2. Reflected in the boot banner so operators can
 * see the effective value at startup; emitted at WARN level when below the
 * production maximum.
 */
export const ROOM_CAP: number = (() => {
  const envCap = process.env['HNCH_ROOM_CAP'];
  if (envCap) {
    const parsed = parseInt(envCap, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.min(parsed, MAX_ROOM_PARTICIPANTS);
    }
  }
  return MAX_ROOM_PARTICIPANTS;
})();

/**
 * Emit the single structured boot banner declaring the effective `roomCap`
 * and `testRoutesEnabled` per ADR-0027 §6. Logs at WARN level when the relay
 * is in a non-production state (`roomCap < MAX_ROOM_PARTICIPANTS` OR
 * `testRoutesEnabled === true`) so operators notice misconfigured production
 * deployments. Pure for testability — accepts an injected logger.
 */
export function logBootBanner(deps: {
  port: number;
  host: string;
  roomCap: number;
  testRoutesEnabled: boolean;
  logger: { log: (msg: string) => void; warn: (msg: string) => void };
}): void {
  const { port, host, roomCap, testRoutesEnabled, logger } = deps;
  const isWarn = roomCap < MAX_ROOM_PARTICIPANTS || testRoutesEnabled;
  const logFn = isWarn ? logger.warn : logger.log;
  logFn(
    `hnch relay listening on ${host}:${port} (roomCap=${roomCap}, testRoutes=${testRoutesEnabled})`,
  );
}

/** Regex for `WS /ws/:uuid` (strict, path-only — query strings are
 *  parsed separately via `URL`). */
const WS_PATH_RE = /^\/ws\/([0-9a-fA-F-]{36})\/?$/;

/**
 * Creates the relay's HTTP + WebSocket server. The returned server is
 * not yet listening; callers invoke `.listen(port, host?)` themselves.
 */
export function createRelayServer(deps: RelayServerDeps): Server {
  const httpServer = createServer((req, res) => {
    handleHttpRequest(req, res, deps).catch((err: unknown) => {
      console.error('relay: unhandled error', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal-error' });
      } else {
        res.destroy();
      }
    });
  });

  // `noServer: true` hands upgrade wiring to our listener so we can
  // route based on pathname and authoritatively reject unknown UUIDs
  // before the protocol handshake completes.
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    handleUpgrade(req, socket, head, wss, deps);
  });

  // When the HTTP server closes, also stop accepting new upgrades and
  // close live sockets so tests can tear down cleanly.
  httpServer.on('close', () => {
    wss.close();
  });

  return httpServer;
}

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RelayServerDeps,
): Promise<void> {
  // CORS: allow the dev client (and any origin in dev mode) to reach
  // the relay. In production this would be locked to the app's origin.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = req.url;
  if (url === undefined) {
    sendJson(res, 400, { error: 'bad-request' });
    return;
  }

  // Strip query string before routing. `/ws/:uuid` is handled by the
  // `upgrade` event, not by this HTTP router, so query params never
  // need to flow through here.
  const path = url.split('?', 1)[0] ?? url;

  if (req.method === 'GET' && path === '/health') {
    const payload: HealthPayload = {
      status: 'ok',
      version: RELAY_VERSION,
      uptime: Math.floor(process.uptime()),
    };
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === 'POST' && path === '/rooms') {
    await handleCreateRoom(req, res, deps);
    return;
  }

  // PATCH /rooms/:uuid/access — set or remove password (ADR-0017)
  const accessMatch = path.match(/^\/rooms\/([0-9a-fA-F-]{36})\/access\/?$/);
  if (req.method === 'PATCH' && accessMatch !== null) {
    await handlePatchAccess(accessMatch[1]!, req, res, deps);
    return;
  }

  const roomCodeMatch = path.match(/^\/rooms\/([^/]+)\/?$/);
  if (req.method === 'GET' && roomCodeMatch !== null) {
    const raw = decodeURIComponent(roomCodeMatch[1]!);
    handleResolveRoom(raw, res, deps);
    return;
  }

  // DELETE /test/rooms/:uuid — test-only eviction endpoint
  if (TEST_ROUTES_ENABLED) {
    const testDeleteMatch = path.match(/^\/test\/rooms\/([^/]+)\/?$/);
    if (req.method === 'DELETE' && testDeleteMatch !== null) {
      handleTestDeleteRoom(testDeleteMatch[1]!, res, deps);
      return;
    }
  }

  sendJson(res, 404, { error: 'not-found' });
}

async function handleCreateRoom(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RelayServerDeps,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
    if (body !== null && typeof body !== 'object') {
      sendJson(res, 400, { error: 'bad-request' });
      return;
    }
  } catch {
    sendJson(res, 400, { error: 'bad-request' });
    return;
  }

  const obj = (body ?? {}) as Record<string, unknown>;
  const passwordHash = obj['passwordHash'] as string | undefined;
  if (passwordHash !== undefined && !isValidPasswordHash(passwordHash)) {
    sendJson(res, 400, {
      error: 'bad-request',
      detail: 'passwordHash must be a 64-character hex string',
    });
    return;
  }

  const record = deps.roomStore.createRoom(
    passwordHash !== undefined ? { passwordHash } : undefined,
  );
  const payload: CreateRoomResponse = {
    uuid: record.uuid,
    code: record.code,
  };
  sendJson(res, 201, payload);
}

function handleResolveRoom(rawCode: string, res: ServerResponse, deps: RelayServerDeps): void {
  const normalized = normalizeRoomCode(rawCode);
  const record = deps.roomStore.getByCode(normalized);
  if (record === undefined) {
    const rejection: ResolveRoomRejection = { reason: 'unknown-room' };
    sendJson(res, 404, rejection);
    return;
  }
  const payload: ResolveRoomResponse = {
    uuid: record.uuid,
    accessMode: accessModeOf(record),
  };
  sendJson(res, 200, payload);
}

function handleUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
  deps: RelayServerDeps,
): void {
  const url = req.url ?? '';
  const host = req.headers.host ?? 'localhost';
  let parsed: URL;
  try {
    parsed = new URL(url, `http://${host}`);
  } catch {
    denyUpgrade(socket, 400, 'Bad Request');
    return;
  }

  const match = parsed.pathname.match(WS_PATH_RE);
  if (match === null) {
    denyUpgrade(socket, 404, 'Not Found');
    return;
  }

  const uuid = match[1]!;
  const record: RoomRecord | undefined = deps.roomStore.getByUuid(uuid);
  if (record === undefined) {
    // The resolve step may have succeeded earlier but the room's TTL
    // lapsed in the interval. ADR-0016 allows recovering via the
    // close-code table post-upgrade *or* by rejecting at the upgrade
    // itself — we prefer the HTTP 404 here so the client's sync
    // provider can tell the difference from a transient disconnect
    // without parsing a close code.
    denyUpgrade(socket, 404, 'Not Found');
    return;
  }

  // Password enforcement per ADR-0017. Missing password is a malformed
  // request (HTTP 400, pre-upgrade). Wrong password is a credential
  // rejection — deferred to post-upgrade WS close 4002 per ADR-0016 so
  // the browser surfaces the reason via lastRejection.
  const pw = record.passwordHash !== undefined ? parsed.searchParams.get('pw') : null;
  if (record.passwordHash !== undefined && !pw) {
    denyUpgrade(socket, 400, 'Bad Request');
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
    // Wrong-password: post-upgrade close (4002) per ADR-0016 close-code table.
    if (record.passwordHash !== undefined && !passwordHashesMatch(pw!, record.passwordHash)) {
      ws.close(JOIN_REJECTION_CLOSE_CODES['wrong-password'], 'wrong-password');
      return;
    }

    // Participant cap enforcement (ADR-0024). Check post-upgrade so the
    // client receives a WS close code (4006) per the ADR-0016 close-code
    // table rather than a raw HTTP 403.
    if (record.connections >= ROOM_CAP) {
      ws.close(JOIN_REJECTION_CLOSE_CODES['room-full'], 'room-full');
      return;
    }

    const wsRoom: WsRoom = {
      doc: record.doc,
      awareness: record.awareness,
      onConnectionOpen(): void {
        record.connections += 1;
        record.lastEmptyAt = undefined;
      },
      onConnectionClose(): void {
        record.connections = Math.max(0, record.connections - 1);
        if (record.connections === 0) {
          record.lastEmptyAt = Date.now();
        }
      },
    };
    setupWSConnection(ws, wsRoom);
  });
}

async function handlePatchAccess(
  uuid: string,
  req: IncomingMessage,
  res: ServerResponse,
  deps: RelayServerDeps,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'bad-request' });
    return;
  }

  const obj = (body ?? {}) as Record<string, unknown>;
  const passwordHash = obj['passwordHash'];

  if (passwordHash !== undefined && passwordHash !== null) {
    if (typeof passwordHash !== 'string' || !isValidPasswordHash(passwordHash)) {
      sendJson(res, 400, {
        error: 'bad-request',
        detail: 'passwordHash must be a 64-character hex string or null',
      });
      return;
    }
  }

  const found = deps.roomStore.setPasswordHash(
    uuid,
    passwordHash === null || passwordHash === undefined ? null : (passwordHash as string),
  );
  if (!found) {
    sendJson(res, 404, { reason: 'unknown-room' });
    return;
  }

  const record = deps.roomStore.getByUuid(uuid)!;
  sendJson(res, 200, { accessMode: accessModeOf(record) });
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function handleTestDeleteRoom(rawUuid: string, res: ServerResponse, deps: RelayServerDeps): void {
  if (!UUID_RE.test(rawUuid)) {
    // Per ADR-0027 §5: malformed UUIDs return the same 404 as unknown UUIDs and
    // as gate-off responses, so an attacker probing this path cannot distinguish
    // "test routes enabled with bad UUID" from "test routes disabled". Do NOT
    // change to a more informative status — this asymmetry vs. the WS-upgrade
    // handler is intentional; only this gate has a secrecy contract.
    sendJson(res, 404, { error: 'not-found' });
    return;
  }
  const record = deps.roomStore.getByUuid(rawUuid);
  if (record === undefined) {
    sendJson(res, 404, { error: 'not-found' });
    return;
  }
  deps.roomStore.deleteRoom(rawUuid);
  sendJson(res, 200, { evicted: rawUuid });
}

/** A valid password hash is a 64-character lowercase hex string (32 bytes). */
function isValidPasswordHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

/**
 * Constant-time comparison of two hex-encoded password hashes.
 * Returns `false` immediately if lengths differ (no timing leak
 * since length is always 64 for valid hashes — the caller rejects
 * malformed hashes before reaching this point).
 */
function passwordHashesMatch(submitted: string, stored: string): boolean {
  const a = Buffer.from(submitted, 'utf-8');
  const b = Buffer.from(stored, 'utf-8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function denyUpgrade(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('body too large');
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString('utf-8').trim();
  if (text === '') return {};
  return JSON.parse(text) as unknown;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
