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

import type { DocProjection, Round, Scale } from '@hnch/shared';
import type { SessionHandle } from '../session.js';
import { App } from './App.js';

const SCALE: Scale = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] };

function makeProjection(rounds: readonly Round[] = []): DocProjection {
  return {
    participants: [{ id: 'host', displayName: 'Host', joinedAt: 0, role: 'voter' }],
    settings: {
      hostParticipantId: 'host',
      defaultScale: SCALE,
    },
    rounds: [...rounds],
    agenda: [],
    meta: { roomUuid: '', createdAt: 0, createdBy: 'host' },
  };
}

function makeSession(overrides: { current?: Round | null; rounds?: readonly Round[] } = {}): {
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
    projection: () => makeProjection(overrides.rounds ?? []),
    current: () => overrides.current ?? null,
    isHost: () => true,
    onlineIds: () => new Set(['host']),
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
