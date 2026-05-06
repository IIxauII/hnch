/**
 * Unit tests for displayNameGuard.
 *
 * Uses TestBed.runInInjectionContext so inject() calls inside the
 * functional guard resolve from the configured providers rather than
 * requiring a full Angular router setup.
 */

import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import type { UrlSegment } from '@angular/router'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module-level mocks (Capacitor — needed transitively by DisplayNameService)
// ---------------------------------------------------------------------------

const mockPreferences = {
  get: vi.fn<(opts: { key: string }) => Promise<{ value: string | null }>>(),
  set: vi.fn<(opts: { key: string; value: string }) => Promise<void>>(),
  remove: vi.fn<(opts: { key: string }) => Promise<void>>(),
}

vi.mock('@capacitor/preferences', () => ({ Preferences: mockPreferences }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@ionic/angular/standalone', () => ({}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seg(path: string): UrlSegment {
  return { path } as UrlSegment
}

function makeDisplayNameService(name: string | null = null) {
  return {
    getDisplayName: vi.fn().mockResolvedValue(name),
    setPendingJoinUrl: vi.fn().mockResolvedValue(undefined),
  }
}

function makeRouter(navUrl: string | null = null) {
  const mockUrlTree = { toString: () => navUrl ?? '' }
  return {
    createUrlTree: vi.fn((cmds: string[]) => ({ commands: cmds })),
    getCurrentNavigation: vi.fn().mockReturnValue(
      navUrl ? { extractedUrl: mockUrlTree } : null,
    ),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('displayNameGuard', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns true when a non-empty display name is already stored', async () => {
    const displayNameSvc = makeDisplayNameService('Alice')
    const router = makeRouter()
    TestBed.configureTestingModule({
      providers: [
        { provide: 'DisplayNameService', useValue: displayNameSvc },
        { provide: Router, useValue: router },
      ],
    })
    // We provide the actual class token so inject(DisplayNameService) resolves
    const { DisplayNameService } = await import('./display-name.service')
    TestBed.overrideProvider(DisplayNameService, { useValue: displayNameSvc })

    const { displayNameGuard } = await import('./display-name.guard')

    const result = await TestBed.runInInjectionContext(() =>
      displayNameGuard({} as Parameters<typeof displayNameGuard>[0], []),
    )

    expect(result).toBe(true)
    expect(displayNameSvc.setPendingJoinUrl).not.toHaveBeenCalled()
  })

  it('redirects to /onboarding when display name is null', async () => {
    const displayNameSvc = makeDisplayNameService(null)
    const router = makeRouter()
    const { DisplayNameService } = await import('./display-name.service')
    TestBed.overrideProvider(DisplayNameService, { useValue: displayNameSvc })
    TestBed.overrideProvider(Router, { useValue: router })

    const { displayNameGuard } = await import('./display-name.guard')

    const result = await TestBed.runInInjectionContext(() =>
      displayNameGuard({} as Parameters<typeof displayNameGuard>[0], []),
    )

    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
    expect(result).toEqual({ commands: ['/onboarding'] })
  })

  it('redirects to /onboarding when display name is whitespace only', async () => {
    const displayNameSvc = makeDisplayNameService('   ')
    const router = makeRouter()
    const { DisplayNameService } = await import('./display-name.service')
    TestBed.overrideProvider(DisplayNameService, { useValue: displayNameSvc })
    TestBed.overrideProvider(Router, { useValue: router })

    const { displayNameGuard } = await import('./display-name.guard')

    const result = await TestBed.runInInjectionContext(() =>
      displayNameGuard({} as Parameters<typeof displayNameGuard>[0], []),
    )

    expect(result).toEqual({ commands: ['/onboarding'] })
    expect(displayNameSvc.setPendingJoinUrl).not.toHaveBeenCalled()
  })

  it('sets pending join URL from navigation when segment is "join"', async () => {
    const displayNameSvc = makeDisplayNameService(null)
    const router = makeRouter('/join?code=ABC123')
    const { DisplayNameService } = await import('./display-name.service')
    TestBed.overrideProvider(DisplayNameService, { useValue: displayNameSvc })
    TestBed.overrideProvider(Router, { useValue: router })

    const { displayNameGuard } = await import('./display-name.guard')

    await TestBed.runInInjectionContext(() =>
      displayNameGuard({} as Parameters<typeof displayNameGuard>[0], [seg('join')]),
    )

    expect(displayNameSvc.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=ABC123')
  })

  it('falls back to "/join" as pending URL when no active navigation for join segment', async () => {
    const displayNameSvc = makeDisplayNameService(null)
    const router = makeRouter(null) // no active navigation
    const { DisplayNameService } = await import('./display-name.service')
    TestBed.overrideProvider(DisplayNameService, { useValue: displayNameSvc })
    TestBed.overrideProvider(Router, { useValue: router })

    const { displayNameGuard } = await import('./display-name.guard')

    await TestBed.runInInjectionContext(() =>
      displayNameGuard({} as Parameters<typeof displayNameGuard>[0], [seg('join')]),
    )

    expect(displayNameSvc.setPendingJoinUrl).toHaveBeenCalledWith('/join')
  })

  it('rewrites /lobby/:code to /join?code=CODE as pending URL', async () => {
    const displayNameSvc = makeDisplayNameService(null)
    const router = makeRouter()
    const { DisplayNameService } = await import('./display-name.service')
    TestBed.overrideProvider(DisplayNameService, { useValue: displayNameSvc })
    TestBed.overrideProvider(Router, { useValue: router })

    const { displayNameGuard } = await import('./display-name.guard')

    await TestBed.runInInjectionContext(() =>
      displayNameGuard({} as Parameters<typeof displayNameGuard>[0], [seg('lobby'), seg('ABC123')]),
    )

    expect(displayNameSvc.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=ABC123')
  })

  it('rewrites /estimating/:code to /join?code=CODE as pending URL', async () => {
    const displayNameSvc = makeDisplayNameService(null)
    const router = makeRouter()
    const { DisplayNameService } = await import('./display-name.service')
    TestBed.overrideProvider(DisplayNameService, { useValue: displayNameSvc })
    TestBed.overrideProvider(Router, { useValue: router })

    const { displayNameGuard } = await import('./display-name.guard')

    await TestBed.runInInjectionContext(() =>
      displayNameGuard({} as Parameters<typeof displayNameGuard>[0], [seg('estimating'), seg('XYZ789')]),
    )

    expect(displayNameSvc.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=XYZ789')
  })

  it('rewrites /lobby without code segment to /join as pending URL', async () => {
    const displayNameSvc = makeDisplayNameService(null)
    const router = makeRouter()
    const { DisplayNameService } = await import('./display-name.service')
    TestBed.overrideProvider(DisplayNameService, { useValue: displayNameSvc })
    TestBed.overrideProvider(Router, { useValue: router })

    const { displayNameGuard } = await import('./display-name.guard')

    await TestBed.runInInjectionContext(() =>
      displayNameGuard({} as Parameters<typeof displayNameGuard>[0], [seg('lobby')]),
    )

    expect(displayNameSvc.setPendingJoinUrl).toHaveBeenCalledWith('/join')
  })

  it('does not set pending URL for unknown first segment', async () => {
    const displayNameSvc = makeDisplayNameService(null)
    const router = makeRouter()
    const { DisplayNameService } = await import('./display-name.service')
    TestBed.overrideProvider(DisplayNameService, { useValue: displayNameSvc })
    TestBed.overrideProvider(Router, { useValue: router })

    const { displayNameGuard } = await import('./display-name.guard')

    await TestBed.runInInjectionContext(() =>
      displayNameGuard({} as Parameters<typeof displayNameGuard>[0], [seg('home')]),
    )

    expect(displayNameSvc.setPendingJoinUrl).not.toHaveBeenCalled()
    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
  })
})
