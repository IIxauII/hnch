/**
 * Unit tests for sessionResumeGuardLogic.
 *
 * Tests via the pure exported fn — no Angular DI, no TestBed.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { UrlSegment } from '@angular/router'

vi.mock('@ionic/angular/standalone', () => ({}))

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegments(screen: string, code?: string): UrlSegment[] {
  const seg0 = { path: screen } as UrlSegment
  if (code) {
    const seg1 = { path: code } as UrlSegment
    return [seg0, seg1]
  }
  return [seg0]
}

function makeRouter() {
  return {
    createUrlTree: vi.fn((path: string[], opts?: unknown) => ({ path, opts })),
  }
}

function makeDocService(hasSession = false, roomCode: string | null = null) {
  return {
    hasSession: () => hasSession,
    roomCode: () => roomCode,
  }
}

function makeLastSessionService() {
  return {
    clear: vi.fn().mockResolvedValue(undefined),
  }
}

function makeRoomJoinService(outcome: unknown) {
  return {
    rejoin: vi.fn<[string], Promise<unknown>>().mockResolvedValue(outcome),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessionResumeGuardLogic', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns true (fast path) when session active and code matches', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard')

    const router = makeRouter()
    const docService = makeDocService(true, 'ABCDEF')
    const lastSessionService = makeLastSessionService()
    const roomJoinService = makeRoomJoinService({ type: 'connected', roomCode: 'ABCDEF', roomUuid: 'u1', accessMode: 'open' })

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    )

    expect(result).toBe(true)
    expect(roomJoinService.rejoin).not.toHaveBeenCalled()
  })

  it('redirects to /home when no code segment', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard')

    const router = makeRouter()
    const docService = makeDocService(false, null)
    const lastSessionService = makeLastSessionService()
    const roomJoinService = makeRoomJoinService(null)

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby'),
    )

    expect(router.createUrlTree).toHaveBeenCalledWith(['/home'])
    expect(result).toEqual({ path: ['/home'], opts: undefined })
  })

  it('returns true on connected rejoin', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard')

    const router = makeRouter()
    const docService = makeDocService(false, null)
    const lastSessionService = makeLastSessionService()
    const roomJoinService = makeRoomJoinService({
      type: 'connected',
      roomCode: 'ABCDEF',
      roomUuid: 'u1',
      accessMode: 'open',
    })

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    )

    expect(result).toBe(true)
    expect(roomJoinService.rejoin).toHaveBeenCalledWith('ABCDEF')
  })

  it('returns true on timeout (benefit of doubt)', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard')

    const router = makeRouter()
    const docService = makeDocService(false, null)
    const lastSessionService = makeLastSessionService()
    const roomJoinService = makeRoomJoinService({ type: 'timeout' })

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    )

    expect(result).toBe(true)
  })

  it('redirects to /join?code= on password-required', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard')

    const router = makeRouter()
    const docService = makeDocService(false, null)
    const lastSessionService = makeLastSessionService()
    const roomJoinService = makeRoomJoinService({ type: 'password-required', roomCode: 'ABCDEF' })

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    )

    expect(router.createUrlTree).toHaveBeenCalledWith(
      ['/join'],
      { queryParams: { code: 'ABCDEF' } },
    )
    expect(result).toEqual(expect.objectContaining({ path: ['/join'] }))
  })

  it('clears cache and redirects to /home on unknown-room', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard')

    const router = makeRouter()
    const docService = makeDocService(false, null)
    const lastSessionService = makeLastSessionService()
    const roomJoinService = makeRoomJoinService({ type: 'unknown-room' })

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'XYZ999'),
    )

    expect(lastSessionService.clear).toHaveBeenCalled()
    expect(router.createUrlTree).toHaveBeenCalledWith(['/home'])
    expect(result).toEqual(expect.objectContaining({ path: ['/home'] }))
  })

  it('clears cache and redirects to /home on rejected', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard')

    const router = makeRouter()
    const docService = makeDocService(false, null)
    const lastSessionService = makeLastSessionService()
    const roomJoinService = makeRoomJoinService({ type: 'rejected', reason: 'wrong-password' })

    await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    )

    expect(lastSessionService.clear).toHaveBeenCalled()
    expect(router.createUrlTree).toHaveBeenCalledWith(['/home'])
  })

  it('redirects to /home on network-error without clearing cache', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard')

    const router = makeRouter()
    const docService = makeDocService(false, null)
    const lastSessionService = makeLastSessionService()
    const roomJoinService = makeRoomJoinService({ type: 'network-error' })

    await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    )

    // network-error does NOT clear the cache so user can retry via banner
    expect(lastSessionService.clear).not.toHaveBeenCalled()
    expect(router.createUrlTree).toHaveBeenCalledWith(['/home'])
  })

  it('passes estimating screen to rejoin', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard')

    const router = makeRouter()
    const docService = makeDocService(false, null)
    const lastSessionService = makeLastSessionService()
    const roomJoinService = makeRoomJoinService({ type: 'connected', roomCode: 'ABCDEF', roomUuid: 'u1', accessMode: 'open' })

    await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('estimating', 'ABCDEF'),
    )

    expect(roomJoinService.rejoin).toHaveBeenCalledWith('ABCDEF')
  })

  it('redirects to /home without clearing cache when code is invalid', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard')

    const router = makeRouter()
    const docService = makeDocService(false, null)
    const lastSessionService = makeLastSessionService()
    const roomJoinService = makeRoomJoinService(null)

    // '!!!' normalizes to '!!!' which fails isValidRoomCode
    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', '!!!INVALID'),
    )

    expect(roomJoinService.rejoin).not.toHaveBeenCalled()
    expect(lastSessionService.clear).not.toHaveBeenCalled()
    expect(router.createUrlTree).toHaveBeenCalledWith(['/home'])
    expect(result).toEqual(expect.objectContaining({ path: ['/home'] }))
  })
})
