/**
 * Render-driven coverage for App.tsx focused on the issue #109 two-step
 * round-start prompt (title → ticketId → session.newRound). Mounts App
 * with a stub SessionHandle, presses `s` to open the title prompt,
 * walks the user through both fields, then asserts session.newRound was
 * called with the trimmed args.
 */

import { render } from 'ink-testing-library';
import { act } from 'react';
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

function makeSession(): {
  session: SessionHandle;
  newRound: ReturnType<typeof vi.fn>;
} {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const newRound = vi.fn().mockReturnValue('new-round-id');

  const session: SessionHandle = {
    doc,
    awareness,
    roomCode: 'ABC123',
    roomUuid: 'uuid-1',
    projection: () => makeProjection(),
    current: () => null,
    isHost: () => true,
    onlineIds: () => new Set(['host']),
    toggleCurrentVote: vi.fn(),
    clearCurrentVote: vi.fn(),
    reveal: vi.fn(),
    skip: vi.fn(),
    newRound,
    revote: vi.fn().mockReturnValue('rv-id'),
    updateRoundDescriptor: vi.fn(),
    updateName: vi.fn(),
    updateScale: vi.fn(),
    updateDisplayName: vi.fn(),
    updateAccess: vi.fn().mockResolvedValue(undefined),
    handoffHost: vi.fn(),
    toggleRole: vi.fn(),
    endSessionForEveryone: vi.fn(),
    onChange: () => () => undefined,
    onStatusChange: () => () => undefined,
    onHostChange: () => () => undefined,
    disconnect: vi.fn(),
  };

  return { session, newRound };
}

async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

describe('App — round-start two-step prompt (issue #109)', () => {
  it('runs title → ticketId → session.newRound("Auth", "PROJ-42")', async () => {
    const { session, newRound } = makeSession();
    const { stdin } = render(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );
    await flush();

    // s: open title prompt
    await act(async () => {
      stdin.write('s');
      await flush();
    });
    // Type "Auth" + Enter to advance to ticketId step
    await act(async () => {
      stdin.write('Auth');
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    // Type "PROJ-42" + Enter to fire newRound
    await act(async () => {
      stdin.write('PROJ-42');
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });

    // No agenda item pending → agendaItemId is undefined (third arg)
    expect(newRound).toHaveBeenCalledWith('Auth', 'PROJ-42', undefined);
  });

  it('skipping both prompts (Enter, Enter) calls newRound(undefined, undefined)', async () => {
    const { session, newRound } = makeSession();
    const { stdin } = render(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );
    await flush();
    await act(async () => {
      stdin.write('s');
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });

    expect(newRound).toHaveBeenCalledWith(undefined, undefined, undefined);
  });

  it('Esc on ticketId prompt cancels the flow without calling newRound', async () => {
    const { session, newRound } = makeSession();
    const { stdin } = render(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );
    await flush();
    await act(async () => {
      stdin.write('s');
      await flush();
    });
    await act(async () => {
      stdin.write('Auth\r'); // submit title
      await flush();
    });
    await act(async () => {
      stdin.write(''); // Esc on ticketId prompt
      await flush();
    });

    expect(newRound).not.toHaveBeenCalled();
  });

  it('Esc on title prompt cancels without entering ticketId step', async () => {
    const { session, newRound } = makeSession();
    const { stdin } = render(
      <App session={session} participantId="host" displayName="Host" accessMode="open" />,
    );
    await flush();
    await act(async () => {
      stdin.write('s');
      await flush();
    });
    await act(async () => {
      stdin.write(''); // Esc on title prompt
      await flush();
    });

    expect(newRound).not.toHaveBeenCalled();
  });
});
