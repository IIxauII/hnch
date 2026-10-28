/**
 * Unit tests for sessionResumeGuardLogic.
 *
 * Tests via the pure exported fn — no Angular DI, no TestBed.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UrlSegment } from '@angular/router';

vi.mock('@ionic/angular/standalone', () => ({}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(),
    remove: vi.fn().mockResolvedValue(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegments(screen: string, code?: string): UrlSegment[] {
  const seg0 = { path: screen } as UrlSegment;
  if (code) {
    const seg1 = { path: code } as UrlSegment;
    return [seg0, seg1];
  }
  return [seg0];
}

function makeRouter() {
  return {
    createUrlTree: vi.fn((path: string[], opts?: unknown) => ({ path, opts })),
  };
}

function makeDocService(hasSession = false, roomCode: string | null = null) {
  return {
    hasSession: () => hasSession,
    roomCode: () => roomCode,
  };
}

/**
 * Returns a stub lastSessionService matching SessionResumeGuardDeps.
 * `entries` controls what `list()` returns (default empty — no cached hash).
 */
function makeLastSessionService(
  entries: Array<{
    roomUuid: string;
    roomCode: string;
    passwordHash?: string;
    lastScreen?: string;
  }> = [],
) {
  return {
    list: vi.fn().mockResolvedValue(entries),
    clearPasswordHash: vi.fn().mockResolvedValue(undefined),
    removeByUuid: vi.fn().mockResolvedValue(undefined),
    setPendingPasswordHash: vi.fn(),
  };
}

function makeRoomJoinService(outcome: unknown) {
  return {
    rejoin: vi
      .fn<[string, { passwordHash?: string }?], Promise<unknown>>()
      .mockResolvedValue(outcome),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessionResumeGuardLogic', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns true (fast path) when session active and code matches', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(true, 'ABCDEF');
    const lastSessionService = makeLastSessionService();
    const roomJoinService = makeRoomJoinService({
      type: 'connected',
      roomCode: 'ABCDEF',
      roomUuid: 'u1',
      accessMode: 'open',
    });

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    );

    expect(result).toBe(true);
    expect(roomJoinService.rejoin).not.toHaveBeenCalled();
  });

  it('redirects to /home when no code segment', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(false, null);
    const lastSessionService = makeLastSessionService();
    const roomJoinService = makeRoomJoinService(null);

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby'),
    );

    expect(router.createUrlTree).toHaveBeenCalledWith(['/home']);
    expect(result).toEqual({ path: ['/home'], opts: undefined });
  });

  it('returns true on connected rejoin (no cached hash)', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(false, null);
    const lastSessionService = makeLastSessionService();
    const roomJoinService = makeRoomJoinService({
      type: 'connected',
      roomCode: 'ABCDEF',
      roomUuid: 'u1',
      accessMode: 'open',
    });

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    );

    expect(result).toBe(true);
    expect(roomJoinService.rejoin).toHaveBeenCalledWith('ABCDEF', {});
  });

  it('returns true on connected rejoin and sets pending hash when cached hash exists', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(false, null);
    const lastSessionService = makeLastSessionService([
      { roomUuid: 'u1', roomCode: 'ABCDEF', passwordHash: 'stored-hash' },
    ]);
    const roomJoinService = makeRoomJoinService({
      type: 'connected',
      roomCode: 'ABCDEF',
      roomUuid: 'u1',
      accessMode: 'open',
    });

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    );

    expect(result).toBe(true);
    // With the hash, and with the UUID the device remembers the session by:
    // a code that has gone to another session since is not that session.
    expect(roomJoinService.rejoin).toHaveBeenCalledWith('ABCDEF', {
      passwordHash: 'stored-hash',
      expectedUuid: 'u1',
    });
    expect(lastSessionService.setPendingPasswordHash).toHaveBeenCalledWith('u1', 'stored-hash');
  });

  it('returns true on timeout (benefit of doubt)', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(false, null);
    const lastSessionService = makeLastSessionService();
    const roomJoinService = makeRoomJoinService({ type: 'timeout' });

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    );

    expect(result).toBe(true);
  });

  // The host had ended the session; it was torn down while this waited.
  it('redirects Home when the session went away under it, and leaves the cache alone', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(false, null);
    const lastSessionService = makeLastSessionService();
    const roomJoinService = makeRoomJoinService({ type: 'superseded' });

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    );

    expect(router.createUrlTree).toHaveBeenCalledWith(['/home']);
    expect(result).not.toBe(true);
    expect(lastSessionService.removeByUuid).not.toHaveBeenCalled();
    expect(lastSessionService.setPendingPasswordHash).not.toHaveBeenCalled();
  });

  it('redirects to /join?code= on password-required (no cached hash)', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(false, null);
    const lastSessionService = makeLastSessionService();
    const roomJoinService = makeRoomJoinService({ type: 'password-required', roomCode: 'ABCDEF' });

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    );

    expect(router.createUrlTree).toHaveBeenCalledWith(['/join'], {
      queryParams: { code: 'ABCDEF' },
    });
    expect(result).toEqual(expect.objectContaining({ path: ['/join'] }));
  });

  it('removeByUuid and redirects to /home on unknown-room with known entry', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(false, null);
    const lastSessionService = makeLastSessionService([{ roomUuid: 'u1', roomCode: 'XYZ999' }]);
    const roomJoinService = makeRoomJoinService({ type: 'unknown-room' });

    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'XYZ999'),
    );

    expect(lastSessionService.removeByUuid).toHaveBeenCalledWith('u1');
    expect(router.createUrlTree).toHaveBeenCalledWith(['/home']);
    expect(result).toEqual(expect.objectContaining({ path: ['/home'] }));
  });

  // The session that is gone is not among the ones remembered: the others
  // are not it, and stay.
  it('forgets nothing and redirects to /home on unknown-room with no matching entry', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(false, null);
    const lastSessionService = makeLastSessionService(); // no entries
    const roomJoinService = makeRoomJoinService({ type: 'unknown-room' });

    await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'XYZ999'),
    );

    expect(lastSessionService.removeByUuid).not.toHaveBeenCalled();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/home']);
  });

  it('wrong-password (4002): clearPasswordHash and redirect to /join?code=', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(false, null);
    const lastSessionService = makeLastSessionService([
      { roomUuid: 'u1', roomCode: 'ABCDEF', passwordHash: 'wrong' },
    ]);
    const roomJoinService = makeRoomJoinService({ type: 'rejected', reason: 'wrong-password' });

    await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    );

    expect(lastSessionService.clearPasswordHash).toHaveBeenCalledWith('u1');
    expect(router.createUrlTree).toHaveBeenCalledWith(['/join'], {
      queryParams: { code: 'ABCDEF' },
    });
  });

  it('other rejection: removeByUuid and redirect to /home', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(false, null);
    const lastSessionService = makeLastSessionService([{ roomUuid: 'u1', roomCode: 'ABCDEF' }]);
    const roomJoinService = makeRoomJoinService({ type: 'rejected', reason: 'room-full' });

    await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    );

    expect(lastSessionService.removeByUuid).toHaveBeenCalledWith('u1');
    expect(router.createUrlTree).toHaveBeenCalledWith(['/home']);
  });

  it('redirects to /home on network-error without removing cache', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(false, null);
    const lastSessionService = makeLastSessionService();
    const roomJoinService = makeRoomJoinService({ type: 'network-error' });

    await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', 'ABCDEF'),
    );

    // network-error does NOT clear the cache so user can retry via banner
    expect(lastSessionService.removeByUuid).not.toHaveBeenCalled();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/home']);
  });

  it('passes estimating screen to rejoin', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(false, null);
    const lastSessionService = makeLastSessionService();
    const roomJoinService = makeRoomJoinService({
      type: 'connected',
      roomCode: 'ABCDEF',
      roomUuid: 'u1',
      accessMode: 'open',
    });

    await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('estimating', 'ABCDEF'),
    );

    expect(roomJoinService.rejoin).toHaveBeenCalledWith('ABCDEF', {});
  });

  it('redirects to /home without clearing cache when code is invalid', async () => {
    const { sessionResumeGuardLogic } = await import('./session-resume.guard');

    const router = makeRouter();
    const docService = makeDocService(false, null);
    const lastSessionService = makeLastSessionService();
    const roomJoinService = makeRoomJoinService(null);

    // '!!!' normalizes to '!!!' which fails isValidRoomCode
    const result = await sessionResumeGuardLogic(
      { router, docService, lastSessionService, roomJoinService },
      makeSegments('lobby', '!!!INVALID'),
    );

    expect(roomJoinService.rejoin).not.toHaveBeenCalled();
    expect(lastSessionService.removeByUuid).not.toHaveBeenCalled();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/home']);
    expect(result).toEqual(expect.objectContaining({ path: ['/home'] }));
  });
});
