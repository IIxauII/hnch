// Exercises: scale-picker.helpers:previewBuiltinCards

import { describe, expect, it } from 'vitest';
import { previewBuiltinCards } from './scale-picker.helpers';

describe('previewBuiltinCards — no overrides', () => {
  it('shows all fibonacci cards when no override exists', () => {
    expect(previewBuiltinCards('fibonacci', {})).toBe('0 · 1 · 2 · 3 · 5 · 8 · 13 · 21');
  });

  it('shows all t-shirt cards when no override exists', () => {
    expect(previewBuiltinCards('t-shirt', {})).toBe('XS · S · M · L · XL');
  });

  it('returns empty string for unknown scale ID', () => {
    expect(previewBuiltinCards('does-not-exist', {})).toBe('');
  });
});

describe('previewBuiltinCards — with overrides (disabled cards)', () => {
  it('omits cards at a single disabled index', () => {
    // Disable index 0 ('0') from fibonacci
    expect(previewBuiltinCards('fibonacci', { fibonacci: [0] })).toBe(
      '1 · 2 · 3 · 5 · 8 · 13 · 21',
    );
  });

  it('omits multiple disabled cards', () => {
    // Disable indices 0 ('0') and 7 ('21') from fibonacci
    expect(previewBuiltinCards('fibonacci', { fibonacci: [0, 7] })).toBe('1 · 2 · 3 · 5 · 8 · 13');
  });

  it('overrides for a different scale do not affect the queried scale', () => {
    expect(previewBuiltinCards('fibonacci', { 't-shirt': [0] })).toBe(
      '0 · 1 · 2 · 3 · 5 · 8 · 13 · 21',
    );
  });

  it('single card remaining after overrides', () => {
    // Disable all fibonacci except index 4 ('5')
    expect(previewBuiltinCards('fibonacci', { fibonacci: [0, 1, 2, 3, 5, 6, 7] })).toBe('5');
  });
});
