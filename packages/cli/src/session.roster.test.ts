/**
 * `wireSession` roster *wiring* (#507).
 *
 * The gates themselves — who may hand off, who may end a session, what a
 * rename preserves — are pinned once in `@hnch/shared`'s
 * `roster-commands.test.ts`. What can only be verified here is that this
 * adapter reaches the right command with the right actor, hands it the
 * awareness data it cannot read for itself, and propagates the typed result
 * back to the TUI instead of throwing.
 *
 * Transport is stubbed the same way `session.election.test.ts` stubs it: this
 * suite is about the doc, not the wire.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import {
  AWARENESS_PARTICIPANT_ID_FIELD,
  joinDoc,
  participantRole,
  projectDoc,
  promoteHost,
} from '@hnch/shared';

vi.mock('@hnch/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hnch/shared')>()),
  connectToRelay: vi.fn(() => ({
    awareness: undefined,
    disconnect: vi.fn(),
    updateCredentials: vi.fn(),
  })),
}));

import { wireSession } from './session.js';

function wire(doc: Y.Doc, awareness: Awareness) {
  return wireSession({
    doc,
    awareness,
    roomCode: 'ABC123',
    roomUuid: 'room-uuid-1',
    participantId: 'peer-a',
    relayUrl: 'http://localhost:0',
  });
}

/** Publish `id` into awareness so `getOnlineIds()` reports it as online. */
function markOnline(awareness: Awareness, clientId: number, id: string): void {
  awareness.states.set(clientId, { [AWARENESS_PARTICIPANT_ID_FIELD]: id });
  awareness.emit('change', [{ added: [clientId], updated: [], removed: [] }, 'test']);
}

describe('CLI roster command wiring', () => {
  let doc: Y.Doc;
  let awareness: Awareness;

  beforeEach(() => {
    vi.clearAllMocks();
    doc = new Y.Doc();
    awareness = new Awareness(doc);
    joinDoc(doc, { participantId: 'peer-a', displayName: 'Alice', joinedAt: 0 });
    joinDoc(doc, { participantId: 'peer-b', displayName: 'Bob', joinedAt: 1 });
    promoteHost(doc, 'peer-a');
  });

  it('rename reaches the command with this peer as the subject', () => {
    const session = wire(doc, awareness);

    expect(session.commands.rename('Alicia')).toEqual({ applied: true });
    expect(projectDoc(doc).participants.find((p) => p.id === 'peer-a')?.displayName).toBe('Alicia');

    session.disconnect();
  });

  it('toggleRole reaches the command with this peer as the subject', () => {
    const session = wire(doc, awareness);

    expect(session.commands.toggleRole()).toEqual({ applied: true });
    const me = projectDoc(doc).participants.find((p) => p.id === 'peer-a')!;
    expect(participantRole(me)).toBe('viewer');

    session.disconnect();
  });

  it('handoffHost supplies awareness and applies for an online target', () => {
    const session = wire(doc, awareness);
    markOnline(awareness, 7, 'peer-b');

    expect(session.commands.handoffHost('peer-b')).toEqual({ applied: true });
    expect(projectDoc(doc).settings.hostParticipantId).toBe('peer-b');

    session.disconnect();
  });

  it('handoffHost propagates not-online rather than throwing', () => {
    const session = wire(doc, awareness);
    // Nobody published awareness for peer-b.

    expect(session.commands.handoffHost('peer-b')).toEqual({
      applied: false,
      reason: 'not-online',
    });
    expect(projectDoc(doc).settings.hostParticipantId).toBe('peer-a');

    session.disconnect();
  });

  it('handoffHost propagates not-host rather than throwing', () => {
    promoteHost(doc, 'peer-b');
    const session = wire(doc, awareness);
    markOnline(awareness, 7, 'peer-b');

    expect(session.commands.handoffHost('peer-b')).toEqual({ applied: false, reason: 'not-host' });

    session.disconnect();
  });

  it('endSession reaches the command with this peer as the actor', () => {
    const session = wire(doc, awareness);

    const result = session.commands.endSession();
    expect(result.applied).toBe(true);
    expect(projectDoc(doc).meta.sessionEndedAt).toBeTypeOf('number');

    session.disconnect();
  });

  it('endSession propagates not-host rather than throwing', () => {
    promoteHost(doc, 'peer-b');
    const session = wire(doc, awareness);

    expect(session.commands.endSession()).toEqual({ applied: false, reason: 'not-host' });
    expect(projectDoc(doc).meta.sessionEndedAt).toBeUndefined();

    session.disconnect();
  });
});
