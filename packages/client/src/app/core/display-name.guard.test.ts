/**
 * Unit tests for displayNameGuard.
 *
 * The guard uses inject() so tests run inside TestBed.runInInjectionContext.
 * Real DI providers are replaced with vi.fn() stubs via useValue so no
 * Capacitor plugin calls escape into the jsdom environment.
 */

import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import type { UrlSegment } from '@angular/router'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { displayNameGuard } from './display-name.guard'
import { DisplayNameService } from './display-name.service'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}))

vi.mock('@ionic/angular/standalone', () => ({}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegments(...paths: string[]): UrlSegment[] {
  return paths.map((path) => ({ path } as UrlSegment))
}

function setupTestBed(opts: {
  displayName: string | null
  currentNavigation?: { extractedUrl?: { toString(): string }; finalUrl?: { toString(): string } } | null
}) {
  const displayNameService = {
    getDisplayName: vi.fn().mockResolvedValue(opts.displayName),
    setPendingJoinUrl: vi.fn().mockResolvedValue(undefined),
  }

  const router = {
    createUrlTree: vi.fn((commands: unknown[]) => ({ __tree: commands })),
    getCurrentNavigation: vi.fn().mockReturnValue(opts.currentNavigation ?? null),
  }

  TestBed.configureTestingModule({
    providers: [
      { provide: DisplayNameService, useValue: displayNameService },
      { provide: Router, useValue: router },
    ],
  })

  return { displayNameService, router }
}

async function runGuard(segments: UrlSegment[]): Promise<unknown> {
  return TestBed.runInInjectionContext(() => displayNameGuard({} as never, segments))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('displayNameGuard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // ── Happy path: display name already set ───────────────────────────────

  it('returns true when a display name is persisted', async () => {
    setupTestBed({ displayName: 'Alice' })
    const result = await runGuard(makeSegments('home'))
    expect(result).toBe(true)
  })

  it('returns true regardless of target route when display name is set', async () => {
    setupTestBed({ displayName: 'Bob' })
    const result = await runGuard(makeSegments('join'))
    expect(result).toBe(true)
  })

  // ── Whitespace-only display name treated as absent ──────────────────────

  it('redirects to onboarding when display name is whitespace-only', async () => {
    const { router } = setupTestBed({ displayName: '   ' })
    const result = await runGuard(makeSegments('home'))
    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
    expect(result).toEqual({ __tree: ['/onboarding'] })
  })

  // ── No display name: plain route ────────────────────────────────────────

  it('redirects to /onboarding for a generic route when no display name', async () => {
    const { router, displayNameService } = setupTestBed({ displayName: null })
    const result = await runGuard(makeSegments('home'))
    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
    expect(result).toEqual({ __tree: ['/onboarding'] })
    // No URL stashing for non-special routes
    expect(displayNameService.setPendingJoinUrl).not.toHaveBeenCalled()
  })

  it('redirects for empty segments array', async () => {
    const { router, displayNameService } = setupTestBed({ displayName: null })
    await runGuard([])
    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
    expect(displayNameService.setPendingJoinUrl).not.toHaveBeenCalled()
  })

  // ── No display name: /join deep-link ────────────────────────────────────

  it('stashes extracted URL and redirects when targeting /join with navigation', async () => {
    const { router, displayNameService } = setupTestBed({
      displayName: null,
      currentNavigation: {
        extractedUrl: { toString: () => '/join?code=ABC123' },
      },
    })
    await runGuard(makeSegments('join'))
    expect(displayNameService.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=ABC123')
    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
  })

  it('falls back to finalUrl when extractedUrl is absent on /join navigation', async () => {
    const { displayNameService } = setupTestBed({
      displayName: null,
      currentNavigation: {
        finalUrl: { toString: () => '/join?code=XYZ' },
      },
    })
    await runGuard(makeSegments('join'))
    expect(displayNameService.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=XYZ')
  })

  it('falls back to "/join" literal when getCurrentNavigation returns null for /join route', async () => {
    const { displayNameService } = setupTestBed({
      displayName: null,
      currentNavigation: null,
    })
    await runGuard(makeSegments('join'))
    expect(displayNameService.setPendingJoinUrl).toHaveBeenCalledWith('/join')
  })

  // ── No display name: /lobby/:code cold-start ────────────────────────────

  it('rewrites /lobby/:code to /join?code=CODE and stashes for onboarding', async () => {
    const { router, displayNameService } = setupTestBed({ displayName: null })
    await runGuard(makeSegments('lobby', 'ABCDEF'))
    expect(displayNameService.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=ABCDEF')
    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
  })

  it('falls back to /join when /lobby has no code segment', async () => {
    const { displayNameService } = setupTestBed({ displayName: null })
    await runGuard(makeSegments('lobby'))
    expect(displayNameService.setPendingJoinUrl).toHaveBeenCalledWith('/join')
  })

  // ── No display name: /estimating/:code cold-start ───────────────────────

  it('rewrites /estimating/:code to /join?code=CODE and stashes for onboarding', async () => {
    const { router, displayNameService } = setupTestBed({ displayName: null })
    await runGuard(makeSegments('estimating', 'ZZZZZZ'))
    expect(displayNameService.setPendingJoinUrl).toHaveBeenCalledWith(
      `/join?code=${encodeURIComponent('ZZZZZZ')}`,
    )
    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
  })

  it('falls back to /join when /estimating has no code segment', async () => {
    const { displayNameService } = setupTestBed({ displayName: null })
    await runGuard(makeSegments('estimating'))
    expect(displayNameService.setPendingJoinUrl).toHaveBeenCalledWith('/join')
  })

  // ── encodeURIComponent is applied to room codes ─────────────────────────

  it('URL-encodes the room code in the stashed join URL', async () => {
    const { displayNameService } = setupTestBed({ displayName: null })
    await runGuard(makeSegments('lobby', 'A B+C'))
    expect(displayNameService.setPendingJoinUrl).toHaveBeenCalledWith(
      `/join?code=${encodeURIComponent('A B+C')}`,
    )
  })
})
