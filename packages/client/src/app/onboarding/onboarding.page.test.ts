// Exercises: onboarding.helpers:canContinue

import { describe, expect, it } from 'vitest';
import { canContinue } from './onboarding.helpers';

describe('canContinue', () => {
  it('returns false for an empty string', () => {
    expect(canContinue('')).toBe(false);
  });

  it('returns false for a whitespace-only string', () => {
    expect(canContinue('   ')).toBe(false);
    expect(canContinue('\t')).toBe(false);
    expect(canContinue('\n')).toBe(false);
  });

  it('returns true for a single character', () => {
    expect(canContinue('A')).toBe(true);
  });

  it('returns true for a name with leading/trailing spaces', () => {
    expect(canContinue('  Alice  ')).toBe(true);
  });

  it('returns true for a typical display name', () => {
    expect(canContinue('Alice')).toBe(true);
  });

  it('returns true for a name with Unicode characters', () => {
    expect(canContinue('张伟')).toBe(true);
  });
});
