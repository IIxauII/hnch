/**
 * Unit tests for pure helpers exported from lobby-helpers.ts.
 * Imports the real implementations (no inline copies).
 *
 * Round-display rules themselves (chain position, statistics, elapsed) live in
 * shared's round-presentation module and are tested there. What survives here
 * is what stays CLI-local: the compact history row and the results header.
 */

import { describe, expect, it } from 'vitest';

import { ABSTAIN_SENTINEL } from '@hnch/shared';
import type { Round, Scale } from '@hnch/shared';

import { buildResultsHeader, compactRoundSummary } from './lobby-helpers.js';

const SCALE: Scale = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8', '13'] };

/**
 * Resolve raw terminal timestamps into the projection's `status` / `terminalAt`
 * (earliest wins; literal tie reveal>skip>discard) — mirrors `projectRound` so
 * fixtures can keep expressing intent in raw terms.
 */
function resolveTerminal(
  revealedAt?: number,
  skippedAt?: number,
  discardedAt?: number,
): { status: 'revealed' | 'skipped' | 'discarded'; at: number } | null {
  const c: { status: 'revealed' | 'skipped' | 'discarded'; at: number }[] = [];
  if (revealedAt !== undefined) c.push({ status: 'revealed', at: revealedAt });
  if (skippedAt !== undefined) c.push({ status: 'skipped', at: skippedAt });
  if (discardedAt !== undefined) c.push({ status: 'discarded', at: discardedAt });
  if (c.length === 0) return null;
  const rank = { revealed: 0, skipped: 1, discarded: 2 };
  c.sort((a, b) => a.at - b.at || rank[a.status] - rank[b.status]);
  return c[0]!;
}

function makeRound(
  overrides: Partial<Round> & {
    revealedAt?: number;
    skippedAt?: number;
    discardedAt?: number;
  } = {},
): Round {
  const { revealedAt, skippedAt, discardedAt, ...rest } = overrides;
  const terminal = resolveTerminal(revealedAt, skippedAt, discardedAt);
  return {
    id: 'r1',
    scale: SCALE,
    votes: {},
    createdAt: 0,
    createdBy: 'host',
    status: terminal?.status ?? (rest.timerStartedAt !== undefined ? 'voting' : 'pending'),
    ...(terminal ? { terminalAt: terminal.at } : {}),
    ...rest,
  };
}

/**
 * Put `round` at 1-based position `n` in an otherwise unremarkable rounds
 * array. The ordinal is derived from array position now (there is no
 * caller-supplied round number), so a fixture that wants "Round 3" says so by
 * placing the round third.
 */
function atPosition(round: Round, n: number): readonly Round[] {
  const filler = Array.from({ length: n - 1 }, (_, i) => makeRound({ id: `filler-${i}` }));
  return [...filler, round];
}

// ---------------------------------------------------------------------------
// compactRoundSummary
// ---------------------------------------------------------------------------

describe('compactRoundSummary', () => {
  it('no votes → (no votes)', () => {
    const r = makeRound();
    expect(compactRoundSummary(r, [r])).toBe('Round 1: — (no votes)');
  });

  it('single vote → card×1', () => {
    const r = makeRound({ votes: { p1: '5' } });
    expect(compactRoundSummary(r, [r])).toBe('Round 1: — 5×1');
  });

  it('tally sorted by count descending', () => {
    const r = makeRound({ votes: { p1: '5', p2: '5', p3: '8' } });
    expect(compactRoundSummary(r, atPosition(r, 2))).toBe('Round 2: — 5×2, 8×1');
  });

  it('equal counts sorted lexicographically', () => {
    const r = makeRound({ votes: { p1: '8', p2: '3' } });
    expect(compactRoundSummary(r, [r])).toBe('Round 1: — 3×1, 8×1');
  });

  it('includes title when set', () => {
    const r = makeRound({ votes: { p1: '5' }, title: 'Login redesign' });
    expect(compactRoundSummary(r, [r])).toBe('Round 1: Login redesign — 5×1');
  });

  it('includes ticketId when set', () => {
    const r = makeRound({ votes: { p1: '5' }, ticketId: 'PROJ-123' });
    expect(compactRoundSummary(r, [r])).toBe('Round 1: [PROJ-123] — 5×1');
  });

  it('includes both title and ticketId', () => {
    const r = makeRound({ votes: { p1: '5' }, title: 'Auth', ticketId: 'AUTH-42' });
    expect(compactRoundSummary(r, atPosition(r, 3))).toBe('Round 3: Auth [AUTH-42] — 5×1');
  });

  it('appends elapsed time when timerStartedAt and revealedAt present', () => {
    const r = makeRound({ votes: { p1: '5' }, timerStartedAt: 0, revealedAt: 90_000 });
    expect(compactRoundSummary(r, [r])).toBe('Round 1: — 5×1 — 1:30');
  });

  it('omits elapsed when only timerStartedAt is set (not yet revealed)', () => {
    const r = makeRound({ votes: { p1: '5' }, timerStartedAt: 0 });
    expect(compactRoundSummary(r, [r])).toBe('Round 1: — 5×1');
  });

  it('omits elapsed when only revealedAt is set (no timer start)', () => {
    const r = makeRound({ votes: { p1: '5' }, revealedAt: 90_000 });
    expect(compactRoundSummary(r, [r])).toBe('Round 1: — 5×1');
  });

  it('clamps a negative duration to 0:00 (host clock ahead of ours)', () => {
    const r = makeRound({ votes: { p1: '5' }, timerStartedAt: 10_000, revealedAt: 5_000 });
    expect(compactRoundSummary(r, [r])).toBe('Round 1: — 5×1 — 0:00');
  });

  it('skipped round returns "Round N — Skipped"', () => {
    const r = makeRound({ skippedAt: 1_000 });
    expect(compactRoundSummary(r, atPosition(r, 3))).toBe('Round 3: — Skipped');
  });

  it('skipped round includes title and ticketId', () => {
    const r = makeRound({ skippedAt: 1_000, title: 'Auth', ticketId: 'AUTH-1' });
    expect(compactRoundSummary(r, atPosition(r, 2))).toBe('Round 2: Auth [AUTH-1] — Skipped');
  });

  it('earliest terminal wins on CRDT merge: skip (1_000) beats reveal (2_000) → Skipped', () => {
    // projectRound resolves earliest-wins: skippedAt=1_000 < revealedAt=2_000 → status 'skipped'.
    const r = makeRound({ revealedAt: 2_000, skippedAt: 1_000 });
    expect(compactRoundSummary(r, [r])).toBe('Round 1: — Skipped');
  });

  // ── Re-vote lineage (issue #111 AC#7) ──────────────────────────────────────

  it('re-voted round gets "Round D/T [re-vote]" label', () => {
    const r1 = makeRound({ id: 'r1', votes: {} });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1', votes: { p1: '5' } });
    expect(compactRoundSummary(r2, [r1, r2])).toBe('Round 2/2 [re-vote]: — 5×1');
  });

  it('chain root keeps plain "Round N" label (AC#4)', () => {
    const r1 = makeRound({ id: 'r1', votes: { p1: '5' } });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1', votes: {} });
    expect(compactRoundSummary(r1, [r1, r2])).toBe('Round 1: — 5×1');
  });

  it('3-deep chain → "Round 3/3 [re-vote]" (AC#5)', () => {
    const r1 = makeRound({ id: 'r1', votes: {} });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1', votes: {} });
    const r3 = makeRound({ id: 'r3', parentRoundId: 'r2', votes: { p1: '8' } });
    expect(compactRoundSummary(r3, [r1, r2, r3])).toBe('Round 3/3 [re-vote]: — 8×1');
  });

  it('missing parent ref falls back to plain "Round N" (AC#6)', () => {
    const orphan = makeRound({ id: 'r2', parentRoundId: 'missing-root', votes: { p1: '5' } });
    expect(compactRoundSummary(orphan, [orphan])).toBe('Round 1: — 5×1');
  });
});

// Exercises: ui/lobby-helpers:compactRoundSummary
describe('compactRoundSummary — abstain sentinel', () => {
  it('single abstainer → (no votes) (1 abstained)', () => {
    const r = makeRound({ votes: { p1: ABSTAIN_SENTINEL } });
    expect(compactRoundSummary(r, [r])).toBe('Round 1: — (no votes) (1 abstained)');
  });

  it('two abstainers → (no votes) (2 abstained)', () => {
    const r = makeRound({ votes: { p1: ABSTAIN_SENTINEL, p2: ABSTAIN_SENTINEL } });
    expect(compactRoundSummary(r, [r])).toBe('Round 1: — (no votes) (2 abstained)');
  });

  it('mix of numeric and abstain: tally excludes sentinel, suffix appended', () => {
    const r = makeRound({ votes: { p1: '5', p2: '5', p3: ABSTAIN_SENTINEL } });
    expect(compactRoundSummary(r, atPosition(r, 2))).toBe('Round 2: — 5×2 (1 abstained)');
  });

  it('abstain with elapsed: suffix before elapsed', () => {
    const r = makeRound({
      votes: { p1: '5', p2: ABSTAIN_SENTINEL },
      timerStartedAt: 0,
      revealedAt: 60_000,
    });
    expect(compactRoundSummary(r, [r])).toBe('Round 1: — 5×1 (1 abstained) — 1:00');
  });

  it('no abstainers: no suffix', () => {
    const r = makeRound({ votes: { p1: '5', p2: '8' } });
    expect(compactRoundSummary(r, [r])).toBe('Round 1: — 5×1, 8×1');
  });
});

// ---------------------------------------------------------------------------
// buildResultsHeader
// ---------------------------------------------------------------------------

describe('buildResultsHeader', () => {
  it('plain revealed round: "Round 1 — Results"', () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 1000 });
    expect(buildResultsHeader(r1, [r1])).toBe('Round 1 — Results');
  });

  it('includes title and ticketId when set', () => {
    const r1 = makeRound({
      id: 'r1',
      revealedAt: 1000,
      title: 'Auth',
      ticketId: 'AUTH-1',
    });
    expect(buildResultsHeader(r1, [r1])).toBe('Round 1 — Auth [AUTH-1] — Results');
  });

  it('skipped round ends with " — Skipped"', () => {
    const r1 = makeRound({ id: 'r1', skippedAt: 1000 });
    expect(buildResultsHeader(r1, [r1])).toBe('Round 1 — Skipped');
  });

  it('re-voted round surfaces lineage label', () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 1000 });
    const r2 = makeRound({
      id: 'r2',
      revealedAt: 2000,
      parentRoundId: 'r1',
      title: 'Auth',
    });
    expect(buildResultsHeader(r2, [r1, r2])).toBe('Round 2/2 [re-vote] — Auth — Results');
  });

  it('re-voted skipped round', () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 1000 });
    const r2 = makeRound({
      id: 'r2',
      skippedAt: 2000,
      parentRoundId: 'r1',
    });
    expect(buildResultsHeader(r2, [r1, r2])).toBe('Round 2/2 [re-vote] — Skipped');
  });

  it('title only (no ticket)', () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 1000, title: 'Foo' });
    expect(buildResultsHeader(r1, [r1])).toBe('Round 1 — Foo — Results');
  });

  it('ticket only (no title)', () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 1000, ticketId: 'BAR-7' });
    expect(buildResultsHeader(r1, [r1])).toBe('Round 1 [BAR-7] — Results');
  });

  it('ordinal follows array position, not call order', () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 1000 });
    const r2 = makeRound({ id: 'r2', revealedAt: 2000 });
    expect(buildResultsHeader(r2, [r1, r2])).toBe('Round 2 — Results');
  });

  // A discarded round is a tombstone (ADR-0046): it takes no number, so the
  // round that replaces it is called what it would have been.
  it('a discarded round does not count towards the ordinal', () => {
    const r1 = makeRound({ id: 'r1', discardedAt: 1000 });
    const r2 = makeRound({ id: 'r2', revealedAt: 2000 });
    expect(buildResultsHeader(r2, [r1, r2])).toBe('Round 1 — Results');
  });
});
