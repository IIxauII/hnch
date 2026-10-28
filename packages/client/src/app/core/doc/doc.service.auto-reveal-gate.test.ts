/**
 * DocService auto-reveal *sync gate*.
 *
 * Unanimous auto-reveal counts online voters, and the online set is only
 * meaningful while the relay has synced on the current socket. Before that —
 * on a page reload, where IndexedDB has already restored the doc, or on the
 * way back from a dropped connection — awareness holds this peer alone. A
 * peer that had voted would count itself as the whole room and reveal the
 * round for everyone.
 *
 * These tests run the real shared driver against the real doc; only the
 * relay connection is faked, so the `onSyncedChange` edge can be driven by
 * hand.
 */

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectToRelay,
  FIBONACCI_SCALE,
  joinDoc,
  type ConnectToRelayOptions,
  type RelayConnection,
} from '@hnch/shared';
import type { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

vi.mock('@ionic/angular/standalone', () => ({
  ToastController: class {
    create = vi.fn().mockResolvedValue({ present: vi.fn() });
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

// A plain class rather than `vi.fn()`: `restoreMocks` would strip a mock
// implementation between tests, and `teardown()` calls `destroy()` on it.
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    readonly whenSynced = Promise.resolve();
    destroy(): void {}
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

describe('DocService — auto-reveal sync gate', () => {
  let svc: DocService;
  let opts: ConnectToRelayOptions;

  function internals(): { doc: Y.Doc; awareness: Awareness } {
    return svc as unknown as { doc: Y.Doc; awareness: Awareness };
  }

  /** Write a second participant into the session doc, as a relay sync would. */
  function addPeer(id: string): void {
    const peerDoc = new Y.Doc();
    joinDoc(peerDoc, { participantId: id, displayName: id, joinedAt: 1 });
    Y.applyUpdate(internals().doc, Y.encodeStateAsUpdate(peerDoc));
  }

  /** Put `id` into the awareness set, as the relay's awareness push would. */
  function setOnline(clientId: number, id: string): void {
    const { awareness } = internals();
    awareness.states.set(clientId, { participantId: id });
    awareness.emit('change', [{ added: [clientId], updated: [], removed: [] }, 'test']);
  }

  /** Drop every remote awareness state, as `y-websocket` does on a socket close. */
  function clearRemoteAwareness(clientId: number): void {
    const { awareness } = internals();
    awareness.states.delete(clientId);
    awareness.emit('change', [{ added: [], updated: [], removed: [clientId] }, 'test']);
  }

  async function connect(): Promise<void> {
    svc.createSession(SESSION);
    svc.connect(CREDENTIALS);
    await Promise.resolve();
    await Promise.resolve();
  }

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

  afterEach(() => {
    svc.teardown();
  });

  it('does not reveal before the relay has synced, however the vote count looks', async () => {
    await connect();
    addPeer('p-peer');
    svc.commands.startRound({});

    // Awareness is this peer alone: 1 of 1 "online" voters has voted.
    svc.commands.toggleCurrentVote('5');

    expect(svc.currentRound()?.status).toBe('voting');
    expect(svc.autoRevealCount()).toBe(0);
  });

  it('waits for the absent peer once synced and the peer is online', async () => {
    await connect();
    addPeer('p-peer');
    svc.commands.startRound({});
    svc.commands.toggleCurrentVote('5');

    setOnline(7, 'p-peer');
    opts.onSyncedChange?.(true);

    expect(svc.currentRound()?.status).toBe('voting');
  });

  it('reveals on the sync edge when the round was already unanimous among online voters', async () => {
    await connect();
    addPeer('p-peer');
    svc.commands.startRound({});
    svc.commands.toggleCurrentVote('5');
    expect(svc.currentRound()?.status).toBe('voting');

    // Synced, and the relay reported nobody else online: the peer really is away.
    opts.onSyncedChange?.(true);

    expect(svc.currentRound()?.status).toBe('revealed');
    expect(svc.autoRevealCount()).toBe(1);
  });

  it('does not reveal while a dropped connection is re-syncing', async () => {
    await connect();
    addPeer('p-peer');
    setOnline(7, 'p-peer');
    opts.onSyncedChange?.(true);
    svc.commands.startRound({});
    svc.commands.toggleCurrentVote('5');
    expect(svc.currentRound()?.status).toBe('voting');

    // Socket drops: remote awareness is cleared and the peer looks gone.
    opts.onSyncedChange?.(false);
    clearRemoteAwareness(7);

    expect(svc.currentRound()?.status).toBe('voting');

    // Back online — the relay re-announces the peer ahead of its sync reply.
    setOnline(7, 'p-peer');
    opts.onSyncedChange?.(true);

    expect(svc.currentRound()?.status).toBe('voting');
  });

  it('still reveals a solo round without any relay sync', () => {
    // No other active participant means nobody to miscount, so an offline
    // solo session keeps its auto-reveal.
    svc.createSession(SESSION);
    svc.commands.startRound({});

    svc.commands.toggleCurrentVote('5');

    expect(svc.currentRound()?.status).toBe('revealed');
  });

  it('closes the gate again on disconnect', async () => {
    await connect();
    addPeer('p-peer');
    opts.onSyncedChange?.(true);

    svc.disconnect();
    svc.commands.startRound({});
    svc.commands.toggleCurrentVote('5');

    expect(svc.currentRound()?.status).toBe('voting');
  });
});
