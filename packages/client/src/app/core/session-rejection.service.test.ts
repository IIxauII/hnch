/**
 * `SessionRejectionService` — the relay refusing a connection the user is
 * already in a session on.
 *
 * What is tested here is *when* it acts: only on a session screen, not
 * while the password is being changed from here, once per refusal. What
 * the way out does (what is forgotten, where the user lands, what they are
 * told) is `SessionExitService`'s `refused` exit and is tested there.
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

vi.mock('@ionic/angular/standalone', () => ({ NavController: class NavController {} }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { DocService } from './doc/doc.service';
import { SessionAccessService } from './session-access.service';
import { SessionExitService } from './session-exit.service';
import { isSessionUrl, SessionRejectionService } from './session-rejection.service';

/** Flush Angular effects, then let the async handler run to its end. */
async function flushAll(): Promise<void> {
  TestBed.flushEffects();
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function mount(startUrl: string) {
  const lastRejection = signal<JoinRejectionReason | null>(null);
  const events = new Subject<unknown>();

  const doc = { lastRejection: lastRejection.asReadonly() };
  const sessionExit = {
    exit: vi.fn((_ending: unknown) => {
      // As the real one does: its teardown takes the refusal with the session.
      lastRejection.set(null);
      return Promise.resolve();
    }),
  };
  const saving = signal(false);
  const router = { url: startUrl, events: events.asObservable() };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SessionRejectionService,
      { provide: DocService, useValue: doc },
      { provide: SessionExitService, useValue: sessionExit },
      { provide: Router, useValue: router },
      { provide: SessionAccessService, useValue: { saving: saving.asReadonly() } },
    ],
  });
  TestBed.inject(SessionRejectionService);

  return {
    exit: sessionExit.exit,
    saving,
    reject: (reason: JoinRejectionReason) => lastRejection.set(reason),
    clearRejection: () => lastRejection.set(null),
    navigatedTo: (url: string) => events.next(new NavigationEnd(1, url, url)),
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

  it.each([
    '/lobby/ABC123',
    '/estimating/ABC123',
  ])('leaves the session as refused, with the reason, from %s', async (url) => {
    const { reject, exit } = mount(url);

    reject('wrong-password');
    await flushAll();

    expect(exit).toHaveBeenCalledExactlyOnceWith({ kind: 'refused', reason: 'wrong-password' });
  });

  it('passes any other reason on as it is', async () => {
    const { reject, exit } = mount('/lobby/ABC123');

    reject('room-full');
    await flushAll();

    expect(exit).toHaveBeenCalledExactlyOnceWith({ kind: 'refused', reason: 'room-full' });
  });

  // A refusal during a join attempt belongs to whoever is making the attempt.
  describe('away from a session screen', () => {
    it('leaves a refusal alone while the user is on Join', async () => {
      const { reject, exit } = mount('/join?code=ABC123');

      reject('wrong-password');
      await flushAll();

      expect(exit).not.toHaveBeenCalled();
    });

    it('leaves it alone on Home, where a rejoin reports for itself', async () => {
      const { reject, exit } = mount('/home');

      reject('room-full');
      await flushAll();

      expect(exit).not.toHaveBeenCalled();
    });

    // A join that timed out goes in anyway; the verdict arrives afterwards.
    it('takes it up once the user has arrived on a session screen', async () => {
      const { reject, navigatedTo, exit } = mount('/join?code=ABC123');
      reject('wrong-password');
      await flushAll();
      expect(exit).not.toHaveBeenCalled();

      navigatedTo('/lobby/ABC123');
      await flushAll();

      expect(exit).toHaveBeenCalledExactlyOnceWith({ kind: 'refused', reason: 'wrong-password' });
    });
  });

  // The host is changing the password on this very device. The refusal is
  // of the connection as it was; the one about to be made carries the new one.
  describe('while the password is being changed from here', () => {
    it('waits', async () => {
      const { reject, saving, exit } = mount('/lobby/ABC123');
      saving.set(true);

      reject('wrong-password');
      await flushAll();

      expect(exit).not.toHaveBeenCalled();
    });

    it('has nothing left to do when the change took the refusal back', async () => {
      const { reject, saving, exit, clearRejection } = mount('/lobby/ABC123');
      saving.set(true);
      reject('wrong-password');
      await flushAll();

      clearRejection();
      saving.set(false);
      await flushAll();

      expect(exit).not.toHaveBeenCalled();
    });

    it('acts once the change has failed and the refusal stands', async () => {
      const { reject, saving, exit } = mount('/lobby/ABC123');
      saving.set(true);
      reject('wrong-password');
      await flushAll();

      saving.set(false);
      await flushAll();

      expect(exit).toHaveBeenCalledOnce();
    });
  });

  it('acts once on a refusal', async () => {
    const { reject, navigatedTo, exit } = mount('/lobby/ABC123');

    reject('room-full');
    await flushAll();
    navigatedTo('/lobby/ABC123');
    await flushAll();

    expect(exit).toHaveBeenCalledOnce();
  });

  it('does nothing while nothing has been refused', async () => {
    const { navigatedTo, exit } = mount('/lobby/ABC123');

    navigatedTo('/estimating/ABC123');
    await flushAll();

    expect(exit).not.toHaveBeenCalled();
  });
});
