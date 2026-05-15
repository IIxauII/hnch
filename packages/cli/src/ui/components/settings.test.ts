/**
 * Unit tests for LobbySettings item-filter logic and scale-building utilities.
 *
 * All tests import real production symbols — no inline mirrors of component
 * behaviour.
 */

// Exercises: LobbySettings:filterSettingsItems
// Exercises: @hnch/shared:buildAvailableScales

import { describe, it, expect } from 'vitest';
import { filterSettingsItems } from './LobbySettings.js';
import { buildAvailableScales } from '@hnch/shared';

// ── LobbySettings item-filter logic ─────────────────────────────────────────

const ALL_SETTINGS_ITEMS = [
  { label: 'Room name', value: 'room-name' },
  { label: 'Scale', value: 'scale' },
  { label: 'Access', value: 'access' },
  { label: 'Display name', value: 'display-name' },
] as const;

describe('filterSettingsItems (LobbySettings)', () => {
  it('host mode: all 4 items returned', () => {
    const items = filterSettingsItems(ALL_SETTINGS_ITEMS, true);
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.value)).toEqual(['room-name', 'scale', 'access', 'display-name']);
  });

  it('joiner mode: only display-name item present', () => {
    const items = filterSettingsItems(ALL_SETTINGS_ITEMS, false);
    expect(items).toHaveLength(1);
    expect(items[0]!.value).toBe('display-name');
    expect(items[0]!.label).toBe('Display name');
  });

  it('joiner mode: room-name item absent', () => {
    const items = filterSettingsItems(ALL_SETTINGS_ITEMS, false);
    expect(items.find((i) => i.value === 'room-name')).toBeUndefined();
  });

  it('joiner mode: scale item absent', () => {
    const items = filterSettingsItems(ALL_SETTINGS_ITEMS, false);
    expect(items.find((i) => i.value === 'scale')).toBeUndefined();
  });

  it('joiner mode: access item absent', () => {
    const items = filterSettingsItems(ALL_SETTINGS_ITEMS, false);
    expect(items.find((i) => i.value === 'access')).toBeUndefined();
  });
});

// ── Scale availability ───────────────────────────────────────────────────────

describe('buildAvailableScales', () => {
  it('returns all 5 builtins by default', () => {
    const scales = buildAvailableScales();
    expect(scales).toHaveLength(5);
    expect(scales.map((s) => s.id)).toEqual([
      'fibonacci',
      't-shirt',
      'powers-of-2',
      'linear',
      'risk',
    ]);
  });

  it('no builtin scale contains sentinel cards', () => {
    for (const s of buildAvailableScales()) {
      expect(s.cards).not.toContain('?');
      expect(s.cards).not.toContain('☕');
    }
  });

  it('appends custom scales after builtins', () => {
    const scales = buildAvailableScales({}, [
      { id: 'custom-team', label: 'Team', cards: ['S', 'M', 'L'] },
    ]);
    expect(scales).toHaveLength(6);
    expect(scales[5]!.id).toBe('custom-team');
  });

  it('applies preset overrides (disabled card indices)', () => {
    const scales = buildAvailableScales({ fibonacci: [0] }); // disable '0'
    const fib = scales.find((s) => s.id === 'fibonacci')!;
    expect(fib.cards).not.toContain('0');
    expect(fib.cards).toContain('1');
  });
});
