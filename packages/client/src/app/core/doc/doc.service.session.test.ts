/**
 * DocService — which session it holds, and what that session connects with.
 *
 * Three things that only show when something happens *while* something else
 * is still on its way:
 *
 *  - the session epoch, by which a wait can tell that the session it was
 *    waiting on has been replaced;
 *  - the credentials, which can change between `connect()` being called and
 *    the socket actually opening (the local snapshot loads in between);
 *  - a teardown in that same gap, which must not leave a connection behind.
 *
 * `@ionic/angular/standalone` is mocked so the ESM-only `@ionic/core`
 * chain never loads under vitest.
 */

// Exercises: core/doc/doc.service:DocService (sessionEpoch, relayRoomUuid, connect)

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectToRelay,
  FIBONACCI_SCALE,
  type ConnectToRelayOptions,
  type RelayConnection,
} from '@hnch/shared';

vi.mock('@ionic/angular/standalone', () => ({
  ToastController: class {
    create = vi.fn().mockResolvedValue({ present: vi.fn() });
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

/**
 * The local snapshot, loading. Held back until the test lets it go, so the
 * gap between `connect()` and the socket opening can be stood in.
 */
const snapshot = vi.hoisted(() => ({
  loaded: Promise.resolve() as Promise<void>,
  destroyed: 0,
}));

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    readonly whenSynced = snapshot.loaded;
    destroy(): Promise<void> {
      snapshot.destroyed += 1;
      return Promise.resolve();
    }
  },
}));

vi.mock('@hnch/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hnch/shared')>();
  return { ...actual, connectToRelay: vi.fn() };
});

import { DocService } from './doc.service';
import { AppPreferenceService } from '../app-preference.service';
import { ParticipantIdService } from '../participant-id.service';
import { ToastService } from '../../services/toast.service';

const connectToRelayMock = vi.mocked(connectToRelay);

const SESSION = {
  participantId: 'p-host',
  displayName: 'Host',
  defaultScale: FIBONACCI_SCALE,
  roomUuid: 'room-uuid-1',
  roomCode: 'ABC123',
};

const CREDENTIALS = { roomCode: 'ABC123', deviceId: 'p-host' };

/** Let every promise that is ready run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

/** A snapshot that loads when the test says so. */
function holdSnapshot(): () => void {
  let release = (): void => {};
  snapshot.loaded = new Promise<void>((resolve) => {
    release = resolve;
  });
  return release;
}

describe('DocService — the session it holds', () => {
  let svc: DocService;
  let connections: ConnectToRelayOptions[];
  let updateCredentials: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    snapshot.loaded = Promise.resolve();
    snapshot.destroyed = 0;
    connections = [];
    updateCredentials = vi.fn();

    connectToRelayMock.mockImplementation((o) => {
      connections.push(o);
      return {
        awareness: o.awareness,
        updateCredentials,
        disconnect: vi.fn(),
      } as unknown as RelayConnection;
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DocService,
        {
          provide: AppPreferenceService,
          useValue: { resolvedRelayHttpUrl: () => 'http://relay.test' },
        },
        { provide: ParticipantIdService, useValue: { id: signal<string | null>('p-host') } },
        { provide: ToastService, useValue: { error: vi.fn().mockResolvedValue(undefined) } },
      ],
    });
    svc = TestBed.inject(DocService);
  });

  describe('sessionEpoch', () => {
    it('changes when a session starts', () => {
      const before = svc.sessionEpoch();

      svc.createSession(SESSION);

      expect(svc.sessionEpoch()).not.toBe(before);
    });

    it('changes when a session is joined', () => {
      const before = svc.sessionEpoch();

      svc.joinSession({ participantId: 'p-join', displayName: 'Joiner', roomCode: 'ABC123' });

      expect(svc.sessionEpoch()).not.toBe(before);
    });

    it('changes when the session is torn down', () => {
      svc.createSession(SESSION);
      const during = svc.sessionEpoch();

      svc.teardown();

      expect(svc.sessionEpoch()).not.toBe(during);
    });

    it('never comes back to a value it has had: a replaced session is a different one', () => {
      const seen = new Set<number>([svc.sessionEpoch()]);
      for (let i = 0; i < 3; i++) {
        svc.createSession(SESSION);
        expect(seen.has(svc.sessionEpoch())).toBe(false);
        seen.add(svc.sessionEpoch());
        svc.teardown();
        expect(seen.has(svc.sessionEpoch())).toBe(false);
        seen.add(svc.sessionEpoch());
      }
    });

    it('stays put while the session does: a vote is not a new session', () => {
      svc.createSession(SESSION);
      const during = svc.sessionEpoch();

      svc.updateSettings({ name: 'Sprint 12' });
      svc.connect(CREDENTIALS);

      expect(svc.sessionEpoch()).toBe(during);
    });
  });

  describe('relayRoomUuid', () => {
    it('is null before a connection has been asked for', () => {
      expect(svc.relayRoomUuid()).toBeNull();
      svc.createSession(SESSION);
      expect(svc.relayRoomUuid()).toBeNull();
    });

    it('is the id the session was created under', () => {
      svc.createSession(SESSION);
      svc.connect(CREDENTIALS);

      expect(svc.relayRoomUuid()).toBe('room-uuid-1');
    });

    it('is the id the code resolved to, for someone joining', () => {
      svc.joinSession({ participantId: 'p-join', displayName: 'Joiner', roomCode: 'ABC123' });
      svc.connect({ roomCode: 'ABC123', deviceId: 'p-join' }, { roomUuid: 'resolved-uuid' });

      expect(svc.relayRoomUuid()).toBe('resolved-uuid');
    });

    it('is gone with the session', () => {
      svc.createSession(SESSION);
      svc.connect(CREDENTIALS);

      svc.teardown();

      expect(svc.relayRoomUuid()).toBeNull();
    });
  });

  describe('credentials that change before the socket has opened', () => {
    // The host sets a password right after creating the session, while the
    // local snapshot is still loading. The relay is locked by then; a socket
    // opened without the hash would be refused, over and over.
    it('opens the socket with the password that was set in the meantime', async () => {
      const release = holdSnapshot();
      svc.createSession(SESSION);
      svc.connect(CREDENTIALS);

      svc.updateCredentials('hash-a');
      release();
      await settle();

      expect(connections).toHaveLength(1);
      expect(connections[0]!.credentials).toEqual({ ...CREDENTIALS, passwordHash: 'hash-a' });
    });

    it('opens it without one when the password was taken off again', async () => {
      const release = holdSnapshot();
      svc.createSession(SESSION);
      svc.connect({ ...CREDENTIALS, passwordHash: 'hash-a' });

      svc.updateCredentials(null);
      release();
      await settle();

      expect(connections[0]!.credentials).toEqual(CREDENTIALS);
    });

    it('still re-handshakes a socket that is already open', async () => {
      svc.createSession(SESSION);
      svc.connect(CREDENTIALS);
      await settle();

      svc.updateCredentials('hash-a');

      expect(updateCredentials).toHaveBeenCalledWith({ passwordHash: 'hash-a' });
    });
  });

  describe('a session torn down while its snapshot was loading', () => {
    it('opens no socket for it', async () => {
      const release = holdSnapshot();
      svc.createSession(SESSION);
      svc.connect(CREDENTIALS);

      svc.teardown();
      release();
      await settle();

      expect(connections).toEqual([]);
    });

    // A provider left behind would make the next `connect()` a no-op.
    it('does not stand in the way of the session that comes next', async () => {
      const release = holdSnapshot();
      svc.createSession(SESSION);
      svc.connect(CREDENTIALS);
      svc.teardown();

      snapshot.loaded = Promise.resolve();
      svc.joinSession({ participantId: 'p-host', displayName: 'Host', roomCode: 'XYZ789' });
      svc.connect({ roomCode: 'XYZ789', deviceId: 'p-host' }, { roomUuid: 'room-uuid-2' });
      release();
      await settle();

      expect(connections.map((c) => c.roomUuid)).toEqual(['room-uuid-2']);
      expect(svc.relayRoomUuid()).toBe('room-uuid-2');
    });
  });
});
