/**
 * Unit tests for ParticipantIdService (ADR-0005).
 *
 * Covers legacy key migration, Device.getId() fallback, caching/dedup,
 * and the ensureLoaded alias. Mocks Capacitor Preferences and Device.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Capacitor Preferences
// ---------------------------------------------------------------------------

const mockPreferences = {
  get: vi.fn<(opts: { key: string }) => Promise<{ value: string | null }>>(),
  set: vi.fn<(opts: { key: string; value: string }) => Promise<void>>(),
};

vi.mock('@capacitor/preferences', () => ({
  Preferences: mockPreferences,
}));

// ---------------------------------------------------------------------------
// Mock Capacitor Device
// ---------------------------------------------------------------------------

const mockDevice = {
  getId: vi.fn<() => Promise<{ identifier: string }>>(),
};

vi.mock('@capacitor/device', () => ({
  Device: mockDevice,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Legacy key migration
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Fresh install path (Device.getId())
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Caching / dedup
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // ensureLoaded alias
  // -------------------------------------------------------------------------

  describe('ensureLoaded', () => {
    it('returns the same id as getOrCreateId()', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'alias-id-456' });
      const svc = await createService();
      const id = await svc.ensureLoaded();
      expect(id).toBe('alias-id-456');
    });
  });
});
