import { describe, it, expect } from 'vitest';
import { ABSTAIN_SENTINEL, isAbstainVote } from './abstain.js';

describe('ABSTAIN_SENTINEL', () => {
  it('is the literal string hnch_abstain (frozen contract)', () => {
    expect(ABSTAIN_SENTINEL).toBe('hnch_abstain');
  });
});

describe('isAbstainVote', () => {
  it('returns true for the sentinel', () => {
    expect(isAbstainVote('hnch_abstain')).toBe(true);
  });

  it('returns false for sentinel with trailing space (exact match only)', () => {
    expect(isAbstainVote('hnch_abstain ')).toBe(false);
  });

  it('returns false for a normal card value', () => {
    expect(isAbstainVote('5')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isAbstainVote('')).toBe(false);
  });
});
