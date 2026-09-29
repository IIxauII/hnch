// Exercises: shared/name-initial:nameInitial
// Exercises: shared/name-initial:avatarInitial

import { afterEach, describe, expect, it, vi } from 'vitest';

import { avatarInitial, nameInitial } from './name-initial';

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

  // The segmenter is made once, when the module loads: it has to load
  // without one.
  it('falls back to code points where there is no segmenter', async () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    vi.resetModules();
    const without = await import('./name-initial');

    expect(without.nameInitial('😀 Sam')).toBe('😀');
    expect(without.nameInitial('alice')).toBe('A');
  });
});

describe('avatarInitial', () => {
  it('is the initial of the name', () => {
    expect(avatarInitial('alice')).toBe('A');
  });

  it('is a question mark for somebody without a name', () => {
    expect(avatarInitial('')).toBe('?');
    expect(avatarInitial('   ')).toBe('?');
    expect(avatarInitial(null)).toBe('?');
    expect(avatarInitial(undefined)).toBe('?');
  });
});
