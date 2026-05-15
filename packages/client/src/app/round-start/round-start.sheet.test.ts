// Exercises: round-start.helpers:buildRoundStartTitle

import { describe, expect, it } from 'vitest';
import { buildRoundStartTitle } from './round-start.helpers';

describe('buildRoundStartTitle — empty / whitespace → null', () => {
  it('empty string returns null (descriptor is optional)', () => {
    expect(buildRoundStartTitle('')).toBeNull();
  });

  it('whitespace-only returns null', () => {
    expect(buildRoundStartTitle('   ')).toBeNull();
  });

  it('tab-only returns null', () => {
    expect(buildRoundStartTitle('\t')).toBeNull();
  });
});

describe('buildRoundStartTitle — title trimming', () => {
  it('trims leading and trailing whitespace', () => {
    expect(buildRoundStartTitle('  Login redesign  ')).toBe('Login redesign');
  });

  it('preserves internal whitespace', () => {
    expect(buildRoundStartTitle('Login  flow')).toBe('Login  flow');
  });
});

describe('buildRoundStartTitle — normal submission', () => {
  it('non-empty title is returned trimmed', () => {
    expect(buildRoundStartTitle('Auth refactor')).toBe('Auth refactor');
  });
});
