/**
 * Unit tests for relay-api.ts fetch wrappers (ADR-0016).
 *
 * Tests:
 * - mintRoom: successful 200, missing httpBaseUrl, non-ok responses
 * - resolveRoom: successful 200, 404 with reason, generic errors, URL encoding
 * - patchRoomAccess: successful 200, missing httpBaseUrl, non-ok responses
 *
 * Uses global fetch mock (vitest).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MintedRoom,
  MintRoomOptions,
  PatchAccessResponse,
  RelayRejectionError,
  ResolvedRoom,
  mintRoom,
  patchRoomAccess,
  resolveRoom,
} from './relay-api';

// Mock global fetch
global.fetch = vi.fn();

const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

describe('relay-api', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  // -------------------------------------------------------------------------
  // mintRoom tests
  // -------------------------------------------------------------------------

  describe('mintRoom', () => {
    it('successful POST /rooms returns MintedRoom', async () => {
      const mockResponse: MintedRoom = {
        uuid: 'test-uuid-1234',
        code: 'ABC123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await mintRoom('http://relay.example.com');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith('http://relay.example.com/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
    });

    it('POST /rooms with passwordHash includes it in body', async () => {
      const mockResponse: MintedRoom = {
        uuid: 'test-uuid-1234',
        code: 'ABC123',
      };

      const options: MintRoomOptions = {
        passwordHash: 'pbkdf2-hash-xyz',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await mintRoom('http://relay.example.com', options);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith('http://relay.example.com/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passwordHash: 'pbkdf2-hash-xyz' }),
      });
    });

    it('throws if httpBaseUrl is undefined', async () => {
      await expect(mintRoom()).rejects.toThrow('mintRoom: httpBaseUrl is required');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws if httpBaseUrl is empty string', async () => {
      await expect(mintRoom('')).rejects.toThrow('mintRoom: httpBaseUrl is required');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws on HTTP error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(mintRoom('http://relay.example.com')).rejects.toThrow('POST /rooms failed: 500');
    });

    it('throws on HTTP error (400)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(mintRoom('http://relay.example.com')).rejects.toThrow('POST /rooms failed: 400');
    });

    it('throws on network error (fetch throws)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(mintRoom('http://relay.example.com')).rejects.toThrow('Network failure');
    });
  });

  // -------------------------------------------------------------------------
  // resolveRoom tests
  // -------------------------------------------------------------------------

  describe('resolveRoom', () => {
    it('successful GET /rooms/:code returns ResolvedRoom', async () => {
      const mockResponse: ResolvedRoom = {
        uuid: 'test-uuid-5678',
        accessMode: 'open',
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await resolveRoom('http://relay.example.com', 'ABC123');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith('http://relay.example.com/rooms/ABC123');
    });

    it('GET /rooms/:code URL-encodes the code', async () => {
      const mockResponse: ResolvedRoom = {
        uuid: 'test-uuid-5678',
        accessMode: 'open',
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      await resolveRoom('http://relay.example.com', 'A/B+C');

      expect(mockFetch).toHaveBeenCalledWith('http://relay.example.com/rooms/A%2FB%2BC');
    });

    it('404 with reason throws RelayRejectionError with reason', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
        ok: false,
        json: vi.fn().mockResolvedValueOnce({ reason: 'unknown-room' }),
      });

      try {
        await resolveRoom('http://relay.example.com', 'BADCODE');
        expect.fail('Should have thrown RelayRejectionError');
      } catch (e) {
        expect(e).toBeInstanceOf(RelayRejectionError);
        if (e instanceof RelayRejectionError) {
          expect(e.reason).toBe('unknown-room');
        }
      }
    });

    it('404 with no JSON body throws RelayRejectionError with default reason', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
        ok: false,
        json: vi.fn().mockRejectedValueOnce(new Error('JSON parse error')),
      });

      try {
        await resolveRoom('http://relay.example.com', 'BADCODE');
      } catch (e) {
        expect(e).toBeInstanceOf(RelayRejectionError);
        if (e instanceof RelayRejectionError) {
          expect(e.reason).toBe('unknown-room');
        }
      }
    });

    it('404 with empty JSON throws RelayRejectionError with default reason', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
        ok: false,
        json: vi.fn().mockResolvedValueOnce({}),
      });

      try {
        await resolveRoom('http://relay.example.com', 'BADCODE');
      } catch (e) {
        expect(e).toBeInstanceOf(RelayRejectionError);
        if (e instanceof RelayRejectionError) {
          expect(e.reason).toBe('unknown-room');
        }
      }
    });

    it('non-404 error throws generic Error', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        ok: false,
      });

      await expect(resolveRoom('http://relay.example.com', 'ABC123')).rejects.toThrow(
        'GET /rooms/:code failed: 500',
      );
    });

    it('403 error throws generic Error', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 403,
        ok: false,
      });

      await expect(resolveRoom('http://relay.example.com', 'ABC123')).rejects.toThrow(
        'GET /rooms/:code failed: 403',
      );
    });

    it('throws if httpBaseUrl is undefined', async () => {
      await expect(resolveRoom(undefined, 'ABC123')).rejects.toThrow(
        'resolveRoom: httpBaseUrl is required',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws if httpBaseUrl is empty string', async () => {
      await expect(resolveRoom('', 'ABC123')).rejects.toThrow(
        'resolveRoom: httpBaseUrl is required',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws on network error (fetch throws)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network unreachable'));

      await expect(resolveRoom('http://relay.example.com', 'ABC123')).rejects.toThrow(
        'Network unreachable',
      );
    });
  });

  // -------------------------------------------------------------------------
  // patchRoomAccess tests
  // -------------------------------------------------------------------------

  describe('patchRoomAccess', () => {
    it('successful PATCH /rooms/:uuid/access returns PatchAccessResponse', async () => {
      const mockResponse: PatchAccessResponse = {
        accessMode: 'password',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await patchRoomAccess(
        'http://relay.example.com',
        'test-uuid-1234',
        'pbkdf2-hash-xyz',
      );

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://relay.example.com/rooms/test-uuid-1234/access',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ passwordHash: 'pbkdf2-hash-xyz' }),
        },
      );
    });

    it('PATCH /rooms/:uuid/access with null passwordHash reverts to open', async () => {
      const mockResponse: PatchAccessResponse = {
        accessMode: 'open',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await patchRoomAccess('http://relay.example.com', 'test-uuid-1234', null);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://relay.example.com/rooms/test-uuid-1234/access',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ passwordHash: null }),
        },
      );
    });

    it('throws if httpBaseUrl is undefined', async () => {
      await expect(patchRoomAccess(undefined, 'test-uuid', 'hash')).rejects.toThrow(
        'patchRoomAccess: httpBaseUrl is required',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws if httpBaseUrl is empty string', async () => {
      await expect(patchRoomAccess('', 'test-uuid', 'hash')).rejects.toThrow(
        'patchRoomAccess: httpBaseUrl is required',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws on HTTP error (400)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(
        patchRoomAccess('http://relay.example.com', 'test-uuid', 'pbkdf2-hash-xyz'),
      ).rejects.toThrow('PATCH /rooms/:uuid/access failed: 400');
    });

    it('throws on HTTP error (403)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(
        patchRoomAccess('http://relay.example.com', 'test-uuid', 'pbkdf2-hash-xyz'),
      ).rejects.toThrow('PATCH /rooms/:uuid/access failed: 403');
    });

    it('throws on HTTP error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(
        patchRoomAccess('http://relay.example.com', 'test-uuid', 'pbkdf2-hash-xyz'),
      ).rejects.toThrow('PATCH /rooms/:uuid/access failed: 500');
    });

    it('throws on network error (fetch throws)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection timeout'));

      await expect(
        patchRoomAccess('http://relay.example.com', 'test-uuid', 'pbkdf2-hash-xyz'),
      ).rejects.toThrow('Connection timeout');
    });
  });
});
