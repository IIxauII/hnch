/**
 * Render tests for Voting.tsx.
 * Covers abstain keybind (ADR-0041 Phase 3), host keybindings ([r]/[s]/[d]),
 * shared keybindings ([e]/[c]/[w]), viewer rendering, round header display,
 * elapsed timer, and share overlay.
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
    onDiscard: noop,
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

// Exercises: ui/Voting:Voting
describe('Voting — host keybindings [r] [s] [d]', () => {
  it('[r] Reveal calls onReveal for host', async () => {
    const onReveal = vi.fn();
    const { stdin } = render(<Voting {...baseProps({})} onReveal={onReveal} />);
    await flush();
    await act(async () => {
      stdin.write('r');
      await flush();
    });
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it('[s] Skip calls onSkip for host', async () => {
    const onSkip = vi.fn();
    const { stdin } = render(<Voting {...baseProps({})} onSkip={onSkip} />);
    await flush();
    await act(async () => {
      stdin.write('s');
      await flush();
    });
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('[d] Discard calls onDiscard for host', async () => {
    const onDiscard = vi.fn();
    const { stdin } = render(<Voting {...baseProps({})} onDiscard={onDiscard} />);
    await flush();
    await act(async () => {
      stdin.write('d');
      await flush();
    });
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('non-host [r] press does NOT call onReveal', async () => {
    const onReveal = vi.fn();
    const { stdin } = render(<Voting {...baseProps({})} isHost={false} onReveal={onReveal} />);
    await flush();
    await act(async () => {
      stdin.write('r');
      await flush();
    });
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('non-host [s] press does NOT call onSkip', async () => {
    const onSkip = vi.fn();
    const { stdin } = render(<Voting {...baseProps({})} isHost={false} onSkip={onSkip} />);
    await flush();
    await act(async () => {
      stdin.write('s');
      await flush();
    });
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('non-host [d] press does NOT call onDiscard', async () => {
    const onDiscard = vi.fn();
    const { stdin } = render(<Voting {...baseProps({})} isHost={false} onDiscard={onDiscard} />);
    await flush();
    await act(async () => {
      stdin.write('d');
      await flush();
    });
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('footer shows [r] Reveal, [s] Skip, [d] Discard for host', () => {
    const { lastFrame } = render(<Voting {...baseProps({})} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[r] Reveal');
    expect(frame).toContain('[s] Skip');
    expect(frame).toContain('[d] Discard');
  });

  it('footer hides [r], [s], [d] for non-host', () => {
    const { lastFrame } = render(<Voting {...baseProps({})} isHost={false} />);
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('[r] Reveal');
    expect(frame).not.toContain('[s] Skip');
    expect(frame).not.toContain('[d] Discard');
  });
});

// Exercises: ui/Voting:Voting
describe('Voting — shared keybindings [e] [c] [w]', () => {
  it('[e] calls onOpenSettings', async () => {
    const onOpenSettings = vi.fn();
    const { stdin } = render(<Voting {...baseProps({})} onOpenSettings={onOpenSettings} />);
    await flush();
    await act(async () => {
      stdin.write('e');
      await flush();
    });
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('[c] calls onSetShareOpen(true)', async () => {
    const onSetShareOpen = vi.fn();
    const { stdin } = render(<Voting {...baseProps({})} onSetShareOpen={onSetShareOpen} />);
    await flush();
    await act(async () => {
      stdin.write('c');
      await flush();
    });
    expect(onSetShareOpen).toHaveBeenCalledWith(true);
  });

  it('[w] calls onToggleRole', async () => {
    const onToggleRole = vi.fn();
    const { stdin } = render(<Voting {...baseProps({})} onToggleRole={onToggleRole} />);
    await flush();
    await act(async () => {
      stdin.write('w');
      await flush();
    });
    expect(onToggleRole).toHaveBeenCalledOnce();
  });

  it('confirmingQuit disables all keybindings', async () => {
    const onReveal = vi.fn();
    const { stdin } = render(
      <Voting {...baseProps({})} confirmingQuit={true} onReveal={onReveal} />,
    );
    await flush();
    await act(async () => {
      stdin.write('r');
      await flush();
    });
    expect(onReveal).not.toHaveBeenCalled();
  });
});

// Exercises: ui/Voting:Voting
describe('Voting — viewer rendering', () => {
  it('viewer shows "You\'re observing"', () => {
    const { lastFrame } = render(<Voting {...baseProps({ myRole: 'viewer' })} />);
    expect(lastFrame() ?? '').toContain("You're observing");
  });

  it('viewer footer shows "[w] Vote" hint', () => {
    const { lastFrame } = render(<Voting {...baseProps({ myRole: 'viewer' })} />);
    expect(lastFrame() ?? '').toContain('[w] Vote');
  });

  it('voter footer shows "[w] Observe" hint', () => {
    const { lastFrame } = render(<Voting {...baseProps({})} />);
    expect(lastFrame() ?? '').toContain('[w] Observe');
  });
});

// Exercises: ui/Voting:Voting
describe('Voting — round header and elapsed time', () => {
  it('round title appears in header', () => {
    const round = makeRound({ title: 'Auth migration' });
    const { lastFrame } = render(<Voting {...baseProps({ round })} />);
    expect(lastFrame() ?? '').toContain('Auth migration');
  });

  it('round ticketId appears in header', () => {
    const round = makeRound({ ticketId: 'PROJ-42' });
    const { lastFrame } = render(<Voting {...baseProps({ round })} />);
    expect(lastFrame() ?? '').toContain('[PROJ-42]');
  });

  it('renders ⏱ elapsed timer when elapsedMs is set', () => {
    const { lastFrame } = render(<Voting {...baseProps({})} elapsedMs={90_000} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('⏱');
    expect(frame).toContain('1:30');
  });

  it('omits ⏱ timer when elapsedMs is undefined', () => {
    const { lastFrame } = render(<Voting {...baseProps({})} />);
    expect(lastFrame() ?? '').not.toContain('⏱');
  });
});

// Exercises: ui/Voting:Voting
describe('Voting — share overlay', () => {
  it('renders SharePicker (showing room code) when shareOpen is true', () => {
    const { lastFrame } = render(<Voting {...baseProps({})} shareOpen={true} />);
    expect(lastFrame() ?? '').toContain('ABC123');
  });
});
