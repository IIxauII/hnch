/**
 * Unit tests for ScalePreferenceService (ADR-0019).
 *
 * Covers load, togglePresetCard, addCustomScale, updateCustomScale,
 * deleteCustomScale, setDefaultScaleId, and the computed availableScales
 * and defaultScale signals. Mocks Capacitor Preferences for hermeticity.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Capacitor Preferences

const mockPreferences = {
  get: vi.fn<(opts: { key: string }) => Promise<{ value: string | null }>>(),
  set: vi.fn<(opts: { key: string; value: string }) => Promise<void>>(),
  remove: vi.fn<(opts: { key: string }) => Promise<void>>(),
};

vi.mock('@capacitor/preferences', () => ({
  Preferences: mockPreferences,
}));

// Helpers

async function createService() {
  const mod = await import('./scale-preference.service');
  return new mod.ScalePreferenceService();
}

function allKeysNull(): (opts: { key: string }) => Promise<{ value: string | null }> {
  return () => Promise.resolve({ value: null });
}

describe('ScalePreferenceService', () => {
  beforeEach(() => {
    mockPreferences.get.mockReset();
    mockPreferences.set.mockReset();
    mockPreferences.remove.mockReset();
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('test-uuid-1234'),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ensureLoaded — defaults

  describe('ensureLoaded (defaults when empty Preferences)', () => {
    it('defaultScaleId defaults to fibonacci', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.defaultScaleId()).toBe('fibonacci');
    });

    it('presetOverrides defaults to empty object', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.presetOverrides()).toEqual({});
    });

    it('customScales defaults to empty array', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.customScales()).toEqual([]);
    });

    it('deduplicates concurrent ensureLoaded calls', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      const svc = await createService();
      await Promise.all([svc.ensureLoaded(), svc.ensureLoaded()]);
      // One batch of 3 get() calls
      expect(mockPreferences.get).toHaveBeenCalledTimes(3);
    });
  });

  // ensureLoaded — restoring persisted values

  describe('ensureLoaded (restoring persisted data)', () => {
    it('restores presetOverrides from JSON', async () => {
      const overrides = { fibonacci: [5, 6] };
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.presetOverrides')
          return Promise.resolve({ value: JSON.stringify(overrides) });
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.presetOverrides()).toEqual(overrides);
    });

    it('ignores malformed JSON for presetOverrides', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.presetOverrides') return Promise.resolve({ value: 'not{json' });
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.presetOverrides()).toEqual({});
    });

    it('restores customScales from JSON', async () => {
      const customs = [{ id: 'custom-abc', label: 'Mine', cards: ['S', 'M', 'L'] }];
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.customScales') return Promise.resolve({ value: JSON.stringify(customs) });
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.customScales()).toEqual(customs);
    });

    it('ignores custom scales that lack the custom- id prefix', async () => {
      const customs = [{ id: 'badprefix', label: 'Mine', cards: ['S'] }];
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.customScales') return Promise.resolve({ value: JSON.stringify(customs) });
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.customScales()).toEqual([]);
    });

    it('restores defaultScaleId from Preferences', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.defaultScaleId') return Promise.resolve({ value: 't-shirt' });
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.defaultScaleId()).toBe('t-shirt');
    });

    it('restores a default that is one of the custom scales', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.defaultScaleId') return Promise.resolve({ value: 'custom-mine' });
        if (key === 'hnch.customScales') {
          return Promise.resolve({
            value: JSON.stringify([{ id: 'custom-mine', label: 'Mine', cards: ['1', '2'] }]),
          });
        }
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.defaultScaleId()).toBe('custom-mine');
    });

    // The picker goes by the id: with one that matches nothing, it has
    // nothing checked.
    it('takes a default that points at a scale that is gone back to Fibonacci', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.defaultScaleId') return Promise.resolve({ value: 'custom-deleted' });
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.defaultScaleId()).toBe('fibonacci');
    });
  });

  describe('togglePresetCard', () => {
    it('disables a card index for a known builtin scale', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();

      await svc.togglePresetCard('fibonacci', 0);

      expect(svc.presetOverrides()).toEqual({ fibonacci: [0] });
      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.presetOverrides',
        value: JSON.stringify({ fibonacci: [0] }),
      });
    });

    it('re-enables a previously disabled card index', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();

      await svc.togglePresetCard('fibonacci', 0);
      await svc.togglePresetCard('fibonacci', 0);

      expect(svc.presetOverrides()).toEqual({});
    });

    it('does not disable the last enabled card (guard prevents empty scale)', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();

      // fibonacci has 8 cards (indices 0-7); disable 7 of them
      const fibCardCount = 8;
      for (let i = 0; i < fibCardCount - 1; i++) {
        await svc.togglePresetCard('fibonacci', i);
      }
      const beforeCount = svc.presetOverrides()['fibonacci']?.length ?? 0;

      // Trying to disable the last one should be blocked
      await svc.togglePresetCard('fibonacci', fibCardCount - 1);
      const afterCount = svc.presetOverrides()['fibonacci']?.length ?? 0;

      expect(afterCount).toBe(beforeCount);
    });

    it('is a no-op for unknown scale ids', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      const svc = await createService();
      await svc.togglePresetCard('nonexistent-scale', 0);
      expect(svc.presetOverrides()).toEqual({});
      expect(mockPreferences.set).not.toHaveBeenCalled();
    });

    it('is a no-op for out-of-range indices', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      const svc = await createService();
      await svc.togglePresetCard('fibonacci', 999);
      expect(svc.presetOverrides()).toEqual({});
    });
  });

  describe('addCustomScale', () => {
    it('appends a new scale and returns its id', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();

      const id = await svc.addCustomScale('My Scale', ['XS', 'S', 'M', 'L']);

      expect(id).toBe('custom-test-uuid-1234');
      expect(svc.customScales()).toHaveLength(1);
      expect(svc.customScales()[0]).toEqual({
        id: 'custom-test-uuid-1234',
        label: 'My Scale',
        cards: ['XS', 'S', 'M', 'L'],
      });
    });

    it('persists to Preferences', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();

      await svc.addCustomScale('Scale A', ['1', '2']);

      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.customScales',
        value: expect.stringContaining('custom-'),
      });
    });

    it('accumulates multiple custom scales', async () => {
      vi.stubGlobal('crypto', {
        randomUUID: vi.fn().mockReturnValueOnce('uuid-1').mockReturnValueOnce('uuid-2'),
      });
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();

      await svc.addCustomScale('A', ['1']);
      await svc.addCustomScale('B', ['2']);

      expect(svc.customScales()).toHaveLength(2);
    });
  });

  describe('updateCustomScale', () => {
    it('updates label and cards in place', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();
      const id = await svc.addCustomScale('Old Label', ['1', '2']);

      await svc.updateCustomScale(id, 'New Label', ['A', 'B', 'C']);

      const updated = svc.customScales()[0]!;
      expect(updated.id).toBe(id);
      expect(updated.label).toBe('New Label');
      expect(updated.cards).toEqual(['A', 'B', 'C']);
    });

    it('is a no-op when id is not found', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();
      await svc.addCustomScale('Keep', ['1']);

      const before = svc.customScales().length;
      await svc.updateCustomScale('custom-nonexistent', 'Changed', ['X']);

      expect(svc.customScales().length).toBe(before);
    });
  });

  describe('deleteCustomScale', () => {
    it('removes the scale by id', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();
      const id = await svc.addCustomScale('Delete Me', ['X']);

      await svc.deleteCustomScale(id);

      expect(svc.customScales()).toHaveLength(0);
    });

    it('is a no-op when id is not found (idempotent)', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      const svc = await createService();
      await expect(svc.deleteCustomScale('custom-ghost')).resolves.toBeUndefined();
      expect(mockPreferences.set).not.toHaveBeenCalled();
    });

    it('takes the default back to Fibonacci when the default is what was deleted', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();
      const id = await svc.addCustomScale('Mine', ['1', '2']);
      await svc.setDefaultScaleId(id);
      expect(svc.defaultScale().id).toBe(id);

      await svc.deleteCustomScale(id);

      expect(svc.defaultScaleId()).toBe('fibonacci');
      expect(svc.defaultScale().id).toBe('fibonacci');
      expect(mockPreferences.set).toHaveBeenLastCalledWith({
        key: 'hnch.defaultScaleId',
        value: 'fibonacci',
      });
    });

    it('leaves the default alone when another scale is deleted', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();
      const id = await svc.addCustomScale('Mine', ['1', '2']);
      await svc.setDefaultScaleId('t-shirt');

      await svc.deleteCustomScale(id);

      expect(svc.defaultScaleId()).toBe('t-shirt');
    });

    it('does not remove other scales', async () => {
      vi.stubGlobal('crypto', {
        randomUUID: vi.fn().mockReturnValueOnce('keep').mockReturnValueOnce('remove'),
      });
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();

      await svc.addCustomScale('Keep', ['1']);
      const removeId = await svc.addCustomScale('Remove', ['2']);

      await svc.deleteCustomScale(removeId);

      expect(svc.customScales()).toHaveLength(1);
      expect(svc.customScales()[0]!.label).toBe('Keep');
    });
  });

  describe('setDefaultScaleId', () => {
    it('updates the defaultScaleId signal', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();

      await svc.setDefaultScaleId('t-shirt');

      expect(svc.defaultScaleId()).toBe('t-shirt');
      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'hnch.defaultScaleId',
        value: 't-shirt',
      });
    });
  });

  // availableScales computed signal

  describe('availableScales', () => {
    it('includes all builtin scales when no overrides or customs', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      const svc = await createService();
      const ids = svc.availableScales().map((s) => s.id);
      expect(ids).toContain('fibonacci');
      expect(ids).toContain('t-shirt');
      expect(ids).toContain('powers-of-2');
    });

    it('appends custom scales after builtins', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();

      await svc.addCustomScale('My Custom', ['A', 'B']);

      const scales = svc.availableScales();
      const lastScale = scales.at(-1)!;
      expect(lastScale.id).toBe('custom-test-uuid-1234');
    });
  });

  // defaultScale computed signal

  describe('defaultScale', () => {
    it('resolves to fibonacci when defaultScaleId is fibonacci', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      const svc = await createService();
      expect(svc.defaultScale().id).toBe('fibonacci');
    });

    it('falls back to fibonacci when id is not found in available scales', async () => {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.defaultScaleId') return Promise.resolve({ value: 'custom-deleted' });
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      expect(svc.defaultScale().id).toBe('fibonacci');
    });

    it('resolves to t-shirt when defaultScaleId is set to t-shirt', async () => {
      mockPreferences.get.mockImplementation(allKeysNull());
      mockPreferences.set.mockResolvedValue();
      const svc = await createService();
      await svc.setDefaultScaleId('t-shirt');
      expect(svc.defaultScale().id).toBe('t-shirt');
    });
  });

  // A device that cannot store

  // The screen is changed before the device has stored the change. What is
  // on screen and not on the device is gone with the next start of the app —
  // and a scale that is there without having been created is created again.
  describe('a change that cannot be stored', () => {
    const SAVED = { id: 'custom-mine', label: 'Mine', cards: ['1', '2'] };

    async function loaded() {
      mockPreferences.get.mockImplementation(({ key }) => {
        if (key === 'hnch.customScales') {
          return Promise.resolve({ value: JSON.stringify([SAVED]) });
        }
        return Promise.resolve({ value: null });
      });
      const svc = await createService();
      await svc.ensureLoaded();
      mockPreferences.set.mockRejectedValue(new Error('storage is full'));
      return svc;
    }

    it('fails for whoever asked for it', async () => {
      const svc = await loaded();

      await expect(svc.addCustomScale('Sizes', ['S', 'M'])).rejects.toThrow('storage is full');
      await expect(svc.updateCustomScale(SAVED.id, 'Ours', ['1', '2'])).rejects.toThrow();
      await expect(svc.deleteCustomScale(SAVED.id)).rejects.toThrow();
      await expect(svc.setDefaultScaleId('t-shirt')).rejects.toThrow();
      await expect(svc.togglePresetCard('fibonacci', 0)).rejects.toThrow();
    });

    it('leaves no scale behind that was not created', async () => {
      const svc = await loaded();

      await svc.addCustomScale('Sizes', ['S', 'M']).catch(() => undefined);

      expect(svc.customScales()).toEqual([SAVED]);
    });

    it('creates it once when it is tried again', async () => {
      const svc = await loaded();
      await svc.addCustomScale('Sizes', ['S', 'M']).catch(() => undefined);
      mockPreferences.set.mockResolvedValue();

      await svc.addCustomScale('Sizes', ['S', 'M']);

      expect(svc.customScales().map((s) => s.label)).toEqual(['Mine', 'Sizes']);
    });

    it('takes an edit back', async () => {
      const svc = await loaded();

      await svc.updateCustomScale(SAVED.id, 'Ours', ['1', '2', '3']).catch(() => undefined);

      expect(svc.customScales()).toEqual([SAVED]);
    });

    it('keeps a scale that could not be deleted, and the default that points at it', async () => {
      const svc = await loaded();
      mockPreferences.set.mockResolvedValueOnce();
      await svc.setDefaultScaleId(SAVED.id);

      await svc.deleteCustomScale(SAVED.id).catch(() => undefined);

      expect(svc.customScales()).toEqual([SAVED]);
      expect(svc.defaultScaleId()).toBe(SAVED.id);
    });

    it('takes a default back, and a card that was turned off', async () => {
      const svc = await loaded();

      await svc.setDefaultScaleId('t-shirt').catch(() => undefined);
      await svc.togglePresetCard('fibonacci', 0).catch(() => undefined);

      expect(svc.defaultScaleId()).toBe('fibonacci');
      expect(svc.presetOverrides()).toEqual({});
    });

    // Two changes, the first of which fails after the second was made: the
    // second is what is shown, and it stays.
    it('does not take back what was changed after it', async () => {
      const svc = await loaded();
      let fail!: (err: Error) => void;
      mockPreferences.set.mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            fail = reject;
          }),
      );
      mockPreferences.set.mockResolvedValueOnce();

      const first = svc.setDefaultScaleId('t-shirt');
      await svc.setDefaultScaleId('linear');
      fail(new Error('storage is full'));
      await first.catch(() => undefined);

      expect(svc.defaultScaleId()).toBe('linear');
    });
  });
});
