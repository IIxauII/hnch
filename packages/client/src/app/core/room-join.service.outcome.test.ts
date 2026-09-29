/**
 * `RoomJoinService.waitForJoinOutcome` — what counts as an answer from the
 * relay.
 *
 * The relay accepts the WebSocket upgrade and only then closes it on a wrong
 * password (close 4002, ADR-0035). An open socket is therefore not yet a yes:
 * `syncStatus` passes through `'connected'` on the way to a rejection. The
 * outcome settles on the first sync instead, so callers can stay where they
 * are until they know.
 *
 * The signals it reads are about whatever session the app holds. The wait is
 * about one session: the one that was current when it started.
 */

// Exercises: core/room-join.service:RoomJoinService (waitForJoinOutcome)

import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JoinRejectionReason } from '@hnch/shared';

vi.mock('@ionic/angular/standalone', () => ({}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

type Status = 'offline' | 'connecting' | 'connected' | 'disconnected';

async function mount() {
  const { RoomJoinService } = await import('./room-join.service');
  const { DocService } = await import('./doc/doc.service');
  const { AppPreferenceService } = await import('./app-preference.service');
  const { AvatarColorService } = await import('./avatar-color.service');
  const { DisplayNameService } = await import('./display-name.service');
  const { ParticipantIdService } = await import('./participant-id.service');

  const syncStatus = signal<Status>('connecting');
  const relaySynced = signal(false);
  const lastRejection = signal<JoinRejectionReason | null>(null);
  const sessionEpoch = signal(1);

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: DocService,
        useValue: {
          syncStatus: syncStatus.asReadonly(),
          relaySynced: relaySynced.asReadonly(),
          joined: computed(() => syncStatus() === 'connected' && relaySynced()),
          lastRejection: lastRejection.asReadonly(),
          sessionEpoch: sessionEpoch.asReadonly(),
        },
      },
      { provide: AppPreferenceService, useValue: { resolvedRelayHttpUrl: () => 'http://x.test' } },
      { provide: AvatarColorService, useValue: { value: () => null } },
      { provide: DisplayNameService, useValue: { getDisplayName: () => Promise.resolve('Ada') } },
      { provide: ParticipantIdService, useValue: { getOrCreateId: () => Promise.resolve('me') } },
    ],
  });

  return {
    service: TestBed.inject(RoomJoinService),
    syncStatus,
    relaySynced,
    lastRejection,
    /** The session is torn down, or another takes its place. */
    sessionChanges: () => sessionEpoch.update((n) => n + 1),
  };
}

/** Resolve state of a promise without waiting on it. */
async function settledValue<T>(promise: Promise<T>): Promise<T | 'pending'> {
  const pending = Symbol('pending');
  const winner = await Promise.race([promise, Promise.resolve(pending)]);
  return winner === pending ? 'pending' : (winner as T);
}

describe('RoomJoinService.waitForJoinOutcome', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('an open socket alone is not an answer', async () => {
    const { service, syncStatus } = await mount();
    const outcome = service.waitForJoinOutcome();

    syncStatus.set('connected');
    TestBed.flushEffects();

    expect(await settledValue(outcome)).toBe('pending');
  });

  it('settles "connected" once the relay has synced', async () => {
    const { service, syncStatus, relaySynced } = await mount();
    const outcome = service.waitForJoinOutcome();

    syncStatus.set('connected');
    TestBed.flushEffects();
    relaySynced.set(true);
    TestBed.flushEffects();

    expect(await outcome).toBe('connected');
  });

  it('a wrong password is a rejection, although the socket opened first', async () => {
    const { service, syncStatus, lastRejection } = await mount();
    const outcome = service.waitForJoinOutcome();

    // What the relay does: accept the upgrade, then close with 4002.
    syncStatus.set('connected');
    TestBed.flushEffects();
    syncStatus.set('disconnected');
    lastRejection.set('wrong-password');
    TestBed.flushEffects();

    expect(await outcome).toBe('wrong-password');
  });

  it('a rejection wins over a sync that arrives with it', async () => {
    const { service, syncStatus, relaySynced, lastRejection } = await mount();
    const outcome = service.waitForJoinOutcome();

    syncStatus.set('connected');
    relaySynced.set(true);
    lastRejection.set('room-full');
    TestBed.flushEffects();

    expect(await outcome).toBe('room-full');
  });

  it('settles on a state that was already decided when it was called', async () => {
    const { service, syncStatus, relaySynced } = await mount();
    syncStatus.set('connected');
    relaySynced.set(true);

    const outcome = service.waitForJoinOutcome();
    TestBed.flushEffects();

    expect(await outcome).toBe('connected');
  });

  it('gives up after the timeout: a slow relay is not a no', async () => {
    const { service, syncStatus } = await mount();
    const outcome = service.waitForJoinOutcome({ timeoutMs: 5_000 });

    syncStatus.set('connected');
    TestBed.flushEffects();
    vi.advanceTimersByTime(4_999);
    expect(await settledValue(outcome)).toBe('pending');

    vi.advanceTimersByTime(1);
    expect(await outcome).toBe('timeout');
  });

  it('settles once: what happens afterwards does not change the answer', async () => {
    const { service, syncStatus, relaySynced, lastRejection } = await mount();
    const outcome = service.waitForJoinOutcome();

    syncStatus.set('connected');
    relaySynced.set(true);
    TestBed.flushEffects();
    lastRejection.set('wrong-password');
    TestBed.flushEffects();

    expect(await outcome).toBe('connected');
  });

  // The host had ended the session before this peer got in: the doc syncs,
  // `SessionEndService` sees the end and tears the session down. What the
  // signals say from then on is not an answer to this wait.
  it('settles "superseded" when the session it was waiting on is torn down', async () => {
    const { service, syncStatus, sessionChanges } = await mount();
    const outcome = service.waitForJoinOutcome();

    sessionChanges();
    syncStatus.set('offline');
    TestBed.flushEffects();

    expect(await outcome).toBe('superseded');
  });

  // The user started another session meanwhile. That one connecting is not
  // this one connecting.
  it('does not take another session coming up for its own', async () => {
    const { service, syncStatus, relaySynced, sessionChanges } = await mount();
    const outcome = service.waitForJoinOutcome();

    sessionChanges();
    syncStatus.set('connected');
    relaySynced.set(true);
    TestBed.flushEffects();

    expect(await outcome).toBe('superseded');
  });

  it('says "superseded", not "timeout", when the session went without a word', async () => {
    const { service, sessionChanges } = await mount();
    const outcome = service.waitForJoinOutcome({ timeoutMs: 5_000 });
    // Let the effect have its first turn, then change the session behind it.
    TestBed.flushEffects();

    sessionChanges();
    vi.advanceTimersByTime(5_000);

    expect(await outcome).toBe('superseded');
  });

  describe('given up on by the caller', () => {
    it('settles "superseded" when the caller aborts', async () => {
      const { service } = await mount();
      const attempt = new AbortController();
      const outcome = service.waitForJoinOutcome({ signal: attempt.signal });
      TestBed.flushEffects();

      attempt.abort();

      expect(await outcome).toBe('superseded');
    });

    it('settles at once when the caller had already given up', async () => {
      const { service } = await mount();
      const attempt = new AbortController();
      attempt.abort();

      expect(await service.waitForJoinOutcome({ signal: attempt.signal })).toBe('superseded');
    });

    it('stops listening once it has an answer', async () => {
      const { service, syncStatus, relaySynced } = await mount();
      const attempt = new AbortController();
      const removed = vi.spyOn(attempt.signal, 'removeEventListener');
      const outcome = service.waitForJoinOutcome({ signal: attempt.signal });

      syncStatus.set('connected');
      relaySynced.set(true);
      TestBed.flushEffects();

      expect(await outcome).toBe('connected');
      expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
    });
  });
});
