/**
 * Unit tests for CLI relay-api.ts — the thin fetch wrappers for the
 * relay's HTTP surface (ADR-0016).
 *
 * All network calls are intercepted with vi.stubGlobal('fetch', …)
 * so no real server is required.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mintRoom, resolveRoom, patchRoomAccess } from './relay-api.js';

const BASE = 'http://localhost:1234';

function stubFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: vi.fn().mockResolvedValue(body),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// mintRoom
// ---------------------------------------------------------------------------

describe('mintRoom', () => {
  it('POSTs to /rooms and returns the minted room', async () => {
    stubFetch(201, { uuid: 'room-uuid-1', code: 'ABCD12' });

    const room = await mintRoom(BASE);

    expect(room.uuid).toBe('room-uuid-1');
    expect(room.code).toBe('ABCD12');

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/rooms`);
    expect((init as RequestInit).method).toBe('POST');
  });

  it('sends an empty body when no password', async () => {
    stubFetch(201, { uuid: 'u1', code: 'C1' });
    await mintRoom(BASE);

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({});
  });

  it('includes passwordHash in the body when provided', async () => {
    stubFetch(201, { uuid: 'u2', code: 'C2' });
    await mintRoom(BASE, { passwordHash: 'hash-abc' });

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      passwordHash: 'hash-abc',
    });
  });

  it('throws when the relay returns a non-2xx status', async () => {
    stubFetch(500, {});
    await expect(mintRoom(BASE)).rejects.toThrow('POST /rooms failed: 500');
  });

  it('sets content-type: application/json header', async () => {
    stubFetch(201, { uuid: 'u3', code: 'C3' });
    await mintRoom(BASE);

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      'content-type': 'application/json',
    });
  });
});

// ---------------------------------------------------------------------------
// resolveRoom
// ---------------------------------------------------------------------------

describe('resolveRoom', () => {
  it('GETs /rooms/:code and returns uuid + accessMode', async () => {
    stubFetch(200, { uuid: 'room-uuid-x', accessMode: 'open' });

    const room = await resolveRoom(BASE, 'ABCD12');
    expect(room.uuid).toBe('room-uuid-x');
    expect(room.accessMode).toBe('open');

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${BASE}/rooms/ABCD12`);
  });

  it('URL-encodes the room code', async () => {
    stubFetch(200, { uuid: 'u', accessMode: 'open' });
    await resolveRoom(BASE, 'A B+C');

    const url = String(vi.mocked(globalThis.fetch).mock.calls[0]![0]);
    expect(url).toBe(`${BASE}/rooms/A%20B%2BC`);
  });

  it('throws with the JSON reason on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({ reason: 'unknown-room' }),
      }),
    );
    await expect(resolveRoom(BASE, 'ZZZZZZ')).rejects.toThrow('Room not found: unknown-room');
  });

  it('falls back to "unknown-room" when 404 body has no reason field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({}),
      }),
    );
    await expect(resolveRoom(BASE, 'ZZZZZZ')).rejects.toThrow('Room not found: unknown-room');
  });

  it('falls back to "unknown-room" when 404 body is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
      }),
    );
    await expect(resolveRoom(BASE, 'ZZZZZZ')).rejects.toThrow('Room not found: unknown-room');
  });

  it('throws a generic error for non-404 failure', async () => {
    stubFetch(503, {});
    await expect(resolveRoom(BASE, 'ABCD12')).rejects.toThrow('GET /rooms/:code failed: 503');
  });
});

// ---------------------------------------------------------------------------
// patchRoomAccess
// ---------------------------------------------------------------------------

describe('patchRoomAccess', () => {
  it('PATCHes /rooms/:uuid/access successfully', async () => {
    stubFetch(200, {});

    await expect(patchRoomAccess(BASE, 'room-uuid-1', 'new-hash')).resolves.toBeUndefined();

    const fetchMock = vi.mocked(globalThis.fetch);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/rooms/room-uuid-1/access`);
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      passwordHash: 'new-hash',
    });
  });

  it('sends null passwordHash when removing password', async () => {
    stubFetch(200, {});
    await patchRoomAccess(BASE, 'room-uuid-1', null);

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      passwordHash: null,
    });
  });

  it('throws when relay returns a non-2xx status', async () => {
    stubFetch(403, {});
    await expect(patchRoomAccess(BASE, 'uuid', 'hash')).rejects.toThrow(
      'PATCH /rooms/:uuid/access failed: 403',
    );
  });
});
