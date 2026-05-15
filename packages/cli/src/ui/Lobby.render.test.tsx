/**
 * Render tests for Lobby.tsx covering the patch lines added by issue #111:
 *  - `pastRounds.map(... compactRoundSummary(r, roundNum, rounds))` (history row)
 *  - `const header = buildResultsHeader(round, roundNum, rounds)` + the two
 *     `<Text bold>{header}</Text>` bindings in ResultsSection (revealed +
 *     skipped branches).
 *
 * Mounts with ink-testing-library and asserts header / history content.
 */

import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { DocProjection, Round, Scale } from '@hnch/shared';

import { Lobby } from './Lobby.js';

const SCALE: Scale = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] };

function makeRound(overrides: Partial<Round> & { id: string }): Round {
  return {
    scale: SCALE,
    votes: {},
    createdAt: 0,
    createdBy: 'host',
    ...overrides,
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
    accessMode: 'open',
  },
  rounds: [],
  meta: { sessionEndedAt: undefined },
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
