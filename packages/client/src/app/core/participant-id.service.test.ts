/**
 * Unit tests for ParticipantIdService (ADR-0005).
 *
 * Covers legacy key migration, Device.getId() fallback, caching/dedup,
 * and the ensureLoaded alias. Mocks Capacitor Preferences and Device.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPreferences = {
  get: vi.fn<(opts: { key: string }) => Promise<{ value: string | null }>>(),
  set: vi.fn<(opts: { key: string; value: string }) => Promise<void>>(),
};

vi.mock('@capacitor/preferences', () => ({
  Preferences: mockPreferences,
}));

const mockDevice = {
  getId: vi.fn<() => Promise<{ identifier: string }>>(),
};

vi.mock('@capacitor/device', () => ({
  Device: mockDevice,
}));

async function createService() {
  const mod = await import('./participant-id.service');
  return new mod.ParticipantIdService();
}

describe('ParticipantIdService', () => {
  beforeEach(() => {
    mockPreferences.get.mockReset();
    mockPreferences.set.mockReset();
    mockDevice.getId.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('legacy key migration', () => {
    it('returns the legacy participantId when it exists in Preferences', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'legacy-device-id-abc' });
      const svc = await createService();
      const id = await svc.getOrCreateId();
      expect(id).toBe('legacy-device-id-abc');
    });

    it('does NOT call Device.getId() when the legacy key is present', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'legacy-device-id-abc' });
      const svc = await createService();
      await svc.getOrCreateId();
      expect(mockDevice.getId).not.toHaveBeenCalled();
    });

    it('caches the legacy id in the signal after first resolution', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'legacy-id-123' });
      const svc = await createService();
      await svc.getOrCreateId();
      expect(svc.id()).toBe('legacy-id-123');
    });
  });

  // Fresh install path (Device.getId())

  describe('fresh install (Device.getId() fallback)', () => {
    it('calls Device.getId() when no legacy key exists', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.set.mockResolvedValue();
      mockDevice.getId.mockResolvedValue({ identifier: 'device-native-id-xyz' });

      const svc = await createService();
      const id = await svc.getOrCreateId();

      expect(id).toBe('device-native-id-xyz');
      expect(mockDevice.getId).toHaveBeenCalledOnce();
    });

    it('writes the Device.getId() result to Preferences under the legacy key', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.set.mockResolvedValue();
      mockDevice.getId.mockResolvedValue({ identifier: 'device-native-id-xyz' });

      const svc = await createService();
      await svc.getOrCreateId();

      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.participantId',
        value: 'device-native-id-xyz',
      });
    });

    it('caches the Device id in the signal', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.set.mockResolvedValue();
      mockDevice.getId.mockResolvedValue({ identifier: 'device-native-id-xyz' });

      const svc = await createService();
      await svc.getOrCreateId();

      expect(svc.id()).toBe('device-native-id-xyz');
    });
  });

  describe('caching / dedup', () => {
    it('id() returns null before getOrCreateId() has resolved', async () => {
      const svc = await createService();
      // Do not call getOrCreateId
      expect(svc.id()).toBeNull();
    });

    it('subsequent calls return the cached value without hitting Preferences again', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'cached-id' });
      const svc = await createService();

      await svc.getOrCreateId();
      await svc.getOrCreateId();

      expect(mockPreferences.get).toHaveBeenCalledOnce();
    });

    it('concurrent calls deduplicate to a single Preferences read', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'concurrent-id' });
      const svc = await createService();

      const [id1, id2] = await Promise.all([svc.getOrCreateId(), svc.getOrCreateId()]);

      expect(id1).toBe('concurrent-id');
      expect(id2).toBe('concurrent-id');
      expect(mockPreferences.get).toHaveBeenCalledOnce();
    });
  });

  describe('ensureLoaded', () => {
    it('returns the same id as getOrCreateId()', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'alias-id-456' });
      const svc = await createService();
      const id = await svc.ensureLoaded();
      expect(id).toBe('alias-id-456');
    });
  });

  // ADR-0059: one device key per install, next to the participant id.
  describe('device key', () => {
    let store: Map<string, string>;

    beforeEach(() => {
      store = new Map();
      mockPreferences.get.mockImplementation(async ({ key }) => ({
        value: store.get(key) ?? null,
      }));
      mockPreferences.set.mockImplementation(async ({ key, value }) => {
        store.set(key, value);
      });
    });

    it('creates a 256-bit key on first need and keeps it in the device store', async () => {
      const svc = await createService();
      const key = await svc.getOrCreateDeviceKey();
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expect(store.get('hnch.deviceKey')).toBe(key);
    });

    it('reuses the stored key, also after a restart', async () => {
      const first = await (await createService()).getOrCreateDeviceKey();
      const svc = await createService();
      expect(await svc.getOrCreateDeviceKey()).toBe(first);
      expect(await svc.getOrCreateDeviceKey()).toBe(first);
    });

    it('concurrent first calls agree on one key', async () => {
      const svc = await createService();
      const [a, b] = await Promise.all([svc.getOrCreateDeviceKey(), svc.getOrCreateDeviceKey()]);
      expect(a).toBe(b);
      expect(mockPreferences.set).toHaveBeenCalledOnce();
    });

    it('replaces a malformed stored key', async () => {
      store.set('hnch.deviceKey', 'not-a-key');
      const key = await (await createService()).getOrCreateDeviceKey();
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expect(store.get('hnch.deviceKey')).toBe(key);
    });

    it('reads an upper-case stored key as the same key', async () => {
      store.set('hnch.deviceKey', 'AB'.repeat(32));
      expect(await (await createService()).getOrCreateDeviceKey()).toBe('ab'.repeat(32));
    });

    it("derives a room's participant key the way the relay does", async () => {
      // The relay's own vector (packages/relay/src/participant-key.test.ts).
      store.set(
        'hnch.deviceKey',
        '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      );
      const svc = await createService();
      await expect(svc.participantKeyFor('0f8e1c52-3b7a-4d2e-9c61-5a4b3c2d1e0f')).resolves.toBe(
        'a6bf5f0ce5727a5eab653a0902c3aea1d51870396611d94f1b630980b74112b6',
      );
    });
  });
});
