/**
 * Tests for the screen selector (issue #508).
 *
 * The rule is stated against plain projections and a returned screen name —
 * no page, no framework, no stubs. Every case below is a fact about the rule,
 * including the sole-discarded-round case that previously lived as a recovery
 * effect on the Estimating page.
 */

import { describe, expect, it } from 'vitest';

import type { Round, RoundStatus } from './doc.js';
import type { DocProjection } from './doc-projection.js';
import { screenFor } from './screen-for.js';

/** A projection carrying only what `screenFor` reads: the rounds list. */
function projection(rounds: Round[]): DocProjection {
  return {
    meta: {} as DocProjection['meta'],
    settings: {} as DocProjection['settings'],
    participants: [],
    rounds,
    agenda: [],
  };
}

function round(id: string, status: RoundStatus): Round {
  return {
    id,
    createdAt: 0,
    createdBy: 'host',
    status,
    scale: { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] },
    votes: {},
    ...(status === 'pending' || status === 'voting' ? {} : { terminalAt: 9999 }),
  };
}

describe('screenFor', () => {
  it('no rounds → lobby', () => {
    expect(screenFor(projection([]))).toBe('lobby');
  });

  it('a single pending round → estimating', () => {
    expect(screenFor(projection([round('r1', 'pending')]))).toBe('estimating');
  });

  it('a single voting round → estimating', () => {
    expect(screenFor(projection([round('r1', 'voting')]))).toBe('estimating');
  });

  it('a single revealed round → lobby', () => {
    expect(screenFor(projection([round('r1', 'revealed')]))).toBe('lobby');
  });

  it('a single skipped round → lobby', () => {
    expect(screenFor(projection([round('r1', 'skipped')]))).toBe('lobby');
  });

  // The load-bearing case: `currentRound` falls back to the last
  // non-discarded round and so returns null here, which is why the old
  // auto-nav effect could not see this transition and needed a second
  // effect scanning the raw rounds array to recover.
  it('a single discarded round → lobby', () => {
    expect(screenFor(projection([round('r1', 'discarded')]))).toBe('lobby');
  });

  it('a revealed round followed by a discarded round → lobby', () => {
    expect(screenFor(projection([round('r1', 'revealed'), round('r2', 'discarded')]))).toBe(
      'lobby',
    );
  });

  it('a discarded round followed by an active round → estimating', () => {
    expect(screenFor(projection([round('r1', 'discarded'), round('r2', 'voting')]))).toBe(
      'estimating',
    );
  });

  it('all rounds terminal by a mix of causes → lobby', () => {
    expect(
      screenFor(
        projection([
          round('r1', 'revealed'),
          round('r2', 'skipped'),
          round('r3', 'discarded'),
          round('r4', 'revealed'),
        ]),
      ),
    ).toBe('lobby');
  });

  it('an active round earlier in the list still means estimating', () => {
    expect(screenFor(projection([round('r1', 'voting'), round('r2', 'revealed')]))).toBe(
      'estimating',
    );
  });
});
