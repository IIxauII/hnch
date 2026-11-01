/**
 * The relay Worker: routes on hnch.dev/{health*,rooms*,ws/*} (ADR-0051: HTTP
 * surface, DO failure handling and expiry sweep clauses).
 *
 *   GET    /health               → 200 {status, version}; never touches a room
 *   POST   /rooms                → 201 {uuid, code}
 *   GET    /rooms/:code          → 200 {uuid, accessMode} | 404 {reason:'unknown-room'}
 *   PATCH  /rooms/:uuid/access   → 200 {accessMode} | 404 {reason:'unknown-room'}
 *   WS     /ws/:uuid             → handed to Room(uuid); 503 {error, detail} at its refused bound
 *   POST   /test/rooms           → 201 {uuid, code} with the code asked for; ADR-0027, as below
 *   DELETE /test/rooms/:uuid     → ADR-0027, only with HNCH_ENABLE_TEST_ROUTES=1
 *   OPTIONS *                    → 204
 *
 * A Durable Object call that throws answers 503 {error:'unavailable'} with no
 * `reason`: under ADR-0050 only a 404 ends a client's session, so a platform
 * failure must never look like one.
 */

import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '@hnch/shared/room-code';
import type { HealthResponse } from '@hnch/shared/health';
import { version } from '../package.json';
import { clock } from './clock';
import { configOf } from './config';
import { CORS_HEADERS, UUID_RE, isPasswordHash, json, readJsonBody } from './http';
import { codesStub, expiryStub, logEvent, roomStub, utcDay } from './stubs';

const WS_PATH_RE = /^\/ws\/([0-9a-fA-F-]{36})\/?$/;
const ACCESS_PATH_RE = /^\/rooms\/([0-9a-fA-F-]{36})\/access\/?$/;
const CODE_PATH_RE = /^\/rooms\/([^/]+)\/?$/;
const TEST_DELETE_PATH_RE = /^\/test\/rooms\/([^/]+)\/?$/;
const TEST_CREATE_PATH = '/test/rooms';

/** Attempts at a free code before giving up; 31^6 codes make one enough. */
const MAX_CODE_ATTEMPTS = 64;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days of the Expiry index the daily cron sweeps. */
export const SWEEP_DAYS = 30;
/**
 * The last days of the window in which the sweep moves a room it can't delete to
 * today's index (#554). Several, so a failed move is retried before the index
 * leaves the window; only these, so rooms don't pile into one index.
 */
export const RELIST_DAYS = 5;

const unavailable = (): Response => json(503, { error: 'unavailable' });
const unknownRoom = (): Response => json(404, { reason: 'unknown-room' });
const notFound = (): Response => json(404, { error: 'not-found' });

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  try {
    return await route(request, env);
  } catch (err) {
    logEvent('relay-unhandled-error', err);
    return json(500, { error: 'internal-error' });
  }
}

async function route(request: Request, env: Env): Promise<Response> {
  const { method } = request;
  const path = new URL(request.url).pathname;

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  if (method === 'GET' && path === '/health') {
    const body: HealthResponse = { status: 'ok', version };
    return json(200, body);
  }

  const ws = WS_PATH_RE.exec(path);
  if (ws !== null && method === 'GET') {
    // Junk ids stop here: each distinct id would otherwise cost a Room object.
    if (!UUID_RE.test(ws[1]!)) return new Response(null, { status: 404, headers: CORS_HEADERS });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Upgrade Required', { status: 426, headers: CORS_HEADERS });
    }
    try {
      return await roomStub(env, ws[1]!).fetch(request);
    } catch (err) {
      logEvent('relay-room-unavailable', err);
      return unavailable();
    }
  }

  if (method === 'POST' && path === '/rooms') return createRoom(request, env, randomCodes());

  const access = ACCESS_PATH_RE.exec(path);
  if (method === 'PATCH' && access !== null) {
    return UUID_RE.test(access[1]!) ? patchAccess(access[1]!, request, env) : unknownRoom();
  }

  const code = CODE_PATH_RE.exec(path);
  if (method === 'GET' && code !== null) return resolveRoom(code[1]!, env);

  if (method === 'POST' && path === TEST_CREATE_PATH && configOf(env).testRoutes) {
    return testCreateRoom(request, env);
  }

  const testDelete = TEST_DELETE_PATH_RE.exec(path);
  if (method === 'DELETE' && testDelete !== null && configOf(env).testRoutes) {
    return testEvict(testDelete[1]!, env);
  }

  return notFound();
}

/** The codes a new room tries, in order, until one is free. */
type CodeSource = Iterable<string>;

function* randomCodes(): CodeSource {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) yield generateRoomCode();
}

async function createRoom(request: Request, env: Env, codes: CodeSource): Promise<Response> {
  const body = await readJsonBody(request);
  if (body === undefined || (body !== null && typeof body !== 'object')) {
    return json(400, { error: 'bad-request' });
  }
  return mintRoom(body as Record<string, unknown> | null, env, codes);
}

async function mintRoom(
  body: Record<string, unknown> | null,
  env: Env,
  codes: CodeSource,
): Promise<Response> {
  const passwordHash = body?.['passwordHash'];
  if (passwordHash !== undefined && !isPasswordHash(passwordHash)) {
    return json(400, {
      error: 'bad-request',
      detail: 'passwordHash must be a 64-character hex string',
    });
  }

  const uuid = crypto.randomUUID();
  for (const code of codes) {
    try {
      if (!(await codesStub(env, code).claim(uuid))) continue;
      await roomStub(env, uuid).init(uuid, code, passwordHash ?? null);
    } catch (err) {
      // A claimed code whose room never initialised reads as free to the next claim.
      logEvent('relay-create-unavailable', err);
      return unavailable();
    }
    try {
      await expiryStub(env, utcDay(clock.now())).register(uuid);
    } catch (err) {
      // Best effort: the room's own alarm and lazy expiry still delete it.
      logEvent('relay-expiry-register-failed', err);
    }
    return json(201, { uuid, code });
  }
  logEvent('relay-code-space-exhausted');
  return json(500, { error: 'internal-error' });
}

async function resolveRoom(rawCode: string, env: Env): Promise<Response> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawCode);
  } catch {
    return unknownRoom(); // malformed escapes name no room
  }
  const code = normalizeRoomCode(decoded);
  if (code === '') return unknownRoom();
  try {
    const uuid = await codesStub(env, code).lookup();
    if (uuid === null) return unknownRoom();
    const info = await roomStub(env, uuid).info();
    if (info === null) return unknownRoom();
    return json(200, { uuid, accessMode: info.accessMode });
  } catch (err) {
    logEvent('relay-resolve-unavailable', err);
    return unavailable();
  }
}

async function patchAccess(uuid: string, request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  if (body === undefined || (body !== null && typeof body !== 'object')) {
    return json(400, { error: 'bad-request' });
  }
  const passwordHash = (body as Record<string, unknown> | null)?.['passwordHash'];
  if (passwordHash !== undefined && passwordHash !== null && !isPasswordHash(passwordHash)) {
    return json(400, {
      error: 'bad-request',
      detail: 'passwordHash must be a 64-character hex string or null',
    });
  }
  try {
    const accessMode = await roomStub(env, uuid).setPassword(passwordHash ?? null);
    return accessMode === null ? unknownRoom() : json(200, { accessMode });
  } catch (err) {
    logEvent('relay-access-unavailable', err);
    return unavailable();
  }
}

/**
 * ADR-0027 test route for deterministic screenshot capture (#762): a room with
 * the code the caller names, so two captures of one tree show the same code. A
 * room still holding the code (from an earlier capture against the same relay)
 * is evicted first; if that does not free the code, 503. A malformed code
 * answers 400. Unlike DELETE, it answers 400 and 503 rather than 404: with the
 * gate on, DELETE's 200 already shows the routes are mounted.
 */
async function testCreateRoom(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  const requested = (body as Record<string, unknown> | null | undefined)?.['code'];
  const code = typeof requested === 'string' ? normalizeRoomCode(requested) : '';
  if (!isValidRoomCode(code)) {
    return json(400, { error: 'bad-request', detail: 'code must be a valid room code' });
  }
  try {
    const holder = await codesStub(env, code).lookup();
    if (holder !== null) {
      await roomStub(env, holder).testEvict();
      // Eviction releases the code; a failed release leaves it with the old room.
      if ((await codesStub(env, code).lookup()) !== null) {
        logEvent('relay-test-create-unavailable');
        return unavailable();
      }
    }
  } catch (err) {
    logEvent('relay-test-create-unavailable', err);
    return unavailable();
  }
  return mintRoom(body as Record<string, unknown>, env, [code]);
}

/**
 * ADR-0027 §5: a malformed or unknown UUID answers the same 404 as the route
 * being off, so a probe can't tell whether test routes are mounted.
 */
async function testEvict(rawUuid: string, env: Env): Promise<Response> {
  if (!UUID_RE.test(rawUuid)) return notFound();
  try {
    return (await roomStub(env, rawUuid).testEvict())
      ? json(200, { evicted: rawUuid })
      : notFound();
  } catch (err) {
    // Not 503: an answer other than this 404 would show the route is mounted.
    logEvent('relay-test-evict-unavailable', err);
    return notFound();
  }
}

/** Daily cron (04:00 UTC): sweep the Expiry index of each of the last 30 days. */
export async function handleScheduled(controller: ScheduledController, env: Env): Promise<void> {
  const today = utcDay(controller.scheduledTime);
  const results = await Promise.allSettled(
    Array.from({ length: SWEEP_DAYS }, (_, i) => {
      const age = i + 1;
      const day = utcDay(controller.scheduledTime - age * DAY_MS);
      // A room still listed when its index is about to leave the window moves to
      // today's, which the next 30 sweeps cover.
      return expiryStub(env, day).sweep(age > SWEEP_DAYS - RELIST_DAYS ? today : undefined);
    }),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) logEvent('relay-sweep-days-failed');
}
