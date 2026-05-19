/**
 * Render tests for Voting.tsx — abstain keybind (ADR-0041 Phase 3).
 */

import { render } from 'ink-testing-library';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ABSTAIN_SENTINEL } from '@hnch/shared';
import type { DocProjection, Round, Scale } from '@hnch/shared';

import { Voting } from './Voting.js';

const SCALE: Scale = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] };

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: 'r1',
    scale: SCALE,
    votes: {},
    createdAt: 0,
    createdBy: 'host',
    ...overrides,
  };
}

const PROJECTION: DocProjection = {
  participants: [{ id: 'host', displayName: 'Host', joinedAt: 0, role: 'voter' }],
  settings: { hostParticipantId: 'host', defaultScale: SCALE },
  rounds: [],
  agenda: [],
  meta: { roomUuid: '', createdAt: 0, createdBy: 'host' },
};

const noop = (): void => {};

function baseProps(overrides: {
  myRole?: 'voter' | 'viewer';
  round?: Round;
  onVote?: ReturnType<typeof vi.fn>;
  onClearVote?: ReturnType<typeof vi.fn>;
}) {
  return {
    projection: PROJECTION,
    round: overrides.round ?? makeRound(),
    onlineIds: new Set(['host']),
    isHost: true,
    myId: 'host',
    myRole: (overrides.myRole ?? 'voter') as 'voter' | 'viewer',
    elapsedMs: undefined,
    roomCode: 'ABC123',
    shareOpen: false,
    settingsOpen: false,
    onVote: overrides.onVote ?? vi.fn(),
    onClearVote: overrides.onClearVote ?? vi.fn(),
    onReveal: noop,
    onSkip: noop,
    onToggleRole: noop,
    onShare: noop,
    onSetShareOpen: noop,
    onOpenSettings: noop,
    confirmingQuit: false,
  };
}

async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

// Exercises: ui/Voting:Voting
describe('Voting — [a] abstain keybind interaction', () => {
  it('pressing a as voter calls onVote with ABSTAIN_SENTINEL', async () => {
    const onVote = vi.fn();
    const { stdin } = render(<Voting {...baseProps({ onVote })} />);
    await flush();
    await act(async () => {
      stdin.write('a');
      await flush();
    });
    expect(onVote).toHaveBeenCalledWith(ABSTAIN_SENTINEL);
  });

  it('pressing a while already abstained calls onClearVote (toggle-off)', async () => {
    const onClearVote = vi.fn();
    const round = makeRound({ votes: { host: ABSTAIN_SENTINEL } });
    const { stdin } = render(<Voting {...baseProps({ onClearVote, round })} />);
    await flush();
    await act(async () => {
      stdin.write('a');
      await flush();
    });
    expect(onClearVote).toHaveBeenCalledOnce();
  });

  it('viewer pressing a does NOT call onVote', async () => {
    const onVote = vi.fn();
    const { stdin } = render(<Voting {...baseProps({ myRole: 'viewer', onVote })} />);
    await flush();
    await act(async () => {
      stdin.write('a');
      await flush();
    });
    expect(onVote).not.toHaveBeenCalled();
  });
});

// Exercises: ui/Voting:Voting
describe('Voting — [a] abstain rendering', () => {
  it('renders [a] Abstain hint for voter', () => {
    const { lastFrame } = render(<Voting {...baseProps({})} />);
    expect(lastFrame() ?? '').toContain('[a] Abstain');
  });

  it('renders [a] Vote hint when voter is abstained', () => {
    const round = makeRound({ votes: { host: ABSTAIN_SENTINEL } });
    const { lastFrame } = render(<Voting {...baseProps({ round })} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[a] Vote');
    expect(frame).toContain('abstaining this round');
  });

  it('does not render [a] hint for viewer', () => {
    const { lastFrame } = render(<Voting {...baseProps({ myRole: 'viewer' })} />);
    expect(lastFrame() ?? '').not.toContain('[a]');
  });

  it('raw sentinel value does not appear in frame when abstained', () => {
    const round = makeRound({ votes: { host: ABSTAIN_SENTINEL } });
    const { lastFrame } = render(<Voting {...baseProps({ round })} />);
    expect(lastFrame() ?? '').not.toContain('hnch_abstain');
  });
});
