// Exercises: shared/name-initial:nameInitial

import { afterEach, describe, expect, it, vi } from 'vitest';

import { nameInitial } from './name-initial';

describe('nameInitial', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is the first letter, uppercase', () => {
    expect(nameInitial('alice')).toBe('A');
    expect(nameInitial('Bob')).toBe('B');
  });

  it('skips leading whitespace', () => {
    expect(nameInitial('   carol')).toBe('C');
  });

  it('is empty for a name that is empty, blank or missing', () => {
    expect(nameInitial('')).toBe('');
    expect(nameInitial('   ')).toBe('');
    expect(nameInitial(null)).toBe('');
    expect(nameInitial(undefined)).toBe('');
  });

  // `name[0]` is a UTF-16 unit: for an emoji, the first half of a pair, which
  // renders as the replacement glyph.
  it('keeps an emoji whole', () => {
    expect(nameInitial('😀 Sam')).toBe('😀');
  });

  it('keeps an emoji made of several code points whole', () => {
    expect(nameInitial('👩‍💻 Dev')).toBe('👩‍💻');
    expect(nameInitial('🇩🇪 Team')).toBe('🇩🇪');
    expect(nameInitial('👍🏽 Ok')).toBe('👍🏽');
  });

  it('keeps a letter and its combining mark together', () => {
    // "é" written as e + U+0301.
    expect(nameInitial('émilie')).toBe('É');
  });

  it('uppercases letters outside ASCII', () => {
    expect(nameInitial('émilie')).toBe('É');
    expect(nameInitial('ölaf')).toBe('Ö');
  });

  it('falls back to code points where there is no segmenter', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    expect(nameInitial('😀 Sam')).toBe('😀');
    expect(nameInitial('alice')).toBe('A');
  });
});
