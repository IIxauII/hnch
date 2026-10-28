/**
 * `SessionExitService` — the client's one way out of a live session.
 *
 * Each ending kind's order and outcome is pinned here, once. The call sites
 * (the Leave flows, the session-end, participant-removal and
 * session-rejection services) are tested only for which ending they ask for.
 */

// Exercises: core/session-exit.service:SessionExitService

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', () => ({ NavController: class NavController {} }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { NavController } from '@ionic/angular/standalone';

import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';
import { ParticipantIdService } from './participant-id.service';
import { SessionExitService } from './session-exit.service';
import { ToastService } from '../services/toast.service';

function mount(opts: { myId?: string | null; code?: string | null; uuid?: string | null } = {}) {
  /** What happened, in order: the order is part of what is promised. */
  const calls: string[] = [];
  const relayRoomUuid = signal<string | null>(opts.uuid === undefined ? 'uuid-1' : opts.uuid);
  const roomCode = signal<string | null>(opts.code === undefined ? 'ABC123' : opts.code);

  const leave = vi.fn(() => {
    calls.push('leave');
    return { applied: true } as const;
  });
  const doc = {
    relayRoomUuid: relayRoomUuid.asReadonly(),
    roomCode: roomCode.asReadonly(),
    commands: { leave },
    flushUpdates: vi.fn(async () => {
      calls.push('flush');
    }),
    teardown: vi.fn(() => {
      calls.push('teardown');
      // As the real one does: nothing of the session is left to read.
      relayRoomUuid.set(null);
      roomCode.set(null);
    }),
  };
  const lastSession = {
    removeByUuid: vi.fn(async (uuid: string) => {
      calls.push(`removeByUuid:${uuid}`);
    }),
    clearPasswordHash: vi.fn(async (uuid: string) => {
      calls.push(`clearPasswordHash:${uuid}`);
    }),
    clearAll: vi.fn(async () => {
      calls.push('clearAll');
    }),
  };
  const toast = {
    info: vi.fn(async (message: string) => {
      calls.push(`info:${message}`);
    }),
    error: vi.fn(async (message: string) => {
      calls.push(`error:${message}`);
    }),
  };
  const router = {
    navigate: vi.fn(async (commands: unknown[]) => {
      calls.push(`navigate:${JSON.stringify(commands)}`);
      return true;
    }),
  };
  const nav = {
    navigateRoot: vi.fn(async (commands: unknown[], extras?: unknown) => {
      calls.push(`root:${JSON.stringify([commands, extras])}`);
      return true;
    }),
  };
  const myId = signal<string | null>(opts.myId === undefined ? 'p-me' : opts.myId);

  TestBed.configureTestingModule({
    providers: [
      SessionExitService,
      { provide: DocService, useValue: doc },
      { provide: LastSessionService, useValue: lastSession },
      { provide: ParticipantIdService, useValue: { id: myId.asReadonly() } },
      { provide: ToastService, useValue: toast },
      { provide: Router, useValue: router },
      { provide: NavController, useValue: nav },
    ],
  });

  return { exit: TestBed.inject(SessionExitService), calls, doc, lastSession, toast, router, nav };
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

describe('SessionExitService — left', () => {
  it('writes the leave, flushes it, tears down, forgets the session, then goes Home', async () => {
    const { exit, calls } = mount();

    await exit.exit({ kind: 'left' });

    expect(calls).toEqual([
      'leave',
      'flush',
      'teardown',
      'removeByUuid:uuid-1',
      'navigate:["/home"]',
    ]);
  });

  // The leave has to leave the socket before the socket is closed.
  it('tears down only once the flush is over', async () => {
    const { exit, doc, calls } = mount();
    let release: () => void = () => {};
    doc.flushUpdates.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          calls.push('flush');
          release = resolve;
        }),
    );

    const leaving = exit.exit({ kind: 'left' });
    await flushMicrotasks();
    expect(doc.teardown).not.toHaveBeenCalled();

    release();
    await leaving;
    expect(calls).toEqual([
      'leave',
      'flush',
      'teardown',
      'removeByUuid:uuid-1',
      'navigate:["/home"]',
    ]);
  });

  it('writes no leave and waits for no flush without a participant id', async () => {
    const { exit, calls } = mount({ myId: null });

    await exit.exit({ kind: 'left' });

    expect(calls).toEqual(['teardown', 'removeByUuid:uuid-1', 'navigate:["/home"]']);
  });

  // The doc's own UUID is writable by everyone in the session: it must not
  // decide which of this device's sessions is forgotten, let alone all.
  it('forgets nothing without the UUID the relay issued', async () => {
    const { exit, lastSession, router } = mount({ uuid: null });

    await exit.exit({ kind: 'left' });

    expect(lastSession.removeByUuid).not.toHaveBeenCalled();
    expect(lastSession.clearAll).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
  });

  it('still goes Home when the cache cannot be written', async () => {
    const { exit, lastSession, router } = mount();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failure = new Error('storage is full');
    lastSession.removeByUuid.mockRejectedValueOnce(failure);

    await exit.exit({ kind: 'left' });

    expect(warn).toHaveBeenCalledWith('Failed to update the remembered session:', failure);
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
  });
});

// The host ended the session for everyone, or removed this peer.
describe.each(['ended', 'removed'] as const)('SessionExitService — %s', (kind) => {
  it('tears down, forgets the session, shows the message, then goes Home', async () => {
    const { exit, calls } = mount();

    await exit.exit({ kind, message: 'Session ended by Hana' });

    expect(calls).toEqual([
      'teardown',
      'removeByUuid:uuid-1',
      'info:Session ended by Hana',
      'navigate:["/home"]',
    ]);
  });

  it('forgets nothing without the UUID the relay issued', async () => {
    const { exit, lastSession, toast } = mount({ uuid: null });

    await exit.exit({ kind, message: 'Removed by host' });

    expect(lastSession.removeByUuid).not.toHaveBeenCalled();
    expect(lastSession.clearAll).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledExactlyOnceWith('Removed by host');
  });

  it('still says why and goes Home when the cache cannot be written', async () => {
    const { exit, lastSession, calls } = mount();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    lastSession.removeByUuid.mockRejectedValueOnce(new Error('storage is full'));

    await exit.exit({ kind, message: 'Removed by host' });

    expect(warn).toHaveBeenCalled();
    expect(calls).toEqual(['teardown', 'info:Removed by host', 'navigate:["/home"]']);
  });
});

/** Drain the microtask queue, for an exit that is not waited for. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

// The relay turned this peer's connection away (ADR-0044 decides what the
// device keeps). As the root, in place of the session screen: there is no
// session to go back to, and Back must not lead to one.
describe('SessionExitService — refused', () => {
  // The host changed the password; this socket reconnected with the old one.
  it('a wrong password: forgets only the hash and asks again on Join, code filled in', async () => {
    const { exit, calls } = mount();

    await exit.exit({ kind: 'refused', reason: 'wrong-password' });

    expect(calls).toEqual([
      'teardown',
      'clearPasswordHash:uuid-1',
      'root:[["/join"],{"queryParams":{"code":"ABC123"},"replaceUrl":true}]',
      "error:Enter this session's password to get back in.",
    ]);
  });

  it('a wrong password with no code to ask again for goes Home', async () => {
    const { exit, nav, lastSession } = mount({ code: null, uuid: null });

    await exit.exit({ kind: 'refused', reason: 'wrong-password' });

    expect(lastSession.clearPasswordHash).not.toHaveBeenCalled();
    expect(nav.navigateRoot).toHaveBeenCalledExactlyOnceWith(['/home'], { replaceUrl: true });
  });

  // Home lists what is remembered: the forget is asked for before it shows.
  it('a session that is gone: forgets it, then goes Home', async () => {
    const { exit, calls } = mount();

    await exit.exit({ kind: 'refused', reason: 'unknown-room' });

    expect(calls).toEqual([
      'teardown',
      'removeByUuid:uuid-1',
      'root:[["/home"],{"replaceUrl":true}]',
      "error:That session isn't active anymore.",
    ]);
  });

  it('any other refusal: forgets nothing, says why, goes Home', async () => {
    const { exit, calls, lastSession } = mount();

    await exit.exit({ kind: 'refused', reason: 'room-full' });

    expect(calls).toEqual([
      'teardown',
      'root:[["/home"],{"replaceUrl":true}]',
      'error:This session is full (20 participants max).',
    ]);
    expect(lastSession.clearPasswordHash).not.toHaveBeenCalled();
    expect(lastSession.removeByUuid).not.toHaveBeenCalled();
  });

  // Storage is slow, or stuck. The page that is showing has nothing to
  // show: the way out does not wait.
  it('does not keep the user on the dead page while the cache is written', async () => {
    const { exit, lastSession, nav, toast } = mount();
    lastSession.removeByUuid.mockImplementationOnce(() => new Promise<void>(() => {}));

    void exit.exit({ kind: 'refused', reason: 'unknown-room' });
    await flushMicrotasks();

    expect(nav.navigateRoot).toHaveBeenCalledWith(['/home'], { replaceUrl: true });
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it('is over only once the forget is', async () => {
    const { exit, lastSession, nav } = mount();
    let release: () => void = () => {};
    lastSession.removeByUuid.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    let over = false;

    const leaving = exit.exit({ kind: 'refused', reason: 'unknown-room' }).then(() => {
      over = true;
    });
    await flushMicrotasks();
    expect(nav.navigateRoot).toHaveBeenCalled();
    expect(over).toBe(false);

    release();
    await leaving;
    expect(over).toBe(true);
  });

  it.each([
    'wrong-password',
    'unknown-room',
  ] as const)('still gets the user out when the cache cannot be written (%s)', async (reason) => {
    const { exit, lastSession, nav, toast } = mount();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    lastSession.clearPasswordHash.mockRejectedValueOnce(new Error('storage'));
    lastSession.removeByUuid.mockRejectedValueOnce(new Error('storage'));

    await exit.exit({ kind: 'refused', reason });

    expect(warn).toHaveBeenCalledOnce();
    expect(nav.navigateRoot).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledOnce();
  });
});
