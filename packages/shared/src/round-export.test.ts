import { describe, expect, it } from 'vitest';
import { ABSTAIN_SENTINEL } from './abstain.js';
import { FIBONACCI_SCALE, TSHIRT_SCALE } from './doc.js';
import type { Participant, Round } from './doc.js';
import { terminalState } from './round-status.js';
import { roundsToMarkdown } from './round-export.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a projection `Round`. Accepts the raw terminal timestamps
 * (`revealedAt` / `skippedAt` / `discardedAt`) as a fixture convenience and
 * resolves them into the projection's `status` / `terminalAt` exactly as
 * `projectRound` does, so call sites can keep expressing intent in raw terms.
 */
function makeRound(
  overrides: Partial<Round> & {
    id: string;
    revealedAt?: number;
    skippedAt?: number;
    discardedAt?: number;
  },
): Round {
  const { revealedAt, skippedAt, discardedAt, ...rest } = overrides;
  const terminal = terminalState({ revealedAt, skippedAt, discardedAt });
  const terminalAt =
    terminal === 'revealed'
      ? revealedAt
      : terminal === 'skipped'
        ? skippedAt
        : terminal === 'discarded'
          ? discardedAt
          : undefined;
  const status = terminal ?? (rest.timerStartedAt !== undefined ? 'voting' : 'pending');
  return {
    scale: FIBONACCI_SCALE,
    votes: {},
    createdBy: 'p1',
    createdAt: 1000,
    status,
    ...(terminalAt !== undefined ? { terminalAt } : {}),
    ...rest,
  };
}

function makeParticipant(displayName: string, extra?: Partial<Participant>): Participant {
  return { displayName, joinedAt: 0, ...extra };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('roundsToMarkdown', () => {
  it('empty session → empty string', () => {
    expect(roundsToMarkdown({ rounds: [], participants: new Map() })).toBe('');
  });

  it('all rounds unrevealed → empty string', () => {
    const round = makeRound({ id: 'r1', votes: { p1: '5' } });
    expect(
      roundsToMarkdown({
        rounds: [round],
        participants: new Map([['p1', makeParticipant('Alice')]]),
      }),
    ).toBe('');
  });

  it('single revealed round, numeric scale → header + table + avg/med/elapsed', () => {
    const round = makeRound({
      id: 'r1',
      title: 'Auth migration',
      votes: { p1: '5', p2: '8' },
      timerStartedAt: 0,
      revealedAt: 90_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([
        ['p1', makeParticipant('Alice')],
        ['p2', makeParticipant('Bob')],
      ]),
    });

    expect(result).toContain('## Round 1 — Auth migration');
    expect(result).toContain('| Vote | Voters |');
    // numeric stats line — 5 and 8 → mean 6.5 · med 6.5
    expect(result).toContain('Avg 6.5');
    expect(result).toContain('Med 6.5');
    expect(result).toContain('Elapsed 1:30');
  });

  it('single revealed round, T-shirt scale → Most common line, no avg/med', () => {
    const round = makeRound({
      id: 'r1',
      title: 'Refactor cache',
      scale: TSHIRT_SCALE,
      votes: { p1: 'M', p2: 'M', p3: 'L' },
      timerStartedAt: 0,
      revealedAt: 60_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([
        ['p1', makeParticipant('Alice')],
        ['p2', makeParticipant('Bob')],
        ['p3', makeParticipant('Carol')],
      ]),
    });

    expect(result).toContain('## Round 1 — Refactor cache');
    expect(result).toContain('Most common: M');
    expect(result).toContain('Elapsed 1:00');
    expect(result).not.toContain('Avg');
    expect(result).not.toContain('Med ');
  });

  it('two-round re-vote chain → ## heading with ### sub-heading', () => {
    const root = makeRound({
      id: 'r1',
      title: 'Sprint planning',
      votes: { p1: '3' },
      timerStartedAt: 0,
      revealedAt: 30_000,
    });
    const revote = makeRound({
      id: 'r2',
      parentRoundId: 'r1',
      title: 'Sprint planning',
      votes: { p1: '5' },
      timerStartedAt: 30_000,
      revealedAt: 60_000,
    });
    const result = roundsToMarkdown({
      rounds: [root, revote],
      participants: new Map([['p1', makeParticipant('Alice')]]),
    });

    expect(result).toContain('## Round 1 — Sprint planning');
    expect(result).toContain('### Re-vote 2');
    // ## must appear before ###
    expect(result.indexOf('## Round 1')).toBeLessThan(result.indexOf('### Re-vote 2'));
  });

  it('re-vote written second in rounds array still rendered under its root', () => {
    const root = makeRound({
      id: 'r1',
      title: 'Story A',
      votes: { p1: '2' },
      timerStartedAt: 0,
      revealedAt: 10_000,
    });
    const revote = makeRound({
      id: 'r2',
      parentRoundId: 'r1',
      votes: { p1: '3' },
      timerStartedAt: 10_000,
      revealedAt: 20_000,
    });
    // Both in order [root, revote] — revote second
    const result = roundsToMarkdown({
      rounds: [root, revote],
      participants: new Map([['p1', makeParticipant('Alice')]]),
    });

    const h2pos = result.indexOf('## Round 1');
    const h3pos = result.indexOf('### Re-vote 2');
    expect(h2pos).toBeGreaterThanOrEqual(0);
    expect(h3pos).toBeGreaterThanOrEqual(0);
    expect(h2pos).toBeLessThan(h3pos);
  });

  it('departed participant (leftAt set) still resolves to displayName', () => {
    const round = makeRound({
      id: 'r1',
      votes: { p1: '5', p2: '8' },
      timerStartedAt: 0,
      revealedAt: 10_000,
    });
    const departed: Participant = makeParticipant('Departed Dave', {
      leftAt: 5_000,
      removedBy: 'p1',
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([
        ['p1', makeParticipant('Alice')],
        ['p2', departed],
      ]),
    });

    expect(result).toContain('Departed Dave');
  });

  it('untitled round → ## Round N with no em-dash', () => {
    const round = makeRound({
      id: 'r1',
      votes: { p1: '5' },
      revealedAt: 10_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([['p1', makeParticipant('Alice')]]),
    });

    expect(result).toContain('## Round 1\n');
    expect(result).not.toContain('## Round 1 —');
  });

  it('round with revealedAt null/undefined → omitted', () => {
    const revealed = makeRound({
      id: 'r1',
      title: 'Visible',
      votes: { p1: '5' },
      revealedAt: 10_000,
    });
    const unrevealed = makeRound({
      id: 'r2',
      title: 'Hidden',
      votes: { p1: '8' },
      // no revealedAt
    });
    const result = roundsToMarkdown({
      rounds: [revealed, unrevealed],
      participants: new Map([['p1', makeParticipant('Alice')]]),
    });

    expect(result).toContain('Visible');
    expect(result).not.toContain('Hidden');
  });

  it('accepts Record<string, Participant> as well as Map', () => {
    const round = makeRound({
      id: 'r1',
      votes: { p1: '3' },
      revealedAt: 5_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: { p1: makeParticipant('Alice') },
    });

    expect(result).toContain('Alice');
  });

  it('multi-level chain (re-vote of re-vote): A→B→C all under ## Round 1', () => {
    const a = makeRound({
      id: 'r1',
      title: 'Story A',
      votes: { p1: '1' },
      timerStartedAt: 0,
      revealedAt: 10_000,
    });
    const b = makeRound({
      id: 'r2',
      parentRoundId: 'r1',
      votes: { p1: '2' },
      timerStartedAt: 10_000,
      revealedAt: 20_000,
    });
    const c = makeRound({
      id: 'r3',
      parentRoundId: 'r2',
      votes: { p1: '3' },
      timerStartedAt: 20_000,
      revealedAt: 30_000,
    });
    const result = roundsToMarkdown({
      rounds: [a, b, c],
      participants: new Map([['p1', makeParticipant('Alice')]]),
    });

    // Single ## heading for the root
    expect(result).toContain('## Round 1 — Story A');
    expect((result.match(/^## /gm) ?? []).length).toBe(1);
    // B and C rendered as ### Re-vote
    expect(result).toContain('### Re-vote 2');
    expect(result).toContain('### Re-vote 3');
    // Order: ## before first ###, first ### before second ###
    expect(result.indexOf('## Round 1')).toBeLessThan(result.indexOf('### Re-vote 2'));
    expect(result.indexOf('### Re-vote 2')).toBeLessThan(result.indexOf('### Re-vote 3'));
  });

  it('sort tiebreaker on equal vote counts: scale order wins (5 before 8)', () => {
    const round = makeRound({
      id: 'r1',
      votes: { p1: '5', p2: '5', p3: '8', p4: '8' },
      revealedAt: 10_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([
        ['p1', makeParticipant('Alice')],
        ['p2', makeParticipant('Bob')],
        ['p3', makeParticipant('Carol')],
        ['p4', makeParticipant('Dave')],
      ]),
    });

    const pos5 = result.indexOf('| 5 |');
    const pos8 = result.indexOf('| 8 |');
    expect(pos5).toBeGreaterThanOrEqual(0);
    expect(pos8).toBeGreaterThanOrEqual(0);
    expect(pos5).toBeLessThan(pos8);
  });

  it('revealed round with zero votes and timerStartedAt → table header + Elapsed, no crash', () => {
    const round = makeRound({
      id: 'r1',
      votes: {},
      timerStartedAt: 0,
      revealedAt: 45_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map(),
    });

    expect(result).toContain('## Round 1');
    expect(result).toContain('| Vote | Voters |');
    expect(result).toContain('Elapsed 0:45');
  });

  it('revealed round with zero votes and no timerStartedAt → table header only, no stats line, no crash', () => {
    const round = makeRound({
      id: 'r1',
      votes: {},
      revealedAt: 10_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map(),
    });

    expect(result).toContain('## Round 1');
    expect(result).toContain('| Vote | Voters |');
    expect(result).not.toContain('Elapsed');
    expect(result).not.toContain('Avg');
    expect(result).not.toContain('Most common');
  });

  it('pipe in displayName is escaped in Markdown table output', () => {
    const round = makeRound({
      id: 'r1',
      votes: { p1: '5' },
      revealedAt: 10_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([['p1', makeParticipant('Ali|ce')]]),
    });

    expect(result).toContain('Ali\\|ce');
    expect(result).not.toMatch(/\| Ali\|ce \|/);
  });
});

describe('roundsToMarkdown — ticketId formatting', () => {
  it('URL ticketId on root round with title → heading contains angle-bracket autolink', () => {
    const round = makeRound({
      id: 'r1',
      title: 'Auth migration',
      ticketId: 'https://example.com/PROJ-1',
      votes: { p1: '5' },
      revealedAt: 10_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([['p1', makeParticipant('Alice')]]),
    });
    expect(result).toContain(
      '## Round 1 — Auth migration ([https://example.com/PROJ-1](<https://example.com/PROJ-1>))',
    );
  });

  it('URL ticketId on root round without title → heading still contains link', () => {
    const round = makeRound({
      id: 'r1',
      ticketId: 'https://example.com/PROJ-1',
      votes: { p1: '5' },
      revealedAt: 10_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([['p1', makeParticipant('Alice')]]),
    });
    expect(result).toContain(
      '## Round 1 ([https://example.com/PROJ-1](<https://example.com/PROJ-1>))',
    );
  });

  it('plain ID ticketId → backtick-fenced in heading', () => {
    const round = makeRound({
      id: 'r1',
      title: 'Auth migration',
      ticketId: 'PROJ-123',
      votes: { p1: '5' },
      revealedAt: 10_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([['p1', makeParticipant('Alice')]]),
    });
    expect(result).toContain('## Round 1 — Auth migration (`PROJ-123`)');
  });

  it('URL with parens survives as angle-bracket autolink', () => {
    const url = 'https://en.wikipedia.org/wiki/Foo_(bar)';
    const round = makeRound({
      id: 'r1',
      title: 'Story',
      ticketId: url,
      votes: { p1: '3' },
      revealedAt: 5_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([['p1', makeParticipant('Alice')]]),
    });
    expect(result).toContain(`<${url}>`);
  });

  it('plain ID containing a backtick uses double-backtick fence', () => {
    const round = makeRound({
      id: 'r1',
      title: 'Story',
      ticketId: 'PROJ-`123',
      votes: { p1: '3' },
      revealedAt: 5_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([['p1', makeParticipant('Alice')]]),
    });
    expect(result).toContain('## Round 1 — Story (``PROJ-`123``)');
  });

  it('revote with URL ticketId renders link in ### Re-vote heading', () => {
    const root = makeRound({
      id: 'r1',
      title: 'Sprint planning',
      votes: { p1: '3' },
      timerStartedAt: 0,
      revealedAt: 30_000,
    });
    const revote = makeRound({
      id: 'r2',
      parentRoundId: 'r1',
      ticketId: 'https://example.com/PROJ-2',
      votes: { p1: '5' },
      timerStartedAt: 30_000,
      revealedAt: 60_000,
    });
    const result = roundsToMarkdown({
      rounds: [root, revote],
      participants: new Map([['p1', makeParticipant('Alice')]]),
    });
    expect(result).toContain(
      '### Re-vote 2 ([https://example.com/PROJ-2](<https://example.com/PROJ-2>))',
    );
  });

  it('no ticketId → headings unchanged from prior behavior', () => {
    const round = makeRound({
      id: 'r1',
      title: 'Story',
      votes: { p1: '5' },
      revealedAt: 10_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([['p1', makeParticipant('Alice')]]),
    });
    expect(result).toContain('## Round 1 — Story\n');
    expect(result).not.toContain('(');
  });
});

// Exercises: round-export:roundsToMarkdown (abstain handling, ADR-0041)
describe('roundsToMarkdown — abstain (ADR-0041)', () => {
  it('abstain voter appears as "Abstained" row in table, not as hnch_abstain', () => {
    const round = makeRound({
      id: 'r1',
      votes: { p1: '5', p2: ABSTAIN_SENTINEL },
      revealedAt: 10_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([
        ['p1', makeParticipant('Alice')],
        ['p2', makeParticipant('Bob')],
      ]),
    });

    expect(result).toContain('| Abstained | Bob |');
    expect(result).not.toContain('hnch_abstain');
  });

  it('multiple abstainers grouped in one row, sorted alphabetically', () => {
    const round = makeRound({
      id: 'r1',
      votes: {
        p1: '5',
        p2: ABSTAIN_SENTINEL,
        p3: ABSTAIN_SENTINEL,
      },
      revealedAt: 10_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([
        ['p1', makeParticipant('Alice')],
        ['p2', makeParticipant('Zelda')],
        ['p3', makeParticipant('Bob')],
      ]),
    });

    expect(result).toContain('| Abstained | Bob, Zelda |');
    expect(result).not.toContain('hnch_abstain');
  });

  it('abstain voters excluded from numeric stats (correct avg/med on fibonacci scale)', () => {
    const round = makeRound({
      id: 'r1',
      votes: { p1: '5', p2: '8', p3: ABSTAIN_SENTINEL },
      timerStartedAt: 0,
      revealedAt: 60_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([
        ['p1', makeParticipant('Alice')],
        ['p2', makeParticipant('Bob')],
        ['p3', makeParticipant('Carol')],
      ]),
    });

    // avg of [5, 8] = 6.5; median of [5, 8] = 6.5
    expect(result).toContain('Avg 6.5');
    expect(result).toContain('Med 6.5');
    expect(result).not.toContain('hnch_abstain');
  });

  it('all-abstain round: "Abstained" row present, no numeric/categorical stats line', () => {
    const round = makeRound({
      id: 'r1',
      votes: { p1: ABSTAIN_SENTINEL, p2: ABSTAIN_SENTINEL },
      revealedAt: 10_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([
        ['p1', makeParticipant('Alice')],
        ['p2', makeParticipant('Bob')],
      ]),
    });

    expect(result).toContain('| Abstained |');
    expect(result).not.toContain('hnch_abstain');
    expect(result).not.toContain('Avg');
    expect(result).not.toContain('Most common');
  });

  it('abstain excluded from categorical spread — T-shirt scale', () => {
    const round = makeRound({
      id: 'r1',
      scale: TSHIRT_SCALE,
      votes: { p1: 'M', p2: 'M', p3: ABSTAIN_SENTINEL },
      timerStartedAt: 0,
      revealedAt: 30_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([
        ['p1', makeParticipant('Alice')],
        ['p2', makeParticipant('Bob')],
        ['p3', makeParticipant('Carol')],
      ]),
    });

    // Only M votes → unanimous; should emit "Most common: M", not hnch_abstain
    expect(result).toContain('Most common: M');
    expect(result).not.toContain('hnch_abstain');
  });

  it('abstained row appears after regular vote rows in the table', () => {
    const round = makeRound({
      id: 'r1',
      votes: { p1: '5', p2: ABSTAIN_SENTINEL },
      revealedAt: 10_000,
    });
    const result = roundsToMarkdown({
      rounds: [round],
      participants: new Map([
        ['p1', makeParticipant('Alice')],
        ['p2', makeParticipant('Bob')],
      ]),
    });

    const pos5 = result.indexOf('| 5 |');
    const posAbstain = result.indexOf('| Abstained |');
    expect(pos5).toBeGreaterThanOrEqual(0);
    expect(posAbstain).toBeGreaterThanOrEqual(0);
    expect(pos5).toBeLessThan(posAbstain);
  });
});
