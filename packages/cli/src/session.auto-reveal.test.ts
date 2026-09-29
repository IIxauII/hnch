/**
 * `wireSession` auto-reveal *wiring* (ADR-0018).
 *
 * The rule and its driver — who counts, when to re-evaluate, when presence
 * cannot be trusted — live in `@hnch/shared` and are tested there with fake
 * deps. What can only be verified here is that this adapter hands the driver
 * the right sources: the doc, awareness, and the relay's word on whether
 * awareness can be believed.
 *
 * That last one is the point. When a socket closes, `y-websocket` clears
 * awareness down to this peer. A peer that has voted then sees a room in
 * which everyone online has voted, and an adapter that lets the driver act on
 * it reveals the round — for the whole room, once the write syncs.
 *
 * The transport is stubbed rather than dropped for real: two sessions in one
 * process also reach each other over `y-websocket`'s in-memory broadcast
 * channel, so cutting the socket between them cuts nothing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import {
  AWARENESS_PARTICIPANT_ID_FIELD,
  FIBONACCI_SCALE,
  connectToRelay,
  initDoc,
  joinDoc,
  projectDoc,
  type ConnectToRelayOptions,
} from '@hnch/shared';

vi.mock('@hnch/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hnch/shared')>()),
  connectToRelay: vi.fn(() => ({
    awareness: undefined,
    disconnect: vi.fn(),
    updateCredentials: vi.fn(),
  })),
}));

import { wireSession, type SessionHandle } from './session.js';

const connectToRelayMock = vi.mocked(connectToRelay);

const ME = 'peer-a';
const HOST = 'host-1';
/** The host's awareness client id, as the relay would replay it. */
const HOST_CLIENT = 7;

describe('CLI auto-reveal wiring', () => {
  let doc: Y.Doc;
  let awareness: Awareness;
  let session: SessionHandle;
  /**
   * The host's hand on the same doc: starts the round, and casts the host's
   * vote. Its own driver never gets to act — its transport never syncs.
   */
  let host: SessionHandle;
  let relay: ConnectToRelayOptions;

  /** The relay has said who is here: the host, besides this peer. */
  function synced(): void {
    awareness.states.set(HOST_CLIENT, { [AWARENESS_PARTICIPANT_ID_FIELD]: HOST });
    awareness.emit('change', [{ added: [HOST_CLIENT], updated: [], removed: [] }, 'relay']);
    relay.onSyncedChange?.(true);
  }

  /** The socket is gone, in the order `y-websocket` reports it. */
  function dropped(): void {
    relay.onSyncedChange?.(false);
    awareness.states.delete(HOST_CLIENT);
    awareness.emit('change', [{ added: [], updated: [], removed: [HOST_CLIENT] }, 'relay']);
  }

  function roundStatus(): string | undefined {
    return projectDoc(doc).rounds.at(-1)?.status;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    doc = new Y.Doc();
    initDoc(doc, {
      roomUuid: 'room-uuid-1',
      createdAt: 0,
      participantId: HOST,
      displayName: 'Host',
      defaultScale: FIBONACCI_SCALE,
    });
    joinDoc(doc, { participantId: ME, displayName: 'Me', joinedAt: 0 });
    awareness = new Awareness(doc);
    awareness.setLocalStateField(AWARENESS_PARTICIPANT_ID_FIELD, ME);

    host = wireSession({
      doc,
      awareness: new Awareness(doc),
      roomCode: 'ABC123',
      roomUuid: 'room-uuid-1',
      participantId: HOST,
      relayUrl: 'http://localhost:0',
    });
    expect(host.commands.startRound({ title: 'Still thinking' }).applied).toBe(true);

    session = wireSession({
      doc,
      awareness,
      roomCode: 'ABC123',
      roomUuid: 'room-uuid-1',
      participantId: ME,
      relayUrl: 'http://localhost:0',
    });
    relay = connectToRelayMock.mock.calls.at(-1)![0];
  });

  it('asks the relay client to report when it is synced', () => {
    expect(relay.onSyncedChange).toBeTypeOf('function');
    session.disconnect();
    host.disconnect();
  });

  it('does not reveal the round when the socket drops after a vote', () => {
    synced();
    session.commands.toggleCurrentVote('5');
    expect(roundStatus()).toBe('voting');

    dropped();

    expect(session.onlineIds()).toEqual(new Set([ME]));
    expect(roundStatus()).toBe('voting');
    session.disconnect();
    host.disconnect();
  });

  it('does not reveal it on the way back up either, while someone has yet to vote', () => {
    synced();
    session.commands.toggleCurrentVote('5');
    dropped();

    synced();

    expect(roundStatus()).toBe('voting');
    session.disconnect();
    host.disconnect();
  });

  it('does not act on a vote cast before the relay has said who is here', () => {
    session.commands.toggleCurrentVote('5');

    expect(roundStatus()).toBe('voting');
    session.disconnect();
    host.disconnect();
  });

  it('reveals a round that went unanimous while this peer was away', () => {
    synced();
    session.commands.toggleCurrentVote('5');
    dropped();
    // The host's vote reaches the doc with the resync, ahead of the verdict.
    host.commands.toggleCurrentVote('8');
    expect(roundStatus()).toBe('voting');

    synced();

    expect(roundStatus()).toBe('revealed');
    session.disconnect();
    host.disconnect();
  });

  it('still reveals when everyone has voted', () => {
    synced();
    session.commands.toggleCurrentVote('5');

    host.commands.toggleCurrentVote('8');

    expect(roundStatus()).toBe('revealed');
    session.disconnect();
    host.disconnect();
  });
});
