/**
 * Tests for buildExportMarkdown — the CLI export glue between the doc
 * projection and the shared roundsToMarkdown helper.
 */

import { describe, expect, it, vi } from 'vitest';
import { roundsToMarkdown } from '@hnch/shared';
import type { DocProjection, ParticipantSnapshot, Round, Scale } from '@hnch/shared';

import { buildExportMarkdown, exportResultsToClipboard } from './lobby-helpers.js';

const SCALE: Scale = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8', '13'] };

function makeProjection(overrides: {
  participants?: ParticipantSnapshot[];
  rounds?: Round[];
}): DocProjection {
  return {
    meta: { schemaVersion: 1, createdAt: 0 },
    settings: {
      name: 'session',
      hostParticipantId: null,
      defaultScale: SCALE,
    },
    participants: overrides.participants ?? [],
    rounds: overrides.rounds ?? [],
  };
}

function makeRound(overrides: Partial<Round> & { id: string }): Round {
  return {
    scale: SCALE,
    votes: {},
    createdBy: 'p1',
    createdAt: 1000,
    ...overrides,
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
