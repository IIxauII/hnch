/**
 * The relay's HTTP surface, through the Worker's own fetch handler (ADR-0051).
 */

import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { Peer, call, createRoom, eventually } from './test-support/peer';
import { handleFetch } from './worker';

const HASH = 'ab'.repeat(32);
const CODE_ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
};

function corsOf(res: Response): Record<string, string | null> {
  return Object.fromEntries(Object.keys(CORS).map((h) => [h, res.headers.get(h)]));
}

describe('GET /health', () => {
  it('answers status and the package version, and nothing else', async () => {
    const res = await call('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', version: pkg.version });
  });

  it('answers with any query string', async () => {
    expect((await call('/health?probe=x')).status).toBe(200);
  });
});

describe('routing', () => {
  it('answers a preflight to any path with 204 and the CORS headers', async () => {
    for (const origin of ['capacitor://localhost', 'https://localhost']) {
      const res = await call('/rooms', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });
      expect(res.status).toBe(204);
      expect(corsOf(res)).toEqual(CORS);
    }
    expect((await call('/anything', { method: 'OPTIONS' })).status).toBe(204);
  });

  it('carries the CORS headers on JSON answers', async () => {
    expect(corsOf(await call('/health'))).toEqual(CORS);
    expect(corsOf(await call('/rooms/000000'))).toEqual(CORS);
  });

  it('answers 404 not-found for anything else that reaches it', async () => {
    for (const [method, path] of [
      ['GET', '/health/'],
      ['POST', '/health'],
      ['GET', '/roomsXYZ'],
      ['GET', '/rooms'],
      ['POST', '/rooms/'],
      ['DELETE', '/rooms/ABCDEF'],
      ['GET', '/ws/not-a-uuid'],
      ['GET', '/'],
    ] as const) {
      const res = await call(path, { method });
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(await res.json()).toEqual({ error: 'not-found' });
    }
  });

  it('keeps the test-only route unmounted in production config', async () => {
    const { uuid } = await createRoom();
    const res = await call(`/test/rooms/${uuid}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
    expect((await call(`/rooms/${uuid}/access`, { method: 'PATCH', body: '{}' })).status).toBe(200);
  });

  it('keeps the requested-code route unmounted in production config', async () => {
    const res = await call('/test/rooms', {
      method: 'POST',
      body: JSON.stringify({ code: 'CAP236' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
    expect((await call('/rooms/CAP236')).status).toBe(404);
  });
});

describe('POST /rooms', () => {
  it('mints a room with a UUID and a code, for an empty body', async () => {
    const res = await call('/rooms', { method: 'POST' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { uuid: string; code: string };
    expect(Object.keys(body).toSorted()).toEqual(['code', 'uuid']);
    expect(body.uuid).toMatch(UUID_V4);
    expect(body.code).toMatch(CODE_ALPHABET);
  });

  it('gives each room its own code', async () => {
    const codes = await Promise.all(Array.from({ length: 10 }, () => createRoom()));
    expect(new Set(codes.map((c) => c.code)).size).toBe(10);
  });

  it('creates a password room from a hash', async () => {
    const { uuid, code } = await createRoom({ passwordHash: HASH });
    expect(await (await call(`/rooms/${code}`)).json()).toEqual({ uuid, accessMode: 'password' });
  });

  it('refuses a malformed passwordHash with 400 and a detail', async () => {
    for (const passwordHash of [HASH.toUpperCase(), 'ab', 42, null, `${HASH}0`]) {
      const res = await call('/rooms', { method: 'POST', body: JSON.stringify({ passwordHash }) });
      expect(res.status, String(passwordHash)).toBe(400);
      expect(await res.json()).toEqual({
        error: 'bad-request',
        detail: 'passwordHash must be a 64-character hex string',
      });
    }
  });

  it('refuses a body that is not a JSON object, or larger than 4 KiB', async () => {
    for (const body of ['not json', '"text"', '42', JSON.stringify({ pad: 'x'.repeat(4096) })]) {
      const res = await call('/rooms', { method: 'POST', body });
      expect(res.status, body.slice(0, 20)).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad-request' });
    }
  });
});

describe('GET /rooms/:code', () => {
  it('resolves a code in any case and with a dash', async () => {
    const { uuid, code } = await createRoom();
    for (const typed of [code, code.toLowerCase(), `${code.slice(0, 3)}-${code.slice(3)}`]) {
      const res = await call(`/rooms/${encodeURIComponent(typed)}`);
      expect(res.status, typed).toBe(200);
      expect(await res.json()).toEqual({ uuid, accessMode: 'open' });
    }
  });

  it('answers 404 unknown-room for a code no room holds', async () => {
    for (const code of ['000000', 'ZZZZZZ', '%E0%A4%A', '-']) {
      const res = await call(`/rooms/${code}`);
      expect(res.status, code).toBe(404);
      expect(await res.json()).toEqual({ reason: 'unknown-room' });
    }
  });
});

describe('PATCH /rooms/:uuid/access', () => {
  it('sets and clears the password', async () => {
    const { uuid, code } = await createRoom();
    const set = await call(`/rooms/${uuid}/access`, {
      method: 'PATCH',
      body: JSON.stringify({ passwordHash: HASH }),
    });
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ accessMode: 'password' });
    expect(await (await call(`/rooms/${code}`)).json()).toEqual({ uuid, accessMode: 'password' });

    for (const body of [JSON.stringify({ passwordHash: null }), '{}', '']) {
      await call(`/rooms/${uuid}/access`, {
        method: 'PATCH',
        body: JSON.stringify({ passwordHash: HASH }),
      });
      const cleared = await call(`/rooms/${uuid}/access`, { method: 'PATCH', body });
      expect(await cleared.json(), body).toEqual({ accessMode: 'open' });
    }
  });

  it('refuses a malformed passwordHash', async () => {
    const { uuid } = await createRoom();
    const res = await call(`/rooms/${uuid}/access`, {
      method: 'PATCH',
      body: JSON.stringify({ passwordHash: 'nope' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'bad-request',
      detail: 'passwordHash must be a 64-character hex string or null',
    });
  });

  it('answers 404 unknown-room for a room that does not exist', async () => {
    const res = await call(`/rooms/${crypto.randomUUID()}/access`, { method: 'PATCH', body: '{}' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ reason: 'unknown-room' });
  });

  it('leaves open sockets connected, and the new password applies to the next join', async () => {
    const { uuid } = await createRoom();
    const alice = await Peer.join(uuid);
    const bob = await Peer.join(uuid);
    await call(`/rooms/${uuid}/access`, {
      method: 'PATCH',
      body: JSON.stringify({ passwordHash: HASH }),
    });

    alice.doc.getMap('m').set('after', true);
    await eventually(() => expect(bob.doc.getMap('m').get('after')).toBe(true));
    expect(alice.closeEvent).toBeNull();
    expect((await call(`/ws/${uuid}`, { headers: { Upgrade: 'websocket' } })).status).toBe(400);
  });
});

describe('WS /ws/:uuid', () => {
  it('answers 404 to an id that is not a UUID, without making a room object', async () => {
    const junk = `${'a'.repeat(36)}`;
    const upgrade = { headers: { Upgrade: 'websocket' } };
    expect((await call(`/ws/${junk}`, upgrade)).status).toBe(404);
    expect((await call(`/ws/${'-'.repeat(36)}`, upgrade)).status).toBe(404);
    const patch = await call(`/rooms/${junk}/access`, { method: 'PATCH', body: '{}' });
    expect(patch.status).toBe(404);
    expect(await patch.json()).toEqual({ reason: 'unknown-room' });
  });

  it('answers 426 to a request that is not an upgrade', async () => {
    const { uuid } = await createRoom();
    expect((await call(`/ws/${uuid}`)).status).toBe(426);
  });
});

describe('when a Durable Object call fails', () => {
  /** A namespace whose objects all throw, as on overload or a storage error. */
  function failingNamespace(): DurableObjectNamespace {
    const fail = () => Promise.reject(new Error('Durable Object is overloaded'));
    const stub = new Proxy({}, { get: () => fail });
    return {
      idFromName: (name: string) => env.ROOM.idFromName(name),
      get: () => stub,
    } as unknown as DurableObjectNamespace;
  }

  const broken = {
    ...env,
    ROOM: failingNamespace(),
    CODES: failingNamespace(),
    EXPIRY: failingNamespace(),
  } as unknown as Env;

  async function brokenCall(path: string, init?: RequestInit): Promise<Response> {
    return handleFetch(new Request(`http://relay.test${path}`, init), broken);
  }

  it('answers 503 unavailable with no reason, never a 404', async () => {
    const uuid = crypto.randomUUID();
    for (const [path, init] of [
      ['/rooms/ABCDEF', undefined],
      ['/rooms', { method: 'POST' }],
      [`/rooms/${uuid}/access`, { method: 'PATCH', body: '{}' }],
    ] as const) {
      const res = await brokenCall(path, init);
      expect(res.status, path).toBe(503);
      expect(await res.json()).toEqual({ error: 'unavailable' });
    }
  });

  it('answers 503 before the upgrade too', async () => {
    const res = await brokenCall(`/ws/${crypto.randomUUID()}`, {
      headers: { Upgrade: 'websocket' },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  it('still answers /health, which touches no object', async () => {
    expect((await brokenCall('/health')).status).toBe(200);
  });

  it('still creates a room when only the Expiry registration fails', async () => {
    const onlyExpiryBroken = { ...env, EXPIRY: failingNamespace() } as unknown as Env;
    const res = await handleFetch(
      new Request('http://relay.test/rooms', { method: 'POST', body: '{}' }),
      onlyExpiryBroken,
    );
    expect(res.status).toBe(201);
    const { uuid } = (await res.json()) as { uuid: string };
    expect((await call(`/ws/${uuid}`, { headers: { Upgrade: 'websocket' } })).status).toBe(101);
  });
});
