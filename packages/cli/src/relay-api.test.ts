import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mintRoom, resolveRoom, patchRoomAccess, type MintedRoom, type ResolvedRoom } from './relay-api.js'

global.fetch = vi.fn()
const mockFetch = global.fetch as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockFetch.mockReset()
})

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe('mintRoom', () => {
  it('success (no password) → returns MintedRoom, calls correct URL/method', async () => {
    const room: MintedRoom = { uuid: 'room-uuid', code: 'ABC123' }
    mockFetch.mockResolvedValue(makeResponse(room))
    const result = await mintRoom('http://relay')
    expect(result).toEqual(room)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://relay/rooms',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('success (with passwordHash) → body includes hash', async () => {
    const room: MintedRoom = { uuid: 'room-uuid', code: 'DEF456' }
    mockFetch.mockResolvedValue(makeResponse(room))
    await mintRoom('http://relay', { passwordHash: 'abc123hash' })
    const call = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(call[1].body as string) as Record<string, unknown>
    expect(body['passwordHash']).toBe('abc123hash')
  })

  it('non-ok status → throws Error matching POST /rooms failed: <status>', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, 500))
    await expect(mintRoom('http://relay')).rejects.toThrow('POST /rooms failed: 500')
  })

  it('network error → propagates', async () => {
    mockFetch.mockRejectedValue(new Error('network failure'))
    await expect(mintRoom('http://relay')).rejects.toThrow('network failure')
  })
})

describe('resolveRoom', () => {
  it('success → returns ResolvedRoom', async () => {
    const room: ResolvedRoom = { uuid: 'room-uuid', accessMode: 'open' }
    mockFetch.mockResolvedValue(makeResponse(room))
    const result = await resolveRoom('http://relay', 'ABC123')
    expect(result).toEqual(room)
  })

  it('URL-encodes the room code', async () => {
    const room: ResolvedRoom = { uuid: 'room-uuid', accessMode: 'open' }
    mockFetch.mockResolvedValue(makeResponse(room))
    await resolveRoom('http://relay', 'A/B+C')
    const call = mockFetch.mock.calls[0] as [string]
    expect(call[0]).toBe('http://relay/rooms/A%2FB%2BC')
  })

  it('404 with { reason: "unknown-room" } → throws Error containing unknown-room', async () => {
    mockFetch.mockResolvedValue(makeResponse({ reason: 'unknown-room' }, 404))
    await expect(resolveRoom('http://relay', 'NOPE')).rejects.toThrow('unknown-room')
  })

  it('404 with null JSON → throws Error containing unknown-room fallback', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.reject(new Error('no json')),
    } as unknown as Response)
    await expect(resolveRoom('http://relay', 'NOPE')).rejects.toThrow('unknown-room')
  })

  it('non-404 non-ok → throws Error matching GET /rooms/:code failed: <status>', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, 503))
    await expect(resolveRoom('http://relay', 'NOPE')).rejects.toThrow('GET /rooms/:code failed: 503')
  })

  it('network error → propagates', async () => {
    mockFetch.mockRejectedValue(new Error('network gone'))
    await expect(resolveRoom('http://relay', 'NOPE')).rejects.toThrow('network gone')
  })
})

describe('patchRoomAccess', () => {
  it('success (hash set) → resolves, sends correct body', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, 200))
    await expect(patchRoomAccess('http://relay', 'room-uuid', 'hash-value')).resolves.toBeUndefined()
    const call = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('http://relay/rooms/room-uuid/access')
    const body = JSON.parse(call[1].body as string) as Record<string, unknown>
    expect(body['passwordHash']).toBe('hash-value')
  })

  it('success (null hash) → sends { passwordHash: null }', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, 200))
    await patchRoomAccess('http://relay', 'room-uuid', null)
    const call = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(call[1].body as string) as Record<string, unknown>
    expect(body['passwordHash']).toBeNull()
  })

  it('non-ok status → throws Error matching PATCH /rooms/:uuid/access failed: <status>', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, 403))
    await expect(patchRoomAccess('http://relay', 'room-uuid', 'h')).rejects.toThrow(
      'PATCH /rooms/:uuid/access failed: 403',
    )
  })

  it('network error → propagates', async () => {
    mockFetch.mockRejectedValue(new Error('connection refused'))
    await expect(patchRoomAccess('http://relay', 'room-uuid', null)).rejects.toThrow(
      'connection refused',
    )
  })
})
