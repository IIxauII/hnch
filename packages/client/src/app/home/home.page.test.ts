/**
 * Unit tests for HomePage helpers — imports the real exports from
 * home.helpers.ts (no inline mirrors). Tests fail if source breaks.
 */

import { describe, expect, it } from 'vitest';

import { greetingFor, routeForScreen } from './home.helpers';

describe('HomePage — routeForScreen', () => {
  it('lobby → /lobby/:code', () => {
    expect(routeForScreen('lobby', 'ABC123')).toBe('/lobby/ABC123');
  });

  it('estimating → /estimating/:code', () => {
    expect(routeForScreen('estimating', 'XYZ789')).toBe('/estimating/XYZ789');
  });
});

describe('HomePage — greetingFor', () => {
  it('greets by name', () => {
    expect(greetingFor('Alex')).toBe('Hi, Alex');
  });

  it('trims the stored name', () => {
    expect(greetingFor('  Alex  ')).toBe('Hi, Alex');
  });

  it('falls back to a neutral line until the name has loaded', () => {
    expect(greetingFor(null)).toBe('Welcome');
    expect(greetingFor('   ')).toBe('Welcome');
  });
});
