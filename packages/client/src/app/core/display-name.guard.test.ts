/**
 * Unit tests for displayNameGuard.
 *
 * The guard is a CanMatchFn that uses inject(), so it must run inside
 * Angular's injection context. We use TestBed.runInInjectionContext() to
 * provide that context without spinning up a full router or renderer.
 *
 * Scenarios covered:
 *  - Happy path: display name set → returns true
 *  - No name + join path → captures URL from navigation, stores pending join
 *  - No name + lobby/:code → rewrites to /join?code=CODE, stores pending join
 *  - No name + estimating/:code → same rewrite
 *  - No name + unknown path → redirects to /onboarding with no pending URL write
 *  - Fallback when getCurrentNavigation() is null (cold-load deep-link)
 */

import { TestBed } from '@angular/core/testing';
import { type UrlSegment } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', () => ({}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { displayNameGuard } from './display-name.guard';
import { DisplayNameService } from './display-name.service';
import { Router } from '@angular/router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seg(path: string): UrlSegment {
  return { path, parameters: {}, parameterMap: null as never, toString: () => path } as UrlSegment;
}

const ONBOARDING_TREE = Symbol('onboarding-tree');

function makeRouter(navigationUrl?: string) {
  const nav = navigationUrl
    ? { extractedUrl: { toString: () => navigationUrl }, finalUrl: null }
    : null;

  return {
    createUrlTree: vi.fn(() => ONBOARDING_TREE),
    getCurrentNavigation: vi.fn(() => nav),
  };
}

function makeDisplayNameService(name: string | null) {
  return {
    getDisplayName: vi.fn().mockResolvedValue(name),
    setPendingJoinUrl: vi.fn().mockResolvedValue(undefined),
  };
}

async function runGuard(
  displayNameMock: ReturnType<typeof makeDisplayNameService>,
  routerMock: ReturnType<typeof makeRouter>,
  segments: UrlSegment[],
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DisplayNameService, useValue: displayNameMock },
      { provide: Router, useValue: routerMock },
    ],
  });

  const result = await TestBed.runInInjectionContext(() =>
    // `displayNameGuard` is a CanMatchFn — first arg is the route (unused)
    displayNameGuard({} as never, segments),
  );
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  TestBed.resetTestingModule();
  vi.resetAllMocks();
});

describe('displayNameGuard', () => {
  describe('when display name is set', () => {
    it('returns true without setting a pending URL', async () => {
      const displayNameMock = makeDisplayNameService('Alice');
      const routerMock = makeRouter();

      const result = await runGuard(displayNameMock, routerMock, [seg('lobby'), seg('ABC123')]);

      expect(result).toBe(true);
      expect(displayNameMock.setPendingJoinUrl).not.toHaveBeenCalled();
    });

    it('returns true even when the path is /join', async () => {
      const displayNameMock = makeDisplayNameService('Alice');
      const routerMock = makeRouter('/join?code=ABCD12');

      const result = await runGuard(displayNameMock, routerMock, [seg('join')]);

      expect(result).toBe(true);
      expect(displayNameMock.setPendingJoinUrl).not.toHaveBeenCalled();
    });
  });

  describe('when display name is absent', () => {
    it('redirects to /onboarding for an unknown path', async () => {
      const displayNameMock = makeDisplayNameService(null);
      const routerMock = makeRouter();

      const result = await runGuard(displayNameMock, routerMock, [seg('home')]);

      expect(result).toBe(ONBOARDING_TREE);
      expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/onboarding']);
      expect(displayNameMock.setPendingJoinUrl).not.toHaveBeenCalled();
    });

    it('stores the full join URL when path is "join"', async () => {
      const displayNameMock = makeDisplayNameService(null);
      const routerMock = makeRouter('/join?code=ABCD12');

      await runGuard(displayNameMock, routerMock, [seg('join')]);

      expect(displayNameMock.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=ABCD12');
      expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/onboarding']);
    });

    it('falls back to "/join" when getCurrentNavigation() is null', async () => {
      const displayNameMock = makeDisplayNameService(null);
      const routerMock = makeRouter(/* no nav */ undefined);

      await runGuard(displayNameMock, routerMock, [seg('join')]);

      expect(displayNameMock.setPendingJoinUrl).toHaveBeenCalledWith('/join');
    });

    it('rewrites lobby/:code to /join?code=CODE and stores as pending join URL', async () => {
      const displayNameMock = makeDisplayNameService(null);
      const routerMock = makeRouter();

      await runGuard(displayNameMock, routerMock, [seg('lobby'), seg('XYZ789')]);

      expect(displayNameMock.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=XYZ789');
    });

    it('rewrites estimating/:code to /join?code=CODE and stores as pending join URL', async () => {
      const displayNameMock = makeDisplayNameService(null);
      const routerMock = makeRouter();

      await runGuard(displayNameMock, routerMock, [seg('estimating'), seg('ABCDEF')]);

      expect(displayNameMock.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=ABCDEF');
    });

    it('uses /join as fallback when lobby has no code segment', async () => {
      const displayNameMock = makeDisplayNameService(null);
      const routerMock = makeRouter();

      await runGuard(displayNameMock, routerMock, [seg('lobby')]);

      expect(displayNameMock.setPendingJoinUrl).toHaveBeenCalledWith('/join');
    });

    it('always redirects to /onboarding regardless of path', async () => {
      const displayNameMock = makeDisplayNameService(null);
      const routerMock = makeRouter();

      const result = await runGuard(displayNameMock, routerMock, [seg('lobby'), seg('ABC123')]);

      expect(result).toBe(ONBOARDING_TREE);
      expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/onboarding']);
    });
  });

  describe('when display name is an empty string', () => {
    it('redirects to /onboarding (blank name is treated as missing)', async () => {
      const displayNameMock = makeDisplayNameService('   ');
      const routerMock = makeRouter();

      const result = await runGuard(displayNameMock, routerMock, [seg('lobby')]);

      expect(result).toBe(ONBOARDING_TREE);
    });
  });
});
