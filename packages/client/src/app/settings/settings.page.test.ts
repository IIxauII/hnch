// Exercises: settings.helpers:isValidTheme, isValidAccent, relayUrlDisplayLabel

import { describe, expect, it } from 'vitest';
import { ACCENTS } from '../core/accent.tokens';
import { isValidAccent, isValidTheme, relayUrlDisplayLabel } from './settings.helpers';

// ---------------------------------------------------------------------------
// isValidTheme
// ---------------------------------------------------------------------------

describe('isValidTheme', () => {
  it('accepts "system"', () => {
    expect(isValidTheme('system')).toBe(true);
  });

  it('accepts "light"', () => {
    expect(isValidTheme('light')).toBe(true);
  });

  it('accepts "dark"', () => {
    expect(isValidTheme('dark')).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidTheme(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidTheme(undefined)).toBe(false);
  });

  it('rejects an arbitrary string', () => {
    expect(isValidTheme('midnight')).toBe(false);
    expect(isValidTheme('')).toBe(false);
  });

  it('rejects a number', () => {
    expect(isValidTheme(0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidAccent
// ---------------------------------------------------------------------------

describe('isValidAccent', () => {
  it('accepts all keys present in ACCENTS', () => {
    for (const key of Object.keys(ACCENTS)) {
      expect(isValidAccent(key)).toBe(true);
    }
  });

  it('rejects null', () => {
    expect(isValidAccent(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidAccent(undefined)).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(isValidAccent('neon-pink')).toBe(false);
    expect(isValidAccent('')).toBe(false);
  });

  it('rejects a number', () => {
    expect(isValidAccent(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// relayUrlDisplayLabel
// ---------------------------------------------------------------------------

describe('relayUrlDisplayLabel', () => {
  it('returns the URL when a relay URL override is set', () => {
    expect(relayUrlDisplayLabel('http://localhost:1234')).toBe('http://localhost:1234');
  });

  it('returns "Default" when no relay URL override is set (null)', () => {
    expect(relayUrlDisplayLabel(null)).toBe('Default');
  });

  it('returns "Default" when relay URL override is empty string', () => {
    expect(relayUrlDisplayLabel('')).toBe('Default');
  });

  it('returns "Default" when relay URL override is undefined', () => {
    expect(relayUrlDisplayLabel(undefined)).toBe('Default');
  });
});
