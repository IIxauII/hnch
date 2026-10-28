/**
 * Render-driven coverage for App.tsx focused on the issue #109 two-step
 * round-start prompt (title → ticketId → session.commands.startRound).
 * Mounts App with a stub SessionHandle, presses `s` to open the title
 * prompt, walks the user through both fields, then asserts
 * session.commands.startRound was called with the trimmed args.
 */

import { press, renderInk } from './test-harness.js';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { describe, expect, it, vi } from 'vitest';

import { ABSTAIN_SENTINEL, type DocProjection, type Round, type Scale } from '@hnch/shared';
import type { SessionHandle } from '../session.js';
import { App } from './App.js';

const SCALE: Scale = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] };

function makeProjection(
  rounds: readonly Round[] = [],
  participants: DocProjection['participants'] = [
    { id: 'host', displayName: 'Host', joinedAt: 0, role: 'voter' },
  ],
): DocProjection {
  return {
    participants: [...participants],
    settings: {
      hostParticipantId: 'host',
      defaultScale: SCALE,
    },
    rounds: [...rounds],
    agenda: [],
    meta: { roomUuid: '', createdAt: 0, createdBy: 'host' },
  };
}

function makeSession(
  overrides: {
    current?: Round | null;
    rounds?: readonly Round[];
    participants?: DocProjection['participants'];
    onlineIds?: Set<string>;
    isHost?: boolean;
  } = {},
): {
  session: SessionHandle;
  startRound: ReturnType<typeof vi.fn>;
} {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const startRound = vi.fn().mockReturnValue({ applied: true, id: 'new-round-id', at: 0 });

  const session: SessionHandle = {
    doc,
    awareness,
    roomCode: 'ABC123',
    roomUuid: 'uuid-1',
    passwordHash: undefined,
    hasJoined: () => true,
    commands: {
      startRound,
      revealCurrentRound: vi.fn(() => ({ applied: true, at: 0 })),
      skipCurrentRound: vi.fn(() => ({ applied: true, at: 0 })),
      discardCurrentRound: vi.fn(() => ({ applied: true, at: 0 })),
      toggleCurrentVote: vi.fn(() => ({ applied: true, effect: 'cast' })),
      clearCurrentVote: vi.fn(() => ({ applied: true, effect: 'cleared' })),
      addItem: vi.fn(() => ({ applied: true })),
      editItem: vi.fn(() => ({ applied: true })),
      skipItem: vi.fn(() => ({ applied: true })),
      cancelItem: vi.fn(() => ({ applied: true })),
      moveItem: vi.fn(() => ({ applied: true })),
      rename: vi.fn(() => ({ applied: true })),
      recolor: vi.fn(() => ({ applied: true })),
      toggleRole: vi.fn(() => ({ applied: true })),
      leave: vi.fn(() => ({ applied: true })),
      kick: vi.fn(() => ({ applied: true })),
      handoffHost: vi.fn(() => ({ applied: true })),
      endSession: vi.fn(() => ({ applied: true })),
    },
    projection: () => makeProjection(overrides.rounds ?? [], overrides.participants),
    current: () => overrides.current ?? null,
    isHost: () => overrides.isHost ?? true,
    onlineIds: () => overrides.onlineIds ?? new Set(['host']),
    updateRoundDescriptor: vi.fn(),
    updateName: vi.fn(),
    updateScale: vi.fn(),
    updateAccess: vi.fn().mockResolvedValue(undefined),
    onChange: () => () => undefined,
    onStatusChange: () => () => undefined,
    onHostChange: () => () => undefined,
    disconnect: vi.fn(),
  };

  return { session, startRound };
}

describe('App — round-start two-step prompt (issue #109)', () => {
  it('runs title -> ticketId -> session.commands.startRound({ title, ticketId })', async () => {
    const { session, startRound } = makeSession();
    const { stdin } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );

    // s: open title prompt
    await press(stdin, 's');
    // Type "Auth" + Enter to advance to ticketId step
    await press(stdin, 'Auth');
    await press(stdin, '\r');
    // Type "PROJ-42" + Enter to fire startRound
    await press(stdin, 'PROJ-42');
    await press(stdin, '\r');

    // No agenda item pending -> agendaItemId is omitted
    expect(startRound).toHaveBeenCalledWith({ title: 'Auth', ticketId: 'PROJ-42' });
  });

  it('skipping both prompts (Enter, Enter) calls startRound({})', async () => {
    const { session, startRound } = makeSession();
    const { stdin } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );
    await press(stdin, 's');
    await press(stdin, '\r');
    await press(stdin, '\r');

    expect(startRound).toHaveBeenCalledWith({});
  });

  it('Esc on ticketId prompt cancels the flow without calling startRound', async () => {
    const { session, startRound } = makeSession();
    const { stdin } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );
    await press(stdin, 's');
    await press(stdin, 'Auth\r'); // submit title
    await press(stdin, ''); // Esc on ticketId prompt

    expect(startRound).not.toHaveBeenCalled();
  });

  it('Esc on title prompt cancels without entering ticketId step', async () => {
    const { session, startRound } = makeSession();
    const { stdin } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );
    await press(stdin, 's');
    await press(stdin, ''); // Esc on title prompt

    expect(startRound).not.toHaveBeenCalled();
  });
});

describe('App — re-vote inherits parent round descriptor (ADR-0013 / #516)', () => {
  it("v starts a new round with parentRoundId and the parent round's title/description/ticketId/agendaItemId", async () => {
    const round: Round = {
      id: 'r1',
      createdAt: 0,
      createdBy: 'host',
      scale: SCALE,
      status: 'revealed',
      title: 'Story 2',
      description: 'Some context about the story',
      ticketId: 'PROJ-9',
      agendaItemId: 'agenda-1',
      votes: {},
    };
    const { session, startRound } = makeSession({ current: round, rounds: [round] });
    const { stdin } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );

    await press(stdin, 'v');

    // `startRound` does not inherit descriptor fields on its own (#516) — the
    // call site is responsible for carrying them over from the parent round.
    expect(startRound).toHaveBeenCalledWith({
      parentRoundId: 'r1',
      title: 'Story 2',
      description: 'Some context about the story',
      ticketId: 'PROJ-9',
      agendaItemId: 'agenda-1',
    });
  });
});

// ---------------------------------------------------------------------------
// What the Lobby is given to show. The host cancelling a round sends everyone
// to the Lobby with that round last in the list; it is a tombstone (ADR-0046)
// and the headline belongs to the round before it.
// ---------------------------------------------------------------------------

describe('App — a cancelled round is not what the Lobby shows', () => {
  const revealed: Round = {
    id: 'r1',
    createdAt: 0,
    createdBy: 'host',
    scale: SCALE,
    status: 'revealed',
    title: 'Login form',
    votes: { host: '5' },
  };
  const cancelled: Round = {
    id: 'r2',
    createdAt: 1,
    createdBy: 'host',
    scale: SCALE,
    status: 'discarded',
    title: 'Never mind',
    votes: { host: '8' },
  };

  it('headlines the last round with a result, under the number it goes by', async () => {
    const { session } = makeSession({ current: null, rounds: [revealed, cancelled] });
    const { lastFrame } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );
    const frame = lastFrame() ?? '';

    expect(frame).toContain('Round 1');
    expect(frame).toContain('Login form');
    expect(frame).not.toContain('Round 0');
    expect(frame).not.toContain('Never mind');
  });

  it('shows no results at all when the only round was cancelled', async () => {
    const { session } = makeSession({ current: null, rounds: [cancelled] });
    const { lastFrame } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );
    const frame = lastFrame() ?? '';

    expect(frame).not.toContain('Results');
    expect(frame).not.toContain('Round 0');
    expect(frame).not.toContain('Never mind');
  });
});

// ---------------------------------------------------------------------------
// Bound command call sites (#516)
//
// `SessionHandle` no longer carries per-act forwards — App reaches the whole
// writer seam through `session.commands`. These press the keys that reach each
// callback so the wiring itself is pinned; the rules live in `@hnch/shared`.
// ---------------------------------------------------------------------------

const VOTING_ROUND: Round = {
  id: 'r-active',
  createdAt: 0,
  createdBy: 'host',
  scale: SCALE,
  status: 'voting',
  votes: {},
};

function mountVoting(isHost = true) {
  return makeSession({ current: VOTING_ROUND, rounds: [VOTING_ROUND], isHost });
}

describe('App — Voting keys reach the bound commands', () => {
  it('Enter on the card picker casts the card under the cursor', async () => {
    const { session } = mountVoting();
    const { stdin } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );

    await press(stdin, '\r');

    expect(session.commands.toggleCurrentVote).toHaveBeenCalledWith('1');
  });

  it('a casts the abstain sentinel', async () => {
    const { session } = mountVoting();
    const { stdin } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );

    await press(stdin, 'a');

    expect(session.commands.toggleCurrentVote).toHaveBeenCalledWith(ABSTAIN_SENTINEL);
  });

  it('backspace clears the vote', async () => {
    const { session } = mountVoting();
    const { stdin } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );

    await press(stdin, '\x7f');

    expect(session.commands.clearCurrentVote).toHaveBeenCalledTimes(1);
  });

  it('r reveals, s skips and d discards for the host', async () => {
    const { session } = mountVoting();
    const { stdin } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );

    await press(stdin, 'r');
    await press(stdin, 's');
    await press(stdin, 'd');

    expect(session.commands.revealCurrentRound).toHaveBeenCalledTimes(1);
    expect(session.commands.skipCurrentRound).toHaveBeenCalledTimes(1);
    expect(session.commands.discardCurrentRound).toHaveBeenCalledTimes(1);
  });

  it('w flips the caller between voter and viewer', async () => {
    const { session } = mountVoting();
    const { stdin } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );

    await press(stdin, 'w');

    expect(session.commands.toggleRole).toHaveBeenCalledTimes(1);
  });
});

describe('App — Lobby handoff reaches the bound command', () => {
  const ROSTER: DocProjection['participants'] = [
    { id: 'host', displayName: 'Host', joinedAt: 0, role: 'voter' },
    { id: 'ada', displayName: 'Ada', joinedAt: 1, role: 'voter' },
  ];

  it('h → 1 → y hands host authority to the picked participant', async () => {
    const { session } = makeSession({
      participants: ROSTER,
      onlineIds: new Set(['host', 'ada']),
    });
    const { stdin } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );

    await press(stdin, 'h');
    await press(stdin, '1');
    await press(stdin, 'y');

    expect(session.commands.handoffHost).toHaveBeenCalledWith('ada');
  });

  it('reports the refusal reason instead of throwing when the command refuses', async () => {
    const { session } = makeSession({
      participants: ROSTER,
      onlineIds: new Set(['host', 'ada']),
    });
    (session.commands.handoffHost as ReturnType<typeof vi.fn>).mockReturnValue({
      applied: false,
      reason: 'not-online',
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { stdin } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );

    await press(stdin, 'h');
    await press(stdin, '1');
    await press(stdin, 'y');

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Handoff failed'));
    consoleError.mockRestore();
  });
});

describe('App — Lobby host menu reaches endSession', () => {
  it('m → Enter → y ends the session for everyone', async () => {
    const { session } = makeSession();
    const { stdin } = await renderInk(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );

    await press(stdin, 'm');
    await press(stdin, '\r');
    await press(stdin, 'y');

    expect(session.commands.endSession).toHaveBeenCalledTimes(1);
  });
});
