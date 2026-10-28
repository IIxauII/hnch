// Exercises: shared/revote-label:revoteLabel

import { describe, expect, it } from 'vitest';

import type { Round } from '@hnch/shared';

import { revoteLabel } from './revote-label';

function makeRound(overrides: Partial<Round> & { id: string }): Round {
  return {
    scale: { id: 'fibonacci', cards: ['1', '2'] },
    votes: {},
    createdAt: 0,
    createdBy: 'p1',
    status: 'revealed',
    ...overrides,
  };
}

describe('revoteLabel', () => {
  it('is null for a standalone round', () => {
    const r1 = makeRound({ id: 'r1' });
    expect(revoteLabel('r1', [r1])).toBeNull();
  });

  it('is null for the round a chain starts from', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1' });
    expect(revoteLabel('r1', [r1, r2])).toBeNull();
  });

  it('is "Re-vote" for the first re-vote', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1' });
    expect(revoteLabel('r2', [r1, r2])).toBe('Re-vote');
  });

  it('is "Re-vote" for every later one too', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1' });
    const r3 = makeRound({ id: 'r3', parentRoundId: 'r2' });
    expect(revoteLabel('r3', [r1, r2, r3])).toBe('Re-vote');
  });

  it('does not change when a later re-vote is added', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1' });
    expect(revoteLabel('r2', [r1, r2])).toBe('Re-vote');
    const r3 = makeRound({ id: 'r3', parentRoundId: 'r2' });
    expect(revoteLabel('r2', [r1, r2, r3])).toBe('Re-vote');
  });

  it('is null when the parent is missing', () => {
    const orphan = makeRound({ id: 'r2', parentRoundId: 'missing' });
    expect(revoteLabel('r2', [orphan])).toBeNull();
  });

  it('is null when the parent was discarded', () => {
    const r1 = makeRound({ id: 'r1', status: 'discarded' });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1' });
    expect(revoteLabel('r2', [r1, r2])).toBeNull();
  });

  it('is null for a round that is not in the list', () => {
    expect(revoteLabel('nope', [makeRound({ id: 'r1' })])).toBeNull();
  });
});
