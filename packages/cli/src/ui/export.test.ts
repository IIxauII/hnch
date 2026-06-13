/**
 * Tests for buildExportMarkdown — the CLI export glue between the doc
 * projection and the shared roundsToMarkdown helper.
 */

import { describe, expect, it, vi } from 'vitest';
import { ABSTAIN_SENTINEL, roundsToMarkdown } from '@hnch/shared';
import type { DocProjection, ParticipantSnapshot, Round, Scale } from '@hnch/shared';

import { buildExportMarkdown, exportResultsToClipboard } from './lobby-helpers.js';

const SCALE: Scale = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8', '13'] };

function makeProjection(overrides: {
  participants?: ParticipantSnapshot[];
  rounds?: Round[];
}): DocProjection {
  return {
    meta: { roomUuid: '', createdAt: 0, createdBy: '' },
    settings: {
      name: 'session',
      hostParticipantId: '',
      defaultScale: SCALE,
    },
    participants: overrides.participants ?? [],
    rounds: overrides.rounds ?? [],
    agenda: [],
  };
}

/**
 * Resolve raw terminal timestamps into `status` / `terminalAt` (earliest wins;
 * literal tie reveal>skip>discard) — mirrors `projectRound`.
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
    id: string;
    revealedAt?: number;
    skippedAt?: number;
    discardedAt?: number;
  },
): Round {
  const { revealedAt, skippedAt, discardedAt, ...rest } = overrides;
  const terminal = resolveTerminal(revealedAt, skippedAt, discardedAt);
  return {
    scale: SCALE,
    votes: {},
    createdBy: 'p1',
    createdAt: 1000,
    status: terminal?.status ?? (rest.timerStartedAt !== undefined ? 'voting' : 'pending'),
    ...(terminal ? { terminalAt: terminal.at } : {}),
    ...rest,
  };
}

describe('buildExportMarkdown', () => {
  it('empty projection → empty string', () => {
    expect(buildExportMarkdown(makeProjection({}))).toBe('');
  });

  it('skips non-terminal rounds (voting in progress)', () => {
    const projection = makeProjection({
      participants: [{ id: 'p1', displayName: 'Alice', joinedAt: 0 }],
      rounds: [makeRound({ id: 'r1', votes: { p1: '5' } })],
    });
    expect(buildExportMarkdown(projection)).toBe('');
  });

  it('byte-parity with roundsToMarkdown for revealed rounds', () => {
    const round = makeRound({
      id: 'r1',
      title: 'Auth',
      votes: { p1: '5', p2: '8' },
      timerStartedAt: 0,
      revealedAt: 60_000,
    });
    const participants: ParticipantSnapshot[] = [
      { id: 'p1', displayName: 'Alice', joinedAt: 0 },
      { id: 'p2', displayName: 'Bob', joinedAt: 0 },
    ];
    const projection = makeProjection({ participants, rounds: [round] });

    const direct = roundsToMarkdown({
      rounds: [round],
      participants: Object.fromEntries(participants.map((p) => [p.id, p])),
    });

    expect(buildExportMarkdown(projection)).toBe(direct);
  });

  it('includes departed participants so historical names still resolve (ADR-0036)', () => {
    // Departed participant — has leftAt — but their vote is still in the round.
    const projection = makeProjection({
      participants: [
        { id: 'p1', displayName: 'Alice', joinedAt: 0 },
        { id: 'p2', displayName: 'Bob', joinedAt: 0, leftAt: 5_000 },
      ],
      rounds: [
        makeRound({
          id: 'r1',
          votes: { p1: '5', p2: '8' },
          timerStartedAt: 0,
          revealedAt: 60_000,
        }),
      ],
    });

    const md = buildExportMarkdown(projection);
    expect(md).toContain('Alice');
    expect(md).toContain('Bob');
  });

  it('skipped-only session → empty string (parity with mobile: only revealed rounds emit)', () => {
    const projection = makeProjection({
      participants: [{ id: 'p1', displayName: 'Alice', joinedAt: 0 }],
      rounds: [makeRound({ id: 'r1', title: 'Spike', skippedAt: 5_000 })],
    });
    expect(buildExportMarkdown(projection)).toBe('');
  });
});

// Exercises: ui/lobby-helpers:buildExportMarkdown (abstain regression guard)
describe('buildExportMarkdown — abstain (ADR-0041)', () => {
  it('abstain voter appears as "Abstained" in export, sentinel string not surfaced', () => {
    const projection = makeProjection({
      participants: [
        { id: 'p1', displayName: 'Alice', joinedAt: 0 },
        { id: 'p2', displayName: 'Bob', joinedAt: 0 },
      ],
      rounds: [
        makeRound({
          id: 'r1',
          votes: { p1: '5', p2: ABSTAIN_SENTINEL },
          timerStartedAt: 0,
          revealedAt: 30_000,
        }),
      ],
    });
    const md = buildExportMarkdown(projection);
    expect(md).not.toContain('hnch_abstain');
    expect(md).toContain('Abstained');
    expect(md).toContain('Bob');
  });
});

describe('exportResultsToClipboard', () => {
  const projection = makeProjection({
    participants: [
      { id: 'p1', displayName: 'Alice', joinedAt: 0 },
      { id: 'p2', displayName: 'Bob', joinedAt: 0 },
    ],
    rounds: [
      makeRound({
        id: 'r1',
        title: 'Auth',
        votes: { p1: '5', p2: '8' },
        timerStartedAt: 0,
        revealedAt: 60_000,
      }),
    ],
  });

  it('writes Markdown to clipboard and shows success notice', async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    const showNotice = vi.fn();

    await exportResultsToClipboard(projection, clipboardWrite, showNotice);

    expect(clipboardWrite).toHaveBeenCalledOnce();
    const written = clipboardWrite.mock.calls[0]![0] as string;
    expect(written).toBe(buildExportMarkdown(projection));
    expect(written).toContain('Auth');
    expect(showNotice).toHaveBeenCalledWith('Results copied to clipboard');
  });

  it('shows failure notice when clipboard write rejects', async () => {
    const clipboardWrite = vi.fn().mockRejectedValue(new Error('no clipboard'));
    const showNotice = vi.fn();

    await exportResultsToClipboard(projection, clipboardWrite, showNotice);

    expect(clipboardWrite).toHaveBeenCalledOnce();
    expect(showNotice).toHaveBeenCalledWith('Clipboard write failed');
  });
});
