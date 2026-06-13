/**
 * Tests for the unanimous auto-reveal predicate (ADR-0018, ADR-0020,
 * ADR-0036, ADR-0041).
 *
 * This is the single test surface for the rule — the client and CLI no longer
 * own a copy. Every filter the predicate applies (active roster, online,
 * role, abstain denominator, terminal guard) is exercised here.
 */

import { describe, expect, it } from 'vitest';

import { ABSTAIN_SENTINEL } from './abstain.js';
import { shouldAutoReveal } from './auto-reveal.js';
import type { RoundStatus } from './doc.js';
import type { ParticipantSnapshot } from './doc-projection.js';

/** Build a participant snapshot with sensible defaults (active voter). */
function participant(
  id: string,
  overrides: Partial<ParticipantSnapshot> = {},
): ParticipantSnapshot {
  return { id, displayName: id, joinedAt: 0, ...overrides };
}

/** Convenience: an active voter that is also online. */
const voter = (id: string) => participant(id);
const viewer = (id: string) => participant(id, { role: 'viewer' });
const left = (id: string) => participant(id, { leftAt: 1000, removedBy: 'host' });

const round = (votes: Record<string, string>, status: RoundStatus = 'voting') => ({
  votes,
  status,
});

describe('shouldAutoReveal', () => {
  it('returns false when no round', () => {
    const ps = [voter('v1')];
    expect(shouldAutoReveal(null, ps, new Set(['v1']))).toBe(false);
    expect(shouldAutoReveal(undefined, ps, new Set(['v1']))).toBe(false);
  });

  it('returns false when the online set is empty', () => {
    expect(shouldAutoReveal(round({ v1: '5' }), [voter('v1')], new Set())).toBe(false);
  });

  it('returns true when all online voters have voted', () => {
    const ps = [voter('v1'), voter('v2')];
    expect(shouldAutoReveal(round({ v1: '5', v2: '8' }), ps, new Set(['v1', 'v2']))).toBe(true);
  });

  it('returns true for a single online voter who has voted', () => {
    expect(shouldAutoReveal(round({ v1: '5' }), [voter('v1')], new Set(['v1']))).toBe(true);
  });

  it('returns false when a non-voting online voter remains', () => {
    const ps = [voter('v1'), voter('v2')];
    // v2 is online but has not voted
    expect(shouldAutoReveal(round({ v1: '5' }), ps, new Set(['v1', 'v2']))).toBe(false);
  });

  it('excludes viewers from the denominator (ADR-0020)', () => {
    const ps = [voter('v1'), viewer('view1')];
    // Only the voter counts; viewer has no vote and is ignored.
    expect(shouldAutoReveal(round({ v1: '5' }), ps, new Set(['v1', 'view1']))).toBe(true);
  });

  it('excludes offline participants from the denominator', () => {
    const ps = [voter('v1'), voter('v2')];
    // v2 is in the roster but not online → not counted.
    expect(shouldAutoReveal(round({ v1: '5' }), ps, new Set(['v1']))).toBe(true);
  });

  // ADR-0036 — active roster
  it('excludes an online voter with `leftAt` set from the denominator', () => {
    const ps = [voter('v1'), left('gone')];
    // 'gone' is kicked-but-still-connected; must not count toward unanimity.
    expect(shouldAutoReveal(round({ v1: '5' }), ps, new Set(['v1', 'gone']))).toBe(true);
  });

  // ADR-0041 — abstain math
  it('excludes abstainers from numerator and denominator', () => {
    const ps = [voter('v1'), voter('v2')];
    // v2 abstained; v1 voted numerically → unanimous among non-abstainers.
    expect(
      shouldAutoReveal(round({ v1: '5', v2: ABSTAIN_SENTINEL }), ps, new Set(['v1', 'v2'])),
    ).toBe(true);
  });

  it('returns false when all online voters abstained (denominator 0)', () => {
    const ps = [voter('v1'), voter('v2')];
    expect(
      shouldAutoReveal(
        round({ v1: ABSTAIN_SENTINEL, v2: ABSTAIN_SENTINEL }),
        ps,
        new Set(['v1', 'v2']),
      ),
    ).toBe(false);
  });

  it('returns false when one abstains, one votes, and one has not voted', () => {
    const ps = [voter('v1'), voter('v2'), voter('v3')];
    expect(
      shouldAutoReveal(round({ v1: ABSTAIN_SENTINEL, v2: '5' }), ps, new Set(['v1', 'v2', 'v3'])),
    ).toBe(false);
  });

  // Terminal guard
  it('returns false when the round is already revealed', () => {
    expect(shouldAutoReveal(round({ v1: '5' }, 'revealed'), [voter('v1')], new Set(['v1']))).toBe(
      false,
    );
  });

  it('returns false when the round is skipped', () => {
    expect(shouldAutoReveal(round({ v1: '5' }, 'skipped'), [voter('v1')], new Set(['v1']))).toBe(
      false,
    );
  });

  it('returns false when the round is discarded', () => {
    expect(shouldAutoReveal(round({ v1: '5' }, 'discarded'), [voter('v1')], new Set(['v1']))).toBe(
      false,
    );
  });
});
