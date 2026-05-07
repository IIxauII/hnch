/**
 * Unit tests for AppPreferenceService.
 *
 * Covers load, set, clear, and computed relayWsUrl logic.
 * Mocks Capacitor Preferences to keep tests hermetic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Capacitor Preferences
// ---------------------------------------------------------------------------

const mockPreferences = {
  get: vi.fn<(opts: { key: string }) => Promise<{ value: string | null }>>(),
  set: vi.fn<(opts: { key: string; value: string }) => Promise<void>>(),
  remove: vi.fn<(opts: { key: string }) => Promise<void>>(),
};

vi.mock('@capacitor/preferences', () => ({
  Preferences: mockPreferences,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createService() {
  const mod = await import('./app-preference.service');
  return new mod.AppPreferenceService();
}

describe('AppPreferenceService', () => {
  beforeEach(() => {
    mockPreferences.get.mockReset();
    mockPreferences.set.mockReset();
    mockPreferences.remove.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // ensureLoaded — reading from Preferences
  // -------------------------------------------------------------------------

  describe('ensureLoaded', () => {
    it('loads defaultSessionName from Preferences', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.defaultSessionName') return Promise.resolve({ value: 'My Team' });
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.defaultSessionName()).toBe('My Team');
    });

    it('loads defaultPassword flag from Preferences', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.defaultPassword') return Promise.resolve({ value: 'true' });
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.defaultPassword()).toBe(true);
    });

    it('loads relayHttpUrl from Preferences', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.relayUrl') return Promise.resolve({ value: 'http://relay.example.com' });
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.relayHttpUrl()).toBe('http://relay.example.com');
    });

    it('leaves signals at defaults when Preferences returns null for all keys', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.defaultSessionName()).toBeUndefined();
      expect(svc.defaultPassword()).toBe(false);
      expect(svc.relayHttpUrl()).toBeUndefined();
    });

    it('ignores invalid JSON for defaultPassword', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.defaultPassword') return Promise.resolve({ value: 'not-json{' });
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.defaultPassword()).toBe(false);
    });

    it('ignores non-boolean JSON value for defaultPassword', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.defaultPassword') return Promise.resolve({ value: '"yes"' });
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.defaultPassword()).toBe(false);
    });

    it('deduplicates concurrent ensureLoaded calls', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      const svc = await createService();
      await Promise.all([svc.ensureLoaded(), svc.ensureLoaded()]);
      // get() called 3 times total across one batched load (3 keys)
      expect(mockPreferences.get).toHaveBeenCalledTimes(3);
    });
  });

  // -------------------------------------------------------------------------
  // setDefaultSessionName
  // -------------------------------------------------------------------------

  describe('setDefaultSessionName', () => {
    it('updates the signal and persists to Preferences', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();
      await svc.setDefaultSessionName('Sprint Team');
      expect(svc.defaultSessionName()).toBe('Sprint Team');
      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.defaultSessionName',
        value: 'Sprint Team',
      });
    });

    it('clears the preference when passed undefined', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.remove.mockResolvedValue();
      const svc = await createService();
      await svc.setDefaultSessionName(undefined);
      expect(svc.defaultSessionName()).toBeUndefined();
      expect(mockPreferences.remove).toHaveBeenCalledWith({
        key: 'hnch.defaultSessionName',
      });
    });
  });

  // -------------------------------------------------------------------------
  // setDefaultPassword
  // -------------------------------------------------------------------------

  describe('setDefaultPassword', () => {
    it('sets flag to true and persists', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();
      await svc.setDefaultPassword(true);
      expect(svc.defaultPassword()).toBe(true);
      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.defaultPassword',
        value: 'true',
      });
    });

    it('sets flag to false and persists', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();
      await svc.setDefaultPassword(false);
      expect(svc.defaultPassword()).toBe(false);
      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.defaultPassword',
        value: 'false',
      });
    });
  });

  // -------------------------------------------------------------------------
  // setRelayUrl
  // -------------------------------------------------------------------------

  describe('setRelayUrl', () => {
    it('persists HTTP URL and updates signal', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();
      await svc.setRelayUrl('http://localhost:1234');
      expect(svc.relayHttpUrl()).toBe('http://localhost:1234');
      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.relayUrl',
        value: 'http://localhost:1234',
      });
    });

    it('removes preference and clears signal when passed undefined', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.remove.mockResolvedValue();
      const svc = await createService();
      await svc.setRelayUrl(undefined);
      expect(svc.relayHttpUrl()).toBeUndefined();
      expect(mockPreferences.remove).toHaveBeenCalledWith({ key: 'hnch.relayUrl' });
    });
  });

  // -------------------------------------------------------------------------
  // relayWsUrl computed signal
  // -------------------------------------------------------------------------

  describe('relayWsUrl', () => {
    it('is undefined when no HTTP URL is set', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      const svc = await createService();
      expect(svc.relayWsUrl()).toBeUndefined();
    });

    it('transforms http:// to ws://', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();
      await svc.setRelayUrl('http://relay.example.com:1234');
      expect(svc.relayWsUrl()).toBe('ws://relay.example.com:1234');
    });

    it('transforms https:// to wss://', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();
      await svc.setRelayUrl('https://relay.example.com');
      expect(svc.relayWsUrl()).toBe('wss://relay.example.com');
    });

    it('updates reactively when relayHttpUrl changes', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.set.mockResolvedValue();
      mockPreferences.remove.mockResolvedValue();
      const svc = await createService();

      await svc.setRelayUrl('http://host-a.example.com');
      expect(svc.relayWsUrl()).toBe('ws://host-a.example.com');

      await svc.setRelayUrl('https://host-b.example.com');
      expect(svc.relayWsUrl()).toBe('wss://host-b.example.com');

      await svc.setRelayUrl(undefined);
      expect(svc.relayWsUrl()).toBeUndefined();
    });
  });
});
