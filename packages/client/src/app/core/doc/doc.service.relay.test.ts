/**
 * DocService relay *wiring* (ADR-0016).
 *
 * The connection's own behaviour — close-code decoding, the reconnect
 * loop, the repeat-rejection throttle, the one-shot sync — lives in
 * `@hnch/shared`'s `relay-client` and is tested there against a fake
 * socket. What can only be verified here is that this adapter hands
 * `connectToRelay` the right inputs and mirrors its callbacks into the
 * signals components bind to.
 *
 * `@ionic/angular/standalone` is mocked so the ESM-only `@ionic/core`
 * chain never loads under vitest.
 */

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectToRelay,
  FIBONACCI_SCALE,
  joinDoc,
  kick,
  promoteHost,
  rejoin,
  type ConnectToRelayOptions,
  type RelayConnection,
  type SessionEvent,
} from '@hnch/shared';

vi.mock('@ionic/angular/standalone', () => ({
  ToastController: class {
    create = vi.fn().mockResolvedValue({ present: vi.fn() });
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn().mockImplementation(() => ({
    whenSynced: Promise.resolve(),
    destroy: vi.fn(),
  })),
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

/** Let the session events driver's deferred delivery run. */
const settle = (): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, 0);
  });

describe('DocService — relay wiring', () => {
  let svc: DocService;
  let opts: ConnectToRelayOptions;
  let disconnect: ReturnType<typeof vi.fn>;
  let updateCredentials: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;

  /** Open a session and wait for the persistence hop `connect()` awaits. */
  async function connect(): Promise<void> {
    svc.createSession(SESSION);
    svc.connect(CREDENTIALS);
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    disconnect = vi.fn();
    updateCredentials = vi.fn();
    toastError = vi.fn().mockResolvedValue(undefined);

    connectToRelayMock.mockImplementation((o) => {
      opts = o;
      return {
        awareness: o.awareness,
        updateCredentials,
        disconnect,
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
        { provide: ToastService, useValue: { error: toastError } },
      ],
    });
    svc = TestBed.inject(DocService);
  });

  it('passes the resolved relay HTTP URL and the room UUID', async () => {
    await connect();

    expect(opts.httpBaseUrl).toBe('http://relay.test');
    expect(opts.roomUuid).toBe('room-uuid-1');
    expect(opts.credentials).toEqual(CREDENTIALS);
  });

  it('mirrors status into syncStatus', async () => {
    await connect();

    opts.onStatusChange?.('connected');

    expect(svc.syncStatus()).toBe('connected');
  });

  it('mirrors rejections into lastRejection', async () => {
    await connect();

    opts.onRejectionChange?.('wrong-password');
    expect(svc.lastRejection()).toBe('wrong-password');

    opts.onRejectionChange?.(null);
    expect(svc.lastRejection()).toBeNull();
  });

  it('mirrors the reconnecting flag rather than deriving its own', async () => {
    await connect();
    expect(svc.reconnecting()).toBe(false);

    opts.onReconnectingChange?.(true);
    expect(svc.reconnecting()).toBe(true);

    opts.onReconnectingChange?.(false);
    expect(svc.reconnecting()).toBe(false);
  });

  it('clears the reconnecting flag on disconnect', async () => {
    await connect();
    opts.onReconnectingChange?.(true);

    svc.disconnect();

    expect(svc.reconnecting()).toBe(false);
    expect(disconnect).toHaveBeenCalled();
  });

  it('toasts on repeat rejection — the throttle itself lives in relay-client', async () => {
    await connect();

    opts.onRepeatRejection?.();

    expect(toastError).toHaveBeenCalledWith('Trouble reaching the session. Still trying.');
  });

  it('forwards a rotated password hash to the live connection', async () => {
    await connect();

    svc.updateCredentials('hash-new');

    expect(updateCredentials).toHaveBeenCalledWith({ passwordHash: 'hash-new' });
  });

  it('forwards null when the room reverts to open', async () => {
    await connect();

    svc.updateCredentials(null);

    expect(updateCredentials).toHaveBeenCalledWith({ passwordHash: null });
  });

  it('is a no-op when no connection is attached', () => {
    expect(() => svc.updateCredentials('hash-new')).not.toThrow();
    expect(updateCredentials).not.toHaveBeenCalled();
  });

  it('flips hasFirstSyncCompleted on the one-shot sync', async () => {
    await connect();
    expect(svc.hasFirstSyncCompleted()).toBe(false);

    opts.onSynced?.();

    expect(svc.hasFirstSyncCompleted()).toBe(true);
  });

  it('delivers a removal by the host only once the first sync has landed (ADR-0036 §6)', async () => {
    await connect();
    const removals: SessionEvent[] = [];
    svc.onSessionEvent((event) => {
      if (event.kind === 'removed') removals.push(event);
    });

    // Another peer becomes host and removes this one — before the first sync,
    // as a removal carried in the snapshot would arrive.
    joinDoc(opts.doc, { participantId: 'p-other', displayName: 'Ola', joinedAt: 1 });
    promoteHost(opts.doc, 'p-other');
    kick(opts.doc, 'p-other', 'p-host');
    await settle();
    expect(removals).toEqual([]);

    // After the sync, a fresh removal is a live one.
    opts.onSynced?.();
    opts.onSyncedChange?.(true);
    rejoin(opts.doc, 'p-host');
    kick(opts.doc, 'p-other', 'p-host');
    await settle();

    expect(removals).toEqual([
      expect.objectContaining({
        kind: 'removed',
        removedBy: 'p-other',
        removedByName: 'Ola',
        message: 'Removed by host',
      }),
    ]);
  });
});
