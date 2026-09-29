/**
 * `RoomJoinService.waitForJoinOutcome` — what counts as an answer from the
 * relay.
 *
 * The relay accepts the WebSocket upgrade and only then closes it on a wrong
 * password (close 4002, ADR-0035). An open socket is therefore not yet a yes:
 * `syncStatus` passes through `'connected'` on the way to a rejection. The
 * outcome settles on the first sync instead, so callers can stay where they
 * are until they know.
 */

// Exercises: core/room-join.service:RoomJoinService (waitForJoinOutcome)

import { signal } from '@angular/core';
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

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: DocService,
        useValue: {
          syncStatus: syncStatus.asReadonly(),
          relaySynced: relaySynced.asReadonly(),
          lastRejection: lastRejection.asReadonly(),
        },
      },
      { provide: AppPreferenceService, useValue: { resolvedRelayHttpUrl: () => 'http://x.test' } },
      { provide: AvatarColorService, useValue: { value: () => null } },
      { provide: DisplayNameService, useValue: { getDisplayName: () => Promise.resolve('Ada') } },
      { provide: ParticipantIdService, useValue: { getOrCreateId: () => Promise.resolve('me') } },
    ],
  });

  return { service: TestBed.inject(RoomJoinService), syncStatus, relaySynced, lastRejection };
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
});
