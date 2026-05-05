/**
 * Unit tests for displayNameGuard (ux.md §2 / §3).
 *
 * Tests:
 * - Returns true when a display name is already persisted
 * - Returns UrlTree[/onboarding] when no display name (generic segment)
 * - /join segment: captures navigation URL via getCurrentNavigation(),
 *   falls back to '/join', then redirects to /onboarding
 * - /lobby segment: rewrites URL to /join?code=CODE, redirects to /onboarding
 * - /estimating segment: same rewrite as /lobby
 * - /lobby segment with no code: falls back to /join
 *
 * Uses Angular TestBed.runInInjectionContext so the guard's inject()
 * calls resolve against mocked providers without a router fixture.
 */

import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UrlSegment } from '@angular/router'

vi.mock('@ionic/angular/standalone', () => ({}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}))

import { displayNameGuard } from './display-name.guard'
import { DisplayNameService } from './display-name.service'

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
  const extractedUrl = navUrl !== null ? { toString: () => navUrl } : null
  return {
    createUrlTree: vi.fn((_cmds: unknown[]) => ({ _tree: '/onboarding' })),
    getCurrentNavigation: vi.fn(() =>
      navUrl !== null ? { extractedUrl, finalUrl: null } : null,
    ),
  }
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let displayNameSvc: ReturnType<typeof makeDisplayNameService>
let router: ReturnType<typeof makeRouter>

function setup(name: string | null = null, navUrl: string | null = null) {
  displayNameSvc = makeDisplayNameService(name)
  router = makeRouter(navUrl)
  TestBed.configureTestingModule({
    providers: [
      { provide: DisplayNameService, useValue: displayNameSvc },
      { provide: Router, useValue: router },
    ],
  })
}

async function runGuard(segments: UrlSegment[]): Promise<unknown> {
  return TestBed.runInInjectionContext(() =>
    displayNameGuard({} as never, segments),
  )
}

afterEach(() => TestBed.resetTestingModule())

// ---------------------------------------------------------------------------
// Tests — display name already set
// ---------------------------------------------------------------------------

describe('displayNameGuard — name already persisted', () => {
  beforeEach(() => setup('Alice'))

  it('returns true when display name is non-empty', async () => {
    const result = await runGuard([seg('home')])
    expect(result).toBe(true)
  })

  it('does not call setPendingJoinUrl when name exists', async () => {
    await runGuard([seg('join')])
    expect(displayNameSvc.setPendingJoinUrl).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests — no display name → generic redirect
// ---------------------------------------------------------------------------

describe('displayNameGuard — no display name, generic segment', () => {
  beforeEach(() => setup(null))

  it('redirects to /onboarding for an unrecognised segment', async () => {
    const result = await runGuard([seg('home')])
    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
    expect(result).toEqual({ _tree: '/onboarding' })
  })

  it('does not call setPendingJoinUrl for a generic segment', async () => {
    await runGuard([seg('settings')])
    expect(displayNameSvc.setPendingJoinUrl).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests — /join deep-link
// ---------------------------------------------------------------------------

describe('displayNameGuard — /join segment', () => {
  it('stores the extracted navigation URL and redirects to /onboarding', async () => {
    setup(null, '/join?code=ABC123')
    const result = await runGuard([seg('join')])
    expect(displayNameSvc.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=ABC123')
    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
    expect(result).toEqual({ _tree: '/onboarding' })
  })

  it('falls back to /join when getCurrentNavigation() returns null', async () => {
    setup(null, null)
    await runGuard([seg('join')])
    expect(displayNameSvc.setPendingJoinUrl).toHaveBeenCalledWith('/join')
  })
})

// ---------------------------------------------------------------------------
// Tests — /lobby segment
// ---------------------------------------------------------------------------

describe('displayNameGuard — /lobby segment', () => {
  beforeEach(() => setup(null))

  it('rewrites URL to /join?code=CODE when code segment is present', async () => {
    await runGuard([seg('lobby'), seg('ABC123')])
    expect(displayNameSvc.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=ABC123')
    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
  })

  it('falls back to /join when no code segment is present', async () => {
    await runGuard([seg('lobby')])
    expect(displayNameSvc.setPendingJoinUrl).toHaveBeenCalledWith('/join')
  })
})

// ---------------------------------------------------------------------------
// Tests — /estimating segment
// ---------------------------------------------------------------------------

describe('displayNameGuard — /estimating segment', () => {
  beforeEach(() => setup(null))

  it('rewrites URL to /join?code=CODE when code segment is present', async () => {
    await runGuard([seg('estimating'), seg('DEF456')])
    expect(displayNameSvc.setPendingJoinUrl).toHaveBeenCalledWith('/join?code=DEF456')
    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
  })

  it('falls back to /join when no code segment is present', async () => {
    await runGuard([seg('estimating')])
    expect(displayNameSvc.setPendingJoinUrl).toHaveBeenCalledWith('/join')
  })
})

// ---------------------------------------------------------------------------
// Tests — whitespace-only name treated as absent
// ---------------------------------------------------------------------------

describe('displayNameGuard — whitespace-only name', () => {
  it('treats a whitespace-only display name as absent and redirects', async () => {
    setup('   ')
    const result = await runGuard([seg('home')])
    expect(result).not.toBe(true)
    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding'])
  })
})
