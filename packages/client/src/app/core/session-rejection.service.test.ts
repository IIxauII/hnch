/**
 * `SessionRejectionService` — the relay refusing a connection the user is
 * already in a session on.
 *
 * Uses Angular TestBed so the real service, effect and all, is what runs.
 */

// Exercises: core/session-rejection.service:SessionRejectionService, isSessionUrl

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import type { JoinRejectionReason } from '@hnch/shared';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', () => ({}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';
import { isSessionUrl, SessionRejectionService } from './session-rejection.service';
import { ToastService } from '../services/toast.service';

/** Flush Angular effects, then let the async handler run to its end. */
async function flushAll(): Promise<void> {
  TestBed.flushEffects();
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function mount(startUrl: string) {
  const lastRejection = signal<JoinRejectionReason | null>(null);
  const roomCode = signal<string | null>('ABC123');
  const relayRoomUuid = signal<string | null>('uuid-1');
  const events = new Subject<unknown>();
  /** What happened, in order: the order is part of what is promised. */
  const calls: string[] = [];

  const doc = {
    lastRejection: lastRejection.asReadonly(),
    roomCode: roomCode.asReadonly(),
    relayRoomUuid: relayRoomUuid.asReadonly(),
    teardown: vi.fn(() => {
      calls.push('teardown');
      // As the real one does: the session is gone, and the refusal with it.
      lastRejection.set(null);
      roomCode.set(null);
      relayRoomUuid.set(null);
    }),
  };
  const lastSession = {
    clearPasswordHash: vi.fn(async (uuid: string) => {
      calls.push(`clearPasswordHash:${uuid}`);
    }),
    removeByUuid: vi.fn(async () => {}),
  };
  const toast = {
    error: vi.fn(async (message: string) => {
      calls.push(`toast:${message}`);
    }),
  };
  const router = {
    url: startUrl,
    events: events.asObservable(),
    navigate: vi.fn(async (commands: unknown[], extras?: unknown) => {
      calls.push(`navigate:${JSON.stringify([commands, extras])}`);
      return true;
    }),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SessionRejectionService,
      { provide: DocService, useValue: doc },
      { provide: LastSessionService, useValue: lastSession },
      { provide: ToastService, useValue: toast },
      { provide: Router, useValue: router },
    ],
  });
  TestBed.inject(SessionRejectionService);

  return {
    doc,
    lastSession,
    toast,
    router,
    calls,
    reject: (reason: JoinRejectionReason) => lastRejection.set(reason),
    navigatedTo: (url: string) => events.next(new NavigationEnd(1, url, url)),
    noSession: () => {
      roomCode.set(null);
      relayRoomUuid.set(null);
    },
  };
}

describe('isSessionUrl', () => {
  it('is true on the screens a session is spent on', () => {
    expect(isSessionUrl('/lobby/ABC123')).toBe(true);
    expect(isSessionUrl('/estimating/ABC123')).toBe(true);
  });

  it('is false everywhere else', () => {
    for (const url of ['/', '/home', '/join', '/join?code=ABC123', '/settings', '/onboarding']) {
      expect(isSessionUrl(url)).toBe(false);
    }
  });

  it('is not fooled by a path that merely starts the same', () => {
    expect(isSessionUrl('/lobbying')).toBe(false);
  });
});

describe('SessionRejectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The host changed the password; this socket reconnected with the old one.
  describe('a wrong password', () => {
    it('closes the session, forgets the hash, says why, and asks again on Join', async () => {
      const { reject, calls } = mount('/lobby/ABC123');

      reject('wrong-password');
      await flushAll();

      expect(calls).toEqual([
        'teardown',
        'clearPasswordHash:uuid-1',
        "toast:This session's password has changed.",
        'navigate:[["/join"],{"queryParams":{"code":"ABC123"}}]',
      ]);
    });

    it('does the same from Estimating, which had no handler of its own', async () => {
      const { reject, router, doc } = mount('/estimating/ABC123');

      reject('wrong-password');
      await flushAll();

      expect(doc.teardown).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledWith(['/join'], { queryParams: { code: 'ABC123' } });
    });

    it('still gets the user out when the cache cannot be written', async () => {
      const { reject, lastSession, router } = mount('/lobby/ABC123');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      lastSession.clearPasswordHash.mockRejectedValue(new Error('storage is full'));

      reject('wrong-password');
      await flushAll();

      expect(warn).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/join'], { queryParams: { code: 'ABC123' } });
    });
  });

  describe('any other refusal', () => {
    it('closes the session, says why, and goes Home', async () => {
      const { reject, calls, lastSession } = mount('/lobby/ABC123');

      reject('room-full');
      await flushAll();

      expect(calls).toEqual([
        'teardown',
        'toast:This session is full (20 participants max).',
        // `extras` is left out; JSON writes the missing argument as null.
        'navigate:[["/home"],null]',
      ]);
      expect(lastSession.clearPasswordHash).not.toHaveBeenCalled();
    });

    it('words it for someone who was in the session, not someone typing a code', async () => {
      const { reject, toast } = mount('/lobby/ABC123');

      reject('unknown-room');
      await flushAll();

      expect(toast.error).toHaveBeenCalledWith("That session isn't active anymore.");
    });
  });

  // A refusal during a join attempt belongs to whoever is making the attempt.
  describe('away from a session screen', () => {
    it('leaves a refusal alone while the user is on Join', async () => {
      const { reject, doc, toast, router } = mount('/join?code=ABC123');

      reject('wrong-password');
      await flushAll();

      expect(doc.teardown).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('leaves it alone on Home, where a rejoin reports for itself', async () => {
      const { reject, doc } = mount('/home');

      reject('room-full');
      await flushAll();

      expect(doc.teardown).not.toHaveBeenCalled();
    });

    // A join that timed out goes in anyway; the verdict arrives afterwards.
    it('takes it up once the user has arrived on a session screen', async () => {
      const { reject, navigatedTo, doc, router } = mount('/join?code=ABC123');
      reject('wrong-password');
      await flushAll();
      expect(doc.teardown).not.toHaveBeenCalled();

      navigatedTo('/lobby/ABC123');
      await flushAll();

      expect(doc.teardown).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledWith(['/join'], { queryParams: { code: 'ABC123' } });
    });
  });

  it('acts once on a refusal', async () => {
    const { reject, navigatedTo, doc, toast } = mount('/lobby/ABC123');

    reject('room-full');
    await flushAll();
    navigatedTo('/lobby/ABC123');
    await flushAll();

    expect(doc.teardown).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('does nothing while nothing has been refused', async () => {
    const { doc, navigatedTo } = mount('/lobby/ABC123');

    navigatedTo('/estimating/ABC123');
    await flushAll();

    expect(doc.teardown).not.toHaveBeenCalled();
  });

  it('goes Home for a wrong password when there is no code to ask again for', async () => {
    const { reject, noSession, router, lastSession } = mount('/lobby/ABC123');
    noSession();

    reject('wrong-password');
    await flushAll();

    expect(lastSession.clearPasswordHash).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
  });
});
