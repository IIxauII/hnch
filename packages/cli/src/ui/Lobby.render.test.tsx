/**
 * Render tests for Lobby.tsx covering the patch lines added by issue #111:
 *  - `pastRounds.map(... compactRoundSummary(r, rounds))` (history row)
 *  - `const header = buildResultsHeader(round, rounds)` + the two
 *     `<Text bold>{header}</Text>` bindings in ResultsSection (revealed +
 *     skipped branches).
 *
 * …plus the stat row's adoption of shared round presentation (issue #509).
 *
 * Mounts with ink-testing-library and asserts header / history content.
 */

import { render } from 'ink-testing-library';
import { press, renderInk } from './test-harness.js';
import { describe, expect, it, vi } from 'vitest';
import { ABSTAIN_SENTINEL } from '@hnch/shared';
import type { AgendaItem, DocProjection, Round, Scale } from '@hnch/shared';

import { Lobby } from './Lobby.js';

const SCALE: Scale = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] };

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

/**
 * Strip ANSI styling so an assertion can span a `<Text bold>` boundary —
 * Ink wraps the bold stat value in escape codes mid-string.
 */
function plain(frame: string): string {
  const esc = String.fromCharCode(27);
  return frame
    .split(esc)
    .map((part, i) => (i === 0 ? part : part.replace(/^\[[0-9;]*m/, '')))
    .join('');
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
    createdAt: 0,
    createdBy: 'host',
    status: terminal?.status ?? (rest.timerStartedAt !== undefined ? 'voting' : 'pending'),
    ...(terminal ? { terminalAt: terminal.at } : {}),
    ...rest,
  };
}

const PROJECTION: DocProjection = {
  participants: [
    {
      id: 'host',
      displayName: 'Host',
      joinedAt: 0,
      role: 'voter',
    },
  ],
  settings: {
    hostParticipantId: 'host',
    defaultScale: SCALE,
  },
  rounds: [],
  agenda: [],
  meta: { roomUuid: '', createdAt: 0, createdBy: 'host' },
};

const noop = (): void => {};

function baseProps(rounds: readonly Round[], currentRound: Round | null) {
  return {
    projection: { ...PROJECTION, rounds: [...rounds] },
    onlineIds: new Set(['host']),
    isHost: true,
    participantId: 'host',
    rounds,
    currentRound,
    settingsOpen: false,
    onStartRound: noop,
    onNewRound: noop,
    onRevote: noop,
    roundTitlePromptActive: false,
    roundTitleInput: '',
    onRoundTitleChange: noop,
    onRoundTitleSubmit: noop,
    onRoundTitleCancel: noop,
    roundTicketIdPromptActive: false,
    roundTicketIdInput: '',
    onRoundTicketIdChange: noop,
    onRoundTicketIdSubmit: noop,
    onRoundTicketIdCancel: noop,
    onOpenSettings: noop,
    onHandoffHost: noop,
    onEndSession: noop,
    onShare: noop,
    shareOpen: false,
    onSetShareOpen: noop,
    roomCode: 'ABC123',
    confirmingQuit: false,
    myRole: 'voter' as const,
    onToggleRole: noop,
    descriptorPromptActive: false,
    descriptorInput: '',
    onDescriptorChange: noop,
    onDescriptorSubmit: noop,
    onDescriptorCancel: noop,
    onEditDescriptor: noop,
    canExport: false,
    onExportResults: noop,
    onAgendaAdd: noop,
    agendaAddPromptActive: false,
    agendaAddTitleInput: '',
    onAgendaAddTitleChange: noop,
    onAgendaAddTitleSubmit: noop,
    onAgendaAddTitleCancel: noop,
    agendaAddTicketIdPromptActive: false,
    agendaAddTicketIdInput: '',
    onAgendaAddTicketIdChange: noop,
    onAgendaAddTicketIdSubmit: noop,
    onAgendaAddTicketIdCancel: noop,
  };
}

describe('Lobby render — issue #111 patch lines', () => {
  it('ResultsSection renders re-vote header for a re-voted current round', () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 1000 });
    const r2 = makeRound({
      id: 'r2',
      revealedAt: 2000,
      parentRoundId: 'r1',
      title: 'Auth',
    });
    const { lastFrame } = render(<Lobby {...baseProps([r1, r2], r2)} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Round 2/2 [re-vote]');
    expect(frame).toContain('Auth');
    expect(frame).toContain('Results');
  });

  it('ResultsSection renders skipped header via buildResultsHeader', () => {
    const r1 = makeRound({ id: 'r1', skippedAt: 1000 });
    const { lastFrame } = render(<Lobby {...baseProps([r1], r1)} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Round 1');
    expect(frame).toContain('Skipped');
  });

  it('ResultsSection renders elapsed time when timerStartedAt + status=revealed + terminalAt present', () => {
    // timerStartedAt=0, revealedAt=90_000 → terminalAt=90_000, status='revealed'
    // elapsed branch: round.status === 'revealed' && round.terminalAt !== undefined → formatElapsed
    const r1 = makeRound({ id: 'r1', revealedAt: 90_000, timerStartedAt: 0, votes: { host: '5' } });
    const { lastFrame } = render(<Lobby {...baseProps([r1], r1)} />);
    const frame = lastFrame() ?? '';
    // formatElapsed(0, 90_000) = '1:30'
    expect(frame).toContain('1:30');
  });

  it('ResultsSection omits elapsed when timerStartedAt absent (terminalAt alone not enough)', () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 90_000, votes: { host: '5' } });
    const { lastFrame } = render(<Lobby {...baseProps([r1], r1)} />);
    const frame = lastFrame() ?? '';
    // No timerStartedAt → elapsed branch is null → no time string
    expect(frame).not.toContain('1:30');
  });

  it('ResultsSection clamps a negative elapsed to 0:00 (host clock ahead of ours)', () => {
    const r1 = makeRound({
      id: 'r1',
      revealedAt: 5_000,
      timerStartedAt: 10_000,
      votes: { host: '5' },
    });
    const { lastFrame } = render(<Lobby {...baseProps([r1], r1)} />);
    expect(lastFrame() ?? '').toContain('0:00');
  });

  it('ResultsSection stat row is Avg / Med / Spread on a numeric scale', () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 1000, votes: { host: '5', p2: '5' } });
    const { lastFrame } = render(<Lobby {...baseProps([r1], r1)} />);
    const frame = lastFrame() ?? '';
    expect(plain(frame)).toContain('Avg: 5.0');
    expect(plain(frame)).toContain('Med: 5.0');
    expect(plain(frame)).toContain('Spread: Unanimous');
    // Agreement percentage is retired, not relocated (issue #509).
    expect(frame).not.toContain('Agreement');
  });

  it('ResultsSection stat row is Most common / Spread on a categorical scale', () => {
    const tshirt: Scale = { id: 'tshirt', cards: ['XS', 'S', 'M', 'L', 'XL'] };
    const r1 = makeRound({
      id: 'r1',
      revealedAt: 1000,
      scale: tshirt,
      votes: { host: 'M', p2: 'M', p3: 'L' },
    });
    const { lastFrame } = render(<Lobby {...baseProps([r1], r1)} />);
    const frame = lastFrame() ?? '';
    expect(plain(frame)).toContain('Most common: M');
    expect(plain(frame)).toContain('Spread: Close');
    // The dead `- / - / -` row on non-numeric scales is gone.
    expect(frame).not.toContain('Avg:');
    expect(frame).not.toContain('- / -');
  });

  it('ResultsSection names no most common card on a tie', () => {
    const tshirt: Scale = { id: 'tshirt', cards: ['XS', 'S', 'M', 'L', 'XL'] };
    const r1 = makeRound({
      id: 'r1',
      revealedAt: 1000,
      scale: tshirt,
      votes: { host: 'S', p2: 'S', p3: 'M', p4: 'M' },
    });
    const { lastFrame } = render(<Lobby {...baseProps([r1], r1)} />);
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('Most common:');
    expect(plain(frame)).toContain('Spread: Close');
  });

  it('ResultsSection hides the stat row entirely when nobody voted', () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 1000 });
    const { lastFrame } = render(<Lobby {...baseProps([r1], r1)} />);
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('Avg:');
    expect(frame).not.toContain('Spread:');
    expect(frame).not.toContain('Most common:');
  });

  it('ResultsSection hides the stat row when every voter abstained', () => {
    const r1 = makeRound({
      id: 'r1',
      revealedAt: 1000,
      votes: { host: ABSTAIN_SENTINEL, p2: ABSTAIN_SENTINEL },
    });
    const { lastFrame } = render(<Lobby {...baseProps([r1], r1)} />);
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('Avg:');
    expect(frame).not.toContain('Spread:');
    expect(frame).not.toContain('hnch_abstain');
  });

  it('renders ticket ID prompt block when roundTicketIdPromptActive is true (issue #109)', () => {
    const props = {
      ...baseProps([], null),
      roundTicketIdPromptActive: true,
      roundTicketIdInput: 'PROJ-42',
    };
    const { lastFrame } = render(<Lobby {...props} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Ticket ID');
    expect(frame).toContain('PROJ-42');
  });

  it('legend shows [x] Export when canExport=true and triggers handler on x press', async () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 1000, votes: { host: '5' } });
    const onExportResults = vi.fn();
    const { lastFrame, stdin } = await renderInk(
      <Lobby {...baseProps([r1], r1)} canExport={true} onExportResults={onExportResults} />,
    );
    expect(lastFrame() ?? '').toContain('[x] Export');
    await press(stdin, 'x');
    expect(onExportResults).toHaveBeenCalledOnce();
  });

  it('results table renders (abstained) rows between numeric and (no vote) rows', () => {
    const voter = { id: 'voter', displayName: 'Voter', joinedAt: 0, role: 'voter' as const };
    const abstainer = {
      id: 'abs',
      displayName: 'Abstainer',
      joinedAt: 0,
      role: 'voter' as const,
    };
    const noVoter = {
      id: 'novote',
      displayName: 'NoVoter',
      joinedAt: 0,
      role: 'voter' as const,
    };
    const r1 = makeRound({
      id: 'r1',
      revealedAt: 1000,
      votes: { voter: '5', abs: ABSTAIN_SENTINEL },
    });
    const projection: DocProjection = {
      ...PROJECTION,
      participants: [voter, abstainer, noVoter],
      rounds: [r1],
    };
    const { lastFrame } = render(<Lobby {...baseProps([r1], r1)} projection={projection} />);
    const frame = lastFrame() ?? '';
    // numeric vote row present
    expect(frame).toContain('5');
    // abstained row present
    expect(frame).toContain('(abstained)');
    // no vote row present
    expect(frame).toContain('NoVoter');
    expect(frame).toContain('(no vote)');
    // sentinel raw value must NOT appear
    expect(frame).not.toContain('hnch_abstain');
  });

  it('consensus banner absent when only abstain votes exist', () => {
    const abs1 = { id: 'p1', displayName: 'P1', joinedAt: 0, role: 'voter' as const };
    const abs2 = { id: 'p2', displayName: 'P2', joinedAt: 0, role: 'voter' as const };
    const r1 = makeRound({
      id: 'r1',
      revealedAt: 1000,
      votes: { p1: ABSTAIN_SENTINEL, p2: ABSTAIN_SENTINEL },
    });
    const projection: DocProjection = {
      ...PROJECTION,
      participants: [abs1, abs2],
      rounds: [r1],
    };
    const { lastFrame } = render(<Lobby {...baseProps([r1], r1)} projection={projection} />);
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('Consensus');
  });

  it('legend omits [x] Export and ignores x press when canExport=false', async () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 1000, votes: { host: '5' } });
    const onExportResults = vi.fn();
    const { lastFrame, stdin } = await renderInk(
      <Lobby {...baseProps([r1], r1)} canExport={false} onExportResults={onExportResults} />,
    );
    expect(lastFrame() ?? '').not.toContain('[x] Export');
    await press(stdin, 'x');
    expect(onExportResults).not.toHaveBeenCalled();
  });

  it('history row uses compactRoundSummary with lineage label for re-voted past round', () => {
    // r1 + r2 are terminal past rounds; r3 is the latest (rendered via ResultsSection).
    const r1 = makeRound({ id: 'r1', revealedAt: 1000 });
    const r2 = makeRound({
      id: 'r2',
      revealedAt: 2000,
      parentRoundId: 'r1',
      votes: { host: '5' },
    });
    const r3 = makeRound({ id: 'r3', revealedAt: 3000 });
    const { lastFrame } = render(<Lobby {...baseProps([r1, r2, r3], r3)} />);
    const frame = lastFrame() ?? '';
    // r2 falls into history; its row shows `Round 2/2 [re-vote]` from compactRoundSummary.
    expect(frame).toContain('Round 2/2 [re-vote]');
    expect(frame).toContain('History');
  });
});

// ---------------------------------------------------------------------------
// Cancelled rounds (ADR-0046). A cancelled round is a tombstone: it is listed
// nowhere and takes no number. Shown, it came out as "Round 0".
// ---------------------------------------------------------------------------

describe('Lobby render — cancelled rounds', () => {
  it('leaves a cancelled round out of the history', () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 1000, votes: { host: '3' } });
    const cancelled = makeRound({ id: 'r2', discardedAt: 2000, title: 'Never mind' });
    const r3 = makeRound({ id: 'r3', revealedAt: 3000, votes: { host: '5' } });

    const { lastFrame } = render(<Lobby {...baseProps([r1, cancelled, r3], r3)} />);
    const frame = plain(lastFrame() ?? '');

    expect(frame).toContain('History');
    expect(frame).toContain('Round 1');
    expect(frame).not.toContain('Round 0');
    expect(frame).not.toContain('Never mind');
  });

  it('numbers the round after it as if it had not been there', () => {
    const r1 = makeRound({ id: 'r1', revealedAt: 1000 });
    const cancelled = makeRound({ id: 'r2', discardedAt: 2000 });
    const r3 = makeRound({ id: 'r3', revealedAt: 3000, votes: { host: '5' } });

    const { lastFrame } = render(<Lobby {...baseProps([r1, cancelled, r3], r3)} />);

    expect(plain(lastFrame() ?? '')).toContain('Round 2 — Results');
  });

  it('shows no history at all when the only other round was cancelled', () => {
    const cancelled = makeRound({ id: 'r1', discardedAt: 1000 });
    const r2 = makeRound({ id: 'r2', revealedAt: 2000, votes: { host: '5' } });

    const { lastFrame } = render(<Lobby {...baseProps([cancelled, r2], r2)} />);
    const frame = plain(lastFrame() ?? '');

    expect(frame).toContain('Round 1 — Results');
    expect(frame).not.toContain('History');
  });

  it('shows the empty-session state when the only round in the session was cancelled', () => {
    const cancelled = makeRound({ id: 'r1', discardedAt: 1000 });

    // No round survives to be "current" either — same as a session that
    // never started a round at all (App.tsx passes `null` in that case).
    const { lastFrame } = render(<Lobby {...baseProps([cancelled], null)} />);
    const frame = plain(lastFrame() ?? '');

    expect(frame).toContain('Waiting for participants...');
    expect(frame).toContain('No rounds started yet.');
    expect(frame).not.toContain('Session');
  });
});

// ---------------------------------------------------------------------------
// Agenda panel render tests (issue #153)
// ---------------------------------------------------------------------------

function makeAgendaItem(overrides: Partial<AgendaItem> & { id: string }): AgendaItem {
  return {
    state: 'pending',
    source: 'manual',
    sortKey: 'a0',
    createdAt: 0,
    ...overrides,
  };
}

describe('Lobby agenda panel', () => {
  it('renders nothing when agenda is empty', () => {
    const { lastFrame } = render(<Lobby {...baseProps([], null)} />);
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('── Agenda ──');
  });

  it('renders agenda section when items exist', () => {
    const item = makeAgendaItem({ id: 'i1', title: 'Story One', state: 'pending' });
    const projection: DocProjection = { ...PROJECTION, agenda: [item] };
    const { lastFrame } = render(<Lobby {...baseProps([], null)} projection={projection} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('── Agenda ──');
    expect(frame).toContain('Story One');
  });

  it('labels pending items with • marker', () => {
    const item = makeAgendaItem({ id: 'i1', title: 'Pending Item', state: 'pending' });
    const projection: DocProjection = { ...PROJECTION, agenda: [item] };
    const { lastFrame } = render(<Lobby {...baseProps([], null)} projection={projection} />);
    expect(lastFrame() ?? '').toContain('•');
  });

  it('labels consumed items with ✓ marker', () => {
    const item = makeAgendaItem({ id: 'i1', title: 'Done', state: 'consumed' });
    const projection: DocProjection = { ...PROJECTION, agenda: [item] };
    const { lastFrame } = render(<Lobby {...baseProps([], null)} projection={projection} />);
    expect(lastFrame() ?? '').toContain('✓');
  });

  it('labels skipped items with ~ marker', () => {
    const item = makeAgendaItem({ id: 'i1', title: 'Skipped', state: 'skipped' });
    const projection: DocProjection = { ...PROJECTION, agenda: [item] };
    const { lastFrame } = render(<Lobby {...baseProps([], null)} projection={projection} />);
    expect(lastFrame() ?? '').toContain('~');
  });

  it('hides cancelled items (not rendered)', () => {
    const item = makeAgendaItem({ id: 'i1', title: 'Hidden', state: 'cancelled' });
    const projection: DocProjection = { ...PROJECTION, agenda: [item] };
    const { lastFrame } = render(<Lobby {...baseProps([], null)} projection={projection} />);
    // cancelled items filtered from visible list; no "Hidden" label
    expect(lastFrame() ?? '').not.toContain('Hidden');
  });

  it('shows (next) tag next to first pending item', () => {
    const item = makeAgendaItem({ id: 'i1', title: 'Next Story', state: 'pending' });
    const projection: DocProjection = { ...PROJECTION, agenda: [item] };
    const { lastFrame } = render(<Lobby {...baseProps([], null)} projection={projection} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Next Story');
    expect(frame).toContain('(next)');
  });

  it('shows [a] Agenda hint in host footer when no rounds started', () => {
    const { lastFrame } = render(<Lobby {...baseProps([], null)} />);
    expect(lastFrame() ?? '').toContain('[a] Agenda');
  });

  it('renders agenda add title prompt when agendaAddPromptActive=true', () => {
    const props = {
      ...baseProps([], null),
      agendaAddPromptActive: true,
      agendaAddTitleInput: 'My feature',
    };
    const { lastFrame } = render(<Lobby {...props} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Agenda title');
    expect(frame).toContain('My feature');
  });

  it('renders agenda add ticket prompt when agendaAddTicketIdPromptActive=true', () => {
    const props = {
      ...baseProps([], null),
      agendaAddTicketIdPromptActive: true,
      agendaAddTicketIdInput: 'PROJ-77',
    };
    const { lastFrame } = render(<Lobby {...props} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('ticket ID');
    expect(frame).toContain('PROJ-77');
  });

  it('displays ticket ID in item label', () => {
    const item = makeAgendaItem({ id: 'i2', ticketId: 'ISSUE-5', state: 'pending' });
    const projection: DocProjection = { ...PROJECTION, agenda: [item] };
    const { lastFrame } = render(<Lobby {...baseProps([], null)} projection={projection} />);
    expect(lastFrame() ?? '').toContain('[ISSUE-5]');
  });
});
