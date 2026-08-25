/**
 * `wireSession` relay *wiring* — the callbacks it binds on `relay-client`.
 *
 * The connection's own behaviour lives in `@hnch/shared`'s
 * `relay-client.test.ts`, and the `rejoin` roster command's in
 * `roster-commands.test.ts`. What can only be verified here is what this
 * adapter hands `connectToRelay` and what it does when each callback fires
 * — in particular whether it binds the ADR-0036 §6 post-sync `rejoin` at
 * all, since binding it is the whole CLI-side fix.
 *
 * `session.test.ts` covers the same clear end to end over a real relay,
 * but the merge there is a genuine LWW race; this suite pins the rule.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import {
  AWARENESS_PARTICIPANT_ID_FIELD,
  connectToRelay,
  isActiveParticipant,
  joinDoc,
  leave,
  projectDoc,
  type ConnectToRelayOptions,
  type RelayConnection,
} from '@hnch/shared';

vi.mock('@hnch/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hnch/shared')>()),
  connectToRelay: vi.fn(),
}));

import { wireSession } from './session.js';

const connectToRelayMock = vi.mocked(connectToRelay);

const SELF = 'p-self';

let opts: ConnectToRelayOptions;

function wire(doc: Y.Doc, overrides: { clearLeftStatusOnSync?: boolean } = {}) {
  const awareness = new Awareness(doc);
  awareness.setLocalStateField(AWARENESS_PARTICIPANT_ID_FIELD, SELF);
  return wireSession({
    doc,
    awareness,
    roomCode: 'ABC123',
    roomUuid: 'room-uuid-1',
    participantId: SELF,
    relayUrl: 'http://relay.test',
    ...overrides,
  });
}

/** A doc whose snapshot already marks this participant as departed. */
function docWithStaleLeftAt(): Y.Doc {
  const doc = new Y.Doc();
  joinDoc(doc, { participantId: SELF, displayName: 'Self', joinedAt: 1 });
  leave(doc, SELF);
  return doc;
}

function isSelfActive(doc: Y.Doc): boolean {
  const me = projectDoc(doc).participants.find((p) => p.id === SELF);
  if (!me) throw new Error('no participant record');
  return isActiveParticipant(me);
}

describe('wireSession — relay wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectToRelayMock.mockImplementation((o) => {
      opts = o;
      return {
        awareness: o.awareness,
        updateCredentials: vi.fn(),
        disconnect: vi.fn(),
      } as unknown as RelayConnection;
    });
  });

  it('passes the relay URL as an http base and lets relay-client derive ws', () => {
    wire(new Y.Doc());

    expect(opts.httpBaseUrl).toBe('http://relay.test');
    expect(opts.roomUuid).toBe('room-uuid-1');
  });

  it('sends did but no pw when the room is open', () => {
    wire(new Y.Doc());

    expect(opts.credentials).toEqual({ roomCode: 'ABC123', deviceId: SELF });
  });

  it('fans status changes out to subscribers', () => {
    const session = wire(new Y.Doc());
    const seen = vi.fn();
    session.onStatusChange(seen);

    opts.onStatusChange?.('connected');

    expect(seen).toHaveBeenCalledWith('connected');
  });

  it('reports a rejection reason but ignores the clearing null', () => {
    const onRejection = vi.fn();
    wireSession({
      doc: new Y.Doc(),
      awareness: new Awareness(new Y.Doc()),
      roomCode: 'ABC123',
      roomUuid: 'room-uuid-1',
      participantId: SELF,
      relayUrl: 'http://relay.test',
      onRejection,
    });

    opts.onRejectionChange?.(null);
    expect(onRejection).not.toHaveBeenCalled();

    opts.onRejectionChange?.('wrong-password');
    expect(onRejection).toHaveBeenCalledWith('wrong-password');
  });

  it('clears a stale departure once the snapshot has synced', () => {
    const doc = docWithStaleLeftAt();
    wire(doc, { clearLeftStatusOnSync: true });
    expect(isSelfActive(doc)).toBe(false);

    opts.onSynced?.();

    expect(isSelfActive(doc)).toBe(true);
  });

  it('binds no post-sync clear when the flag is off — a freshly minted room', () => {
    wire(docWithStaleLeftAt());

    expect(opts.onSynced).toBeUndefined();
  });

  it('leaves an active participant untouched', () => {
    const doc = new Y.Doc();
    joinDoc(doc, { participantId: SELF, displayName: 'Self', joinedAt: 1 });
    wire(doc, { clearLeftStatusOnSync: true });

    opts.onSynced?.();

    expect(isSelfActive(doc)).toBe(true);
  });
});
