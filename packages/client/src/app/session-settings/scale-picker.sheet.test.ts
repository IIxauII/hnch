/**
 * Unit tests for ScalePickerSheetComponent preview helper logic.
 *
 * No TestBed, no Ionic rendering — pure predicate tests.
 * Three helpers are under test:
 *   preview(scale)      — joins scale.cards with ' · '
 *   previewCards(cards) — joins an arbitrary card array with ' · '
 *   previewBuiltin(id)  — joins enabled cards (respecting overrides) with ' · '
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_SCALES } from '@hnch/shared';
import type { Scale } from '@hnch/shared';

// ---------------------------------------------------------------------------
// Inline implementations mirroring ScalePickerSheetComponent helpers
// ---------------------------------------------------------------------------

function preview(scale: Scale): string {
  return scale.cards.join(' · ');
}

function previewCards(cards: string[]): string {
  return cards.join(' · ');
}

function previewBuiltin(id: string, overrides: Record<string, number[]>): string {
  const builtin = BUILTIN_SCALES[id];
  if (!builtin) return '';
  const disabled = overrides[id] ?? [];
  const cards =
    disabled.length === 0 ? builtin.cards : builtin.cards.filter((_, i) => !disabled.includes(i));
  return previewCards(cards);
}

// ---------------------------------------------------------------------------
// preview(scale)
// ---------------------------------------------------------------------------

describe('preview — joins scale.cards with " · "', () => {
  it('fibonacci scale', () => {
    const fib = BUILTIN_SCALES['fibonacci']!;
    expect(preview(fib)).toBe('0 · 1 · 2 · 3 · 5 · 8 · 13 · 21');
  });

  it('t-shirt scale', () => {
    const ts = BUILTIN_SCALES['t-shirt']!;
    expect(preview(ts)).toBe('XS · S · M · L · XL');
  });

  it('single-card scale', () => {
    const scale: Scale = { id: 'custom-x', cards: ['42'] };
    expect(preview(scale)).toBe('42');
  });

  it('empty card array', () => {
    const scale: Scale = { id: 'custom-empty', cards: [] };
    expect(preview(scale)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// previewCards
// ---------------------------------------------------------------------------

describe('previewCards — joins arbitrary card array', () => {
  it('joins multiple cards with " · "', () => {
    expect(previewCards(['S', 'M', 'L'])).toBe('S · M · L');
  });

  it('single card returns just that card', () => {
    expect(previewCards(['XL'])).toBe('XL');
  });

  it('empty array returns empty string', () => {
    expect(previewCards([])).toBe('');
  });
});

// ---------------------------------------------------------------------------
// previewBuiltin — with and without overrides
// ---------------------------------------------------------------------------

describe('previewBuiltin — no overrides', () => {
  it('shows all fibonacci cards when no override exists', () => {
    expect(previewBuiltin('fibonacci', {})).toBe('0 · 1 · 2 · 3 · 5 · 8 · 13 · 21');
  });

  it('returns empty string for unknown scale ID', () => {
    expect(previewBuiltin('does-not-exist', {})).toBe('');
  });
});

describe('previewBuiltin — with overrides (disabled cards)', () => {
  it('omits cards at disabled indices', () => {
    // Disable index 0 ('0') from fibonacci
    expect(previewBuiltin('fibonacci', { fibonacci: [0] })).toBe('1 · 2 · 3 · 5 · 8 · 13 · 21');
  });

  it('omits multiple disabled cards', () => {
    // Disable indices 0 ('0') and 7 ('21') from fibonacci
    expect(previewBuiltin('fibonacci', { fibonacci: [0, 7] })).toBe('1 · 2 · 3 · 5 · 8 · 13');
  });

  it('overrides for a different scale do not affect the queried scale', () => {
    // Override is for 't-shirt', not fibonacci
    expect(previewBuiltin('fibonacci', { 't-shirt': [0] })).toBe('0 · 1 · 2 · 3 · 5 · 8 · 13 · 21');
  });

  it('single card remaining after overrides', () => {
    // Disable all fibonacci except index 4 ('5')
    expect(previewBuiltin('fibonacci', { fibonacci: [0, 1, 2, 3, 5, 6, 7] })).toBe('5');
  });
});
