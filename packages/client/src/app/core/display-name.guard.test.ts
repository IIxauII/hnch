/**
 * Unit tests for displayNameGuard (CanMatchFn).
 *
 * The guard gates non-onboarding routes on a persisted display name and
 * handles three redirect scenarios when no name is found:
 *
 *  1. Route has a display name → returns true (pass-through)
 *  2. Target is `/join` → stashes full join URL, redirects to /onboarding
 *  3. Target is `/lobby/:code` or `/estimating/:code` → rewrites to
 *     `/join?code=CODE`, stashes that, redirects to /onboarding
 *  4. Any other route without a name → redirects to /onboarding (no stash)
 *
 * Uses TestBed.runInInjectionContext to satisfy `inject()` calls inside
 * the guard without a full Angular router setup.
 */

import type { Route, UrlSegment } from '@angular/router'
import { Router } from '@angular/router'
import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('@ionic/angular/standalone', () => ({}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

import { DisplayNameService } from './display-name.service'
import { displayNameGuard } from './display-name.guard'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegments(...paths: string[]): UrlSegment[] {
  return paths.map((path) => ({ path } as UrlSegment))
}

function makeDisplayNameService(name: string | null = null) {
  return {
    getDisplayName: vi.fn().mockResolvedValue(name),
    setPendingJoinUrl: vi.fn().mockResolvedValue(undefined),
  }
}

function makeRouter(navigation: unknown = null) {
  return {
    getCurrentNavigation: vi.fn().mockReturnValue(navigation),
    createUrlTree: vi.fn((commands: string[]) => ({ _commands: commands })),
  }
}

async function runGuard(
  displayNameService: ReturnType<typeof makeDisplayNameService>,
  router: ReturnType<typeof makeRouter>,
  segments: UrlSegment[],
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DisplayNameService, useValue: displayNameService },
      { provide: Router, useValue: router },
    ],
  })
  return TestBed.runInInjectionContext(() =>
    displayNameGuard({} as Route, segments),
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('displayNameGuard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('when display name is set', () => {
    it('returns true for any route segment', async () => {
      const svc = makeDisplayNameService('Alice')
      const router = makeRouter()
      const result = await runGuard(svc, router, makeSegments('lobby', 'ABCDEF'))
      expect(result).toBe(true)
    })

    it('returns true even when segment is /join', async () => {
      const svc = makeDisplayNameService('Bob')
      const router = makeRouter()
      const result = await runGuard(svc, router, makeSegments('join'))
      expect(result).toBe(true)
    })

    it('does not call setPendingJoinUrl when name is present', async () => {
      const svc = makeDisplayNameService('Carol')
      const router = makeRouter()
      await runGuard(svc, router, makeSegments('join'))
      expect(svc.setPendingJoinUrl).not.toHaveBeenCalled()
    })

    it('treats whitespace-only name as missing (redirects)', async () => {
      const svc = makeDisplayNameService('   ')
      const router = makeRouter()
      const result = await runGuard(svc, router, makeSegments('lobby'))
      expect(result).not.toBe(true)
      expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
    })
  })

  describe('when display name is null (no name stored)', () => {
    it('redirects to /onboarding for a generic route', async () => {
      const svc = makeDisplayNameService(null)
      const router = makeRouter()
      const result = await runGuard(svc, router, makeSegments('settings'))
      expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
      expect(result).toEqual({ _commands: ['/onboarding'] })
    })

    it('does not call setPendingJoinUrl for a generic route', async () => {
      const svc = makeDisplayNameService(null)
      const router = makeRouter()
      await runGuard(svc, router, makeSegments('settings'))
      expect(svc.setPendingJoinUrl).not.toHaveBeenCalled()
    })

    describe('/join deep-link', () => {
      it('calls setPendingJoinUrl with the navigation URL when available', async () => {
        const svc = makeDisplayNameService(null)
        const router = makeRouter({
          extractedUrl: { toString: () => '/join?code=ABCDEF' },
          finalUrl: null,
        })
        await runGuard(svc, router, makeSegments('join'))
        expect(svc.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=ABCDEF')
      })

      it('falls back to finalUrl when extractedUrl is absent', async () => {
        const svc = makeDisplayNameService(null)
        const router = makeRouter({
          extractedUrl: null,
          finalUrl: { toString: () => '/join?code=XYZ123' },
        })
        await runGuard(svc, router, makeSegments('join'))
        expect(svc.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=XYZ123')
      })

      it('falls back to "/join" when navigation is null', async () => {
        const svc = makeDisplayNameService(null)
        const router = makeRouter(null)
        await runGuard(svc, router, makeSegments('join'))
        expect(svc.setPendingJoinUrl).toHaveBeenCalledWith('/join')
      })

      it('redirects to /onboarding after stashing', async () => {
        const svc = makeDisplayNameService(null)
        const router = makeRouter(null)
        const result = await runGuard(svc, router, makeSegments('join'))
        expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
        expect(result).toEqual({ _commands: ['/onboarding'] })
      })
    })

    describe('/lobby/:code cold-start', () => {
      it('rewrites to /join?code=CODE and stashes it', async () => {
        const svc = makeDisplayNameService(null)
        const router = makeRouter()
        await runGuard(svc, router, makeSegments('lobby', 'ABCDEF'))
        expect(svc.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=ABCDEF')
      })

      it('falls back to /join when lobby segment has no code', async () => {
        const svc = makeDisplayNameService(null)
        const router = makeRouter()
        await runGuard(svc, router, makeSegments('lobby'))
        expect(svc.setPendingJoinUrl).toHaveBeenCalledWith('/join')
      })

      it('redirects to /onboarding after stashing', async () => {
        const svc = makeDisplayNameService(null)
        const router = makeRouter()
        const result = await runGuard(svc, router, makeSegments('lobby', 'ABCDEF'))
        expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
        expect(result).toEqual({ _commands: ['/onboarding'] })
      })
    })

    describe('/estimating/:code cold-start', () => {
      it('rewrites to /join?code=CODE and stashes it', async () => {
        const svc = makeDisplayNameService(null)
        const router = makeRouter()
        await runGuard(svc, router, makeSegments('estimating', 'XYZABC'))
        expect(svc.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=XYZABC')
      })

      it('falls back to /join when estimating segment has no code', async () => {
        const svc = makeDisplayNameService(null)
        const router = makeRouter()
        await runGuard(svc, router, makeSegments('estimating'))
        expect(svc.setPendingJoinUrl).toHaveBeenCalledWith('/join')
      })

      it('URL-encodes the room code in the rewritten URL', async () => {
        const svc = makeDisplayNameService(null)
        const router = makeRouter()
        await runGuard(svc, router, makeSegments('estimating', 'AB CD'))
        expect(svc.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=AB%20CD')
      })
    })
  })
})
