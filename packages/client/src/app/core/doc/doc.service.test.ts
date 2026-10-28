/**
 * DocService — the client's adapter over the shared live session.
 *
 * How a live session behaves (seeding, presence, rejoin, the drivers, the
 * gates, teardown) is `@hnch/shared`'s `live-session` and is tested there
 * against a real relay. What stays here is what the client adds: the signals
 * that mirror the live session's readings, the one open call, the session
 * epoch, the IndexedDB load before the socket opens, and the forwards.
 *
 * `openLiveSession` is replaced by a fake that records what it was opened
 * with and reports nothing on its own; each test drives the readings it
 * needs through the callbacks, as the live session would.
 */

// Exercises: core/doc/doc.service:DocService

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  FIBONACCI_SCALE,
  initDoc,
  openLiveSession,
  projectDoc,
  UNBOUND_SESSION_COMMANDS,
  type LiveSession,
  type OpenLiveSessionOptions,
  type SessionCommands,
  type SessionEvent,
} from '@hnch/shared';

vi.mock('@ionic/angular/standalone', () => ({
  ToastController: class {
    create = vi.fn().mockResolvedValue({ present: vi.fn() });
  },
}));

const platform = vi.hoisted(() => ({ native: false }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform.native },
}));

/** Every IndexedDB store opened, and whether it has been destroyed. */
const stores = vi.hoisted(() => ({
  opened: [] as Array<{ name: string; doc: unknown; destroyed: boolean }>,
  loaded: Promise.resolve() as Promise<void>,
}));

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    readonly whenSynced: Promise<void>;
    private readonly record: { name: string; doc: unknown; destroyed: boolean };
    constructor(name: string, doc: unknown) {
      this.record = { name, doc, destroyed: false };
      stores.opened.push(this.record);
      this.whenSynced = stores.loaded;
    }
    destroy(): Promise<void> {
      this.record.destroyed = true;
      return Promise.resolve();
    }
  },
}));

vi.mock('@hnch/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hnch/shared')>();
  return { ...actual, openLiveSession: vi.fn() };
});

import { DocService, type OpenSessionInit } from './doc.service';
import { AppPreferenceService } from '../app-preference.service';
import { ToastService } from '../../services/toast.service';

const openLiveSessionMock = vi.mocked(openLiveSession);

/** A fake live session: its handle's acts are spies, its commands real-shaped. */
interface Opened {
  readonly options: OpenLiveSessionOptions;
  readonly handle: LiveSession & {
    readonly updateCredentials: ReturnType<typeof vi.fn>;
    readonly updateSettings: ReturnType<typeof vi.fn>;
    readonly updateRoundDescriptor: ReturnType<typeof vi.fn>;
    readonly flushUpdates: ReturnType<typeof vi.fn>;
    readonly teardown: ReturnType<typeof vi.fn>;
  };
  readonly commands: SessionCommands;
}

let opened: Opened[];

function latest(): Opened {
  const last = opened.at(-1);
  if (last === undefined) throw new Error('no live session was opened');
  return last;
}

const ROOM = { uuid: 'room-uuid-1', code: 'ABC123' };

const JOIN: OpenSessionInit = {
  room: ROOM,
  participantId: 'p-self',
  displayName: 'Sam',
  seed: { kind: 'join' },
};

/** A projection as the live session would report it for a fresh room. */
function projectionOf(name: string) {
  const doc = new Y.Doc();
  initDoc(doc, {
    roomUuid: ROOM.uuid,
    createdAt: 1,
    participantId: 'p-host',
    displayName: 'Hana',
    defaultScale: FIBONACCI_SCALE,
    sessionName: name,
  });
  return projectDoc(doc);
}

/** Let every promise that is ready run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

let svc: DocService;
let toastError: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  platform.native = false;
  stores.opened = [];
  stores.loaded = Promise.resolve();
  opened = [];
  openLiveSessionMock.mockImplementation((options) => {
    const commands: SessionCommands = {
      ...UNBOUND_SESSION_COMMANDS,
      endSession: vi.fn(() => ({ applied: true as const, at: 5 })),
    };
    const handle = {
      commands,
      updateCredentials: vi.fn(),
      updateSettings: vi.fn(),
      updateRoundDescriptor: vi.fn(),
      flushUpdates: vi.fn(() => Promise.resolve()),
      teardown: vi.fn(),
    };
    opened.push({ options, handle, commands });
    return handle;
  });

  toastError = vi.fn().mockResolvedValue(undefined);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      DocService,
      {
        provide: AppPreferenceService,
        useValue: { resolvedRelayHttpUrl: () => 'http://relay.test' },
      },
      { provide: ToastService, useValue: { error: toastError } },
    ],
  });
  svc = TestBed.inject(DocService);
});

describe('DocService — open', () => {
  it('opens one live session with the room, the credentials and who this peer is', () => {
    svc.open({ ...JOIN, avatarColor: 'teal', passwordHash: 'hash-1' });

    expect(openLiveSessionMock).toHaveBeenCalledOnce();
    expect(latest().options).toEqual(
      expect.objectContaining({
        httpBaseUrl: 'http://relay.test',
        room: ROOM,
        credentials: { deviceId: 'p-self', passwordHash: 'hash-1' },
        self: { participantId: 'p-self', displayName: 'Sam', avatarColor: 'teal' },
        seed: { kind: 'join' },
      }),
    );
  });

  it('passes a create seed through as it is', () => {
    svc.open({
      ...JOIN,
      seed: { kind: 'create', defaultScale: FIBONACCI_SCALE, sessionName: 'Sprint 9' },
    });

    expect(latest().options.seed).toEqual({
      kind: 'create',
      defaultScale: FIBONACCI_SCALE,
      sessionName: 'Sprint 9',
    });
  });

  it('reports the room and a connection under way from the moment it opens', () => {
    svc.open(JOIN);

    expect(svc.roomCode()).toBe('ABC123');
    expect(svc.relayRoomUuid()).toBe('room-uuid-1');
    expect(svc.syncStatus()).toBe('connecting');
  });

  it('tears down the session it held before it opens the next', () => {
    svc.open(JOIN);
    const first = latest();

    svc.open({ ...JOIN, room: { uuid: 'room-uuid-2', code: 'XYZ789' } });

    expect(first.handle.teardown).toHaveBeenCalledOnce();
    expect(svc.commands).toBe(latest().commands);
    expect(svc.relayRoomUuid()).toBe('room-uuid-2');
  });
});

describe('DocService — mirrors the live session', () => {
  beforeEach(() => {
    svc.open(JOIN);
  });

  it('holds the projection it reports', () => {
    expect(svc.hasSession()).toBe(false);

    latest().options.onProjectionChange?.(projectionOf('Sprint 42'));

    expect(svc.hasSession()).toBe(true);
    expect(svc.settings()?.name).toBe('Sprint 42');
    expect(svc.participants().map((p) => p.id)).toEqual(['p-host']);
    expect(svc.screen()).toBe('lobby');
  });

  it('holds the online set it reports', () => {
    latest().options.onOnlineIdsChange?.(new Set(['p-self', 'p-host']));

    expect(svc.onlineParticipantIds()).toEqual(new Set(['p-self', 'p-host']));
  });

  it('is joined only once the socket is up and the relay state has applied', () => {
    const { options } = latest();

    options.onStatusChange?.('connected');
    expect(svc.syncStatus()).toBe('connected');
    expect(svc.joined()).toBe(false);

    options.onSyncedChange?.(true);
    expect(svc.relaySynced()).toBe(true);
    expect(svc.joined()).toBe(true);
  });

  it('holds the rejection and the reconnecting flag it reports', () => {
    const { options } = latest();

    options.onRejectionChange?.('wrong-password');
    options.onReconnectingChange?.(true);

    expect(svc.lastRejection()).toBe('wrong-password');
    expect(svc.reconnecting()).toBe(true);
  });

  it('says it is still trying when the trouble repeats', () => {
    latest().options.onRepeatRejection?.();

    expect(toastError).toHaveBeenCalledWith('Trouble reaching the session. Still trying.');
  });

  it("counts this peer's auto-reveals", () => {
    latest().options.onAutoReveal?.();
    latest().options.onAutoReveal?.();

    expect(svc.autoRevealCount()).toBe(2);
  });

  it('hands session events to every listener, across sessions, until it unsubscribes', () => {
    const heard: SessionEvent['kind'][] = [];
    const dropped: SessionEvent['kind'][] = [];
    svc.onSessionEvent((event) => heard.push(event.kind));
    const unsubscribe = svc.onSessionEvent((event) => dropped.push(event.kind));
    const ended: SessionEvent = {
      kind: 'ended',
      endedAt: 1,
      endedLocally: false,
      hostId: 'p-host',
      hostName: 'Hana',
      message: 'Session ended by Hana',
    };

    latest().options.onSessionEvent?.(ended);
    unsubscribe();
    svc.open(JOIN);
    latest().options.onSessionEvent?.(ended);

    expect(heard).toEqual(['ended', 'ended']);
    expect(dropped).toEqual(['ended']);
  });
});

describe('DocService — sessionEpoch', () => {
  it('changes when a session opens and when it is torn down, and never comes back', () => {
    const seen = [svc.sessionEpoch()];

    svc.open(JOIN);
    seen.push(svc.sessionEpoch());
    svc.teardown();
    seen.push(svc.sessionEpoch());
    svc.open(JOIN);
    seen.push(svc.sessionEpoch());

    expect(new Set(seen).size).toBe(seen.length);
  });

  it('stays put while the session does', () => {
    svc.open(JOIN);
    const epoch = svc.sessionEpoch();

    latest().options.onProjectionChange?.(projectionOf('Sprint 42'));
    latest().options.onStatusChange?.('connected');

    expect(svc.sessionEpoch()).toBe(epoch);
  });
});

describe('DocService — teardown', () => {
  it('tears the live session down and forgets everything it reported', () => {
    svc.open(JOIN);
    const live = latest();
    live.options.onProjectionChange?.(projectionOf('Sprint 42'));
    live.options.onOnlineIdsChange?.(new Set(['p-self']));
    live.options.onStatusChange?.('connected');
    live.options.onSyncedChange?.(true);
    live.options.onRejectionChange?.('wrong-password');
    live.options.onReconnectingChange?.(true);

    svc.teardown();

    expect(live.handle.teardown).toHaveBeenCalledOnce();
    expect(svc.hasSession()).toBe(false);
    expect(svc.onlineParticipantIds()).toEqual(new Set());
    expect(svc.syncStatus()).toBe('offline');
    expect(svc.relaySynced()).toBe(false);
    expect(svc.lastRejection()).toBeNull();
    expect(svc.reconnecting()).toBe(false);
    expect(svc.roomCode()).toBeNull();
    expect(svc.relayRoomUuid()).toBeNull();
  });

  it('leaves commands that refuse', () => {
    svc.open(JOIN);
    expect(svc.commands).toBe(latest().commands);

    svc.teardown();

    expect(svc.commands).toBe(UNBOUND_SESSION_COMMANDS);
  });

  it('is safe with no session', () => {
    expect(() => svc.teardown()).not.toThrow();
  });
});

describe('DocService — the local snapshot (ADR-0004)', () => {
  it('loads the IndexedDB store for the room into the doc before the socket opens', async () => {
    let loaded!: () => void;
    stores.loaded = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    svc.open(JOIN);
    const doc = new Y.Doc();

    let done = false;
    void latest()
      .options.beforeConnect?.(doc)
      .then(() => {
        done = true;
      });
    await settle();

    expect(stores.opened).toEqual([{ name: 'room-uuid-1', doc, destroyed: false }]);
    expect(done).toBe(false);
    loaded();
    await settle();
    expect(done).toBe(true);
  });

  it('closes the store with the session', async () => {
    svc.open(JOIN);
    await latest().options.beforeConnect?.(new Y.Doc());

    svc.teardown();

    expect(stores.opened.map((s) => s.destroyed)).toEqual([true]);
  });

  it('opens no store on a native platform', async () => {
    platform.native = true;
    svc.open(JOIN);

    await latest().options.beforeConnect?.(new Y.Doc());

    expect(stores.opened).toEqual([]);
  });
});

describe('DocService — forwards', () => {
  it('ends the session for everyone through the commands', () => {
    svc.open(JOIN);

    expect(svc.endSessionForEveryone()).toEqual({ applied: true, at: 5 });
    expect(latest().commands.endSession).toHaveBeenCalledOnce();
  });

  it('refuses to end a session it does not hold', () => {
    expect(svc.endSessionForEveryone()).toEqual({ applied: false, reason: 'not-found' });
  });

  it('forwards the patches and the new password hash', () => {
    svc.open(JOIN);

    svc.updateSettings({ name: 'Renamed' });
    svc.updateRoundDescriptor('r-1', { title: 'Login' });
    svc.updateCredentials(null);

    const { handle } = latest();
    expect(handle.updateSettings).toHaveBeenCalledWith({ name: 'Renamed' });
    expect(handle.updateRoundDescriptor).toHaveBeenCalledWith('r-1', { title: 'Login' });
    expect(handle.updateCredentials).toHaveBeenCalledWith(null);
  });

  it('refuses a patch with no session, and ignores a password with none', () => {
    expect(() => svc.updateSettings({ name: 'x' })).toThrow('no active session');
    expect(() => svc.updateRoundDescriptor('r-1', { title: 'x' })).toThrow('no active session');
    expect(() => svc.updateCredentials('hash')).not.toThrow();
  });

  it('flushes through the live session, and resolves at once with none', async () => {
    await expect(svc.flushUpdates()).resolves.toBeUndefined();

    svc.open(JOIN);
    await svc.flushUpdates(250);

    expect(latest().handle.flushUpdates).toHaveBeenCalledWith(250);
  });
});
