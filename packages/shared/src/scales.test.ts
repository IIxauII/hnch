import { describe, it, expect } from 'vitest';
import { FIBONACCI_SCALE, BUILTIN_SCALES } from './doc.js';
import {
  resolveScale,
  buildAvailableScales,
  isValidCustomCardLabel,
  getScaleLabel,
  type CustomScale,
  type PresetOverrides,
} from './scales.js';

const CUSTOM: CustomScale = {
  id: 'custom-my-scale',
  label: 'My Scale',
  cards: ['S', 'M', 'L', 'XL'],
};

describe('resolveScale', () => {
  it('returns the builtin scale when no overrides', () => {
    const result = resolveScale('fibonacci');
    expect(result).toEqual(FIBONACCI_SCALE);
  });

  it('returns the builtin scale unchanged when override list is empty', () => {
    const result = resolveScale('fibonacci', { fibonacci: [] });
    expect(result).toEqual(FIBONACCI_SCALE);
  });

  it('filters out disabled card indices for a builtin', () => {
    // Disable '13' (index 6) and '21' (index 7)
    const result = resolveScale('fibonacci', { fibonacci: [6, 7] });
    expect(result).toEqual({ id: 'fibonacci', cards: ['0', '1', '2', '3', '5', '8'] });
  });

  it('overrides for a different scale do not affect the requested scale', () => {
    const result = resolveScale('fibonacci', { 't-shirt': [0, 1] });
    expect(result).toEqual(FIBONACCI_SCALE);
  });

  it('returns a custom scale by id', () => {
    const result = resolveScale('custom-my-scale', {}, [CUSTOM]);
    expect(result).toEqual({ id: 'custom-my-scale', cards: ['S', 'M', 'L', 'XL'] });
  });

  it('returns undefined for an unknown custom id', () => {
    const result = resolveScale('custom-missing', {}, [CUSTOM]);
    expect(result).toBeUndefined();
  });

  it('returns undefined for a completely unknown id', () => {
    const result = resolveScale('unknown-scale');
    expect(result).toBeUndefined();
  });

  it('returns undefined when all cards are disabled', () => {
    const allIndices = FIBONACCI_SCALE.cards.map((_, i) => i);
    const result = resolveScale('fibonacci', { fibonacci: allIndices });
    expect(result).toBeUndefined();
  });
});

describe('buildAvailableScales', () => {
  it('returns all 5 builtins with no args', () => {
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

  it('builtins come before custom scales', () => {
    const scales = buildAvailableScales({}, [CUSTOM]);
    expect(scales).toHaveLength(6);
    expect(scales[5].id).toBe('custom-my-scale');
  });

  it('applies overrides to builtins', () => {
    const overrides: PresetOverrides = { risk: [3] }; // disable 'Critical' (index 3)
    const scales = buildAvailableScales(overrides);
    const risk = scales.find((s) => s.id === 'risk')!;
    expect(risk.cards).toEqual(['Low', 'Medium', 'High']);
  });

  it('does not mutate the original builtin scale object', () => {
    const original = [...BUILTIN_SCALES['fibonacci'].cards];
    buildAvailableScales({ fibonacci: [0] });
    expect(BUILTIN_SCALES['fibonacci'].cards).toEqual(original);
  });

  it('returns empty custom list when customs not provided', () => {
    const scales = buildAvailableScales();
    expect(scales.every((s) => !s.id.startsWith('custom-'))).toBe(true);
  });

  it('preserves custom scale card order', () => {
    const scales = buildAvailableScales({}, [CUSTOM]);
    const custom = scales.find((s) => s.id === 'custom-my-scale')!;
    expect(custom.cards).toEqual(['S', 'M', 'L', 'XL']);
  });

  it('excludes a builtin when all its cards are disabled', () => {
    const allIndices = FIBONACCI_SCALE.cards.map((_, i) => i);
    const scales = buildAvailableScales({ fibonacci: allIndices });
    expect(scales.find((s) => s.id === 'fibonacci')).toBeUndefined();
    expect(scales).toHaveLength(4);
  });
});

describe('isValidCustomCardLabel', () => {
  it('accepts a normal card label', () => {
    expect(isValidCustomCardLabel('5')).toBe(true);
  });

  it('rejects the abstain sentinel (ADR-0041 §9)', () => {
    expect(isValidCustomCardLabel('hnch_abstain')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidCustomCardLabel('')).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(isValidCustomCardLabel('   ')).toBe(false);
  });
});

describe('getScaleLabel', () => {
  it('returns the stored label for a known custom scale', () => {
    expect(getScaleLabel('custom-my-scale', [CUSTOM])).toBe('My Scale');
  });

  it('returns the label even when it contains spaces and punctuation', () => {
    const fancy: CustomScale = {
      id: 'custom-7f3a',
      label: 'Team Bananas (v2)',
      cards: ['1', '2', '3'],
    };
    expect(getScaleLabel('custom-7f3a', [fancy])).toBe('Team Bananas (v2)');
  });

  it('falls back to formatScaleId when the custom label is empty', () => {
    const blank: CustomScale = { id: 'custom-blank-scale', label: '', cards: ['1'] };
    expect(getScaleLabel('custom-blank-scale', [blank])).toBe('Blank Scale');
  });

  it('falls back to formatScaleId when the custom label is whitespace only', () => {
    const ws: CustomScale = { id: 'custom-ws-scale', label: '   ', cards: ['1'] };
    expect(getScaleLabel('custom-ws-scale', [ws])).toBe('Ws Scale');
  });

  it('falls back to formatScaleId when the custom id is not found in the list', () => {
    expect(getScaleLabel('custom-missing', [CUSTOM])).toBe('Missing');
  });

  it('falls back to formatScaleId when customs is undefined', () => {
    expect(getScaleLabel('custom-untracked')).toBe('Untracked');
  });

  it('returns the builtin display name for builtin ids regardless of customs', () => {
    expect(getScaleLabel('fibonacci')).toBe('Fibonacci');
    expect(getScaleLabel('t-shirt', [CUSTOM])).toBe('T-shirt');
  });
});
