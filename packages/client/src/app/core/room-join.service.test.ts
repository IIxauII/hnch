/**
 * Unit tests for the pure `rejoinRoom` function in RoomJoinService.
 *
 * Tests via the exported pure fn — no Angular DI, no TestBed.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted)
// ---------------------------------------------------------------------------

vi.mock('@ionic/angular/standalone', () => ({}));

const mockResolveRoom = vi.fn();
// `resolveRoom` and `RelayRejectionError` come from `@hnch/shared`; stub just
// those two and leave the rest of the barrel real.
vi.mock('@hnch/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hnch/shared')>()),
  resolveRoom: (...args: unknown[]) => mockResolveRoom(...args),
}));

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

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn().mockImplementation(() => ({
    whenSynced: Promise.resolve(),
    destroy: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDocService(
  overrides: { syncStatus?: string; lastRejection?: string | null; roomCode?: string | null } = {},
) {
  return {
    hasSession: vi.fn().mockReturnValue(false),
    roomCode: vi.fn().mockReturnValue(overrides.roomCode ?? 'ABC123'),
    meta: vi.fn().mockReturnValue({ roomUuid: 'uuid-test' }),
    syncStatus: vi.fn().mockReturnValue(overrides.syncStatus ?? 'offline'),
    lastRejection: vi.fn().mockReturnValue(overrides.lastRejection ?? null),
    endSession: vi.fn(),
    joinSession: vi.fn(),
    connect: vi.fn(),
  };
}

function makeLastSessionService() {
  return {
    record: vi.fn().mockResolvedValue(),
    clear: vi.fn().mockResolvedValue(),
    get: vi.fn().mockResolvedValue(null),
  };
}

type RejoinDepsOverrides = {
  syncStatus?: string;
  lastRejection?: string | null;
  roomCode?: string | null;
  resolveResult?: unknown;
  resolveError?: unknown;
  waitOutcome?: string;
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('rejoinRoom', () => {
  let RelayRejectionError: typeof import('@hnch/shared').RelayRejectionError;

  beforeEach(async () => {
    vi.resetAllMocks();
    const api = await import('@hnch/shared');
    RelayRejectionError = api.RelayRejectionError;
  });

  async function buildDeps(overrides: RejoinDepsOverrides = {}) {
    const { rejoinRoom } = await import('./room-join.service');

    const docService = makeDocService({
      syncStatus: overrides.syncStatus ?? 'connected',
      lastRejection: overrides.lastRejection ?? null,
      roomCode: overrides.roomCode ?? 'ABC123',
    });
    const lastSessionService = makeLastSessionService();
    const waitForJoinOutcome = vi.fn().mockResolvedValue(overrides.waitOutcome ?? 'connected');

    const deps = {
      relayHttpUrl: 'http://relay.test',
      getDisplayName: async () => 'Test User',
      getParticipantId: async () => 'pid-test',
      getAvatarColor: () => null,
      docService,
      waitForJoinOutcome,
    };

    if (overrides.resolveError !== undefined) {
      mockResolveRoom.mockRejectedValue(overrides.resolveError);
    } else {
      mockResolveRoom.mockResolvedValue(
        overrides.resolveResult ?? { uuid: 'uuid-resolved', accessMode: 'open' },
      );
    }

    return { rejoinRoom, deps, docService, lastSessionService, waitForJoinOutcome };
  }

  it('returns unknown-room when relay throws RelayRejectionError(unknown-room)', async () => {
    const { rejoinRoom, deps } = await buildDeps({
      resolveError: new RelayRejectionError('unknown-room'),
    });

    const result = await rejoinRoom('ABC123', deps);
    expect(result.type).toBe('unknown-room');
  });

  it('returns network-error on non-RelayRejectionError resolve failure', async () => {
    const { rejoinRoom, deps } = await buildDeps({
      resolveError: new Error('fetch failed'),
    });

    const result = await rejoinRoom('ABC123', deps);
    expect(result.type).toBe('network-error');
  });

  it('returns password-required when accessMode is password', async () => {
    const { rejoinRoom, deps } = await buildDeps({
      resolveResult: { uuid: 'uuid-pw', accessMode: 'password' },
    });

    const result = await rejoinRoom('ABC123', deps);
    expect(result.type).toBe('password-required');
    if (result.type === 'password-required') {
      expect(result.roomCode).toBe('ABC123');
    }
  });

  it('joins session (not createSession) and connects on open room', async () => {
    const { rejoinRoom, deps, docService, lastSessionService } = await buildDeps({
      resolveResult: { uuid: 'uuid-open', accessMode: 'open' },
      waitOutcome: 'connected',
    });

    const result = await rejoinRoom('ABC123', deps);

    expect(result.type).toBe('connected');
    expect(docService.endSession).toHaveBeenCalled();
    // Must use joinSession (not createSession) to avoid host-attribution race
    expect(docService.joinSession).toHaveBeenCalledWith(
      expect.objectContaining({ roomCode: 'ABC123' }),
    );
    // roomUuid must be passed to connect via opts, not via session init
    expect(docService.connect).toHaveBeenCalledWith(
      expect.objectContaining({ roomCode: 'ABC123' }),
      expect.objectContaining({ roomUuid: 'uuid-open' }),
    );
    // Cache write is now the component effect's responsibility, not rejoinRoom's
    expect(lastSessionService.record).not.toHaveBeenCalled();
  });

  it('returns timeout outcome when waitForJoinOutcome times out', async () => {
    const { rejoinRoom, deps } = await buildDeps({
      resolveResult: { uuid: 'uuid-open', accessMode: 'open' },
      waitOutcome: 'timeout',
    });

    const result = await rejoinRoom('ABC123', deps);
    expect(result.type).toBe('timeout');
  });

  it('returns rejected with reason on WS rejection', async () => {
    const { rejoinRoom, deps } = await buildDeps({
      resolveResult: { uuid: 'uuid-open', accessMode: 'open' },
      waitOutcome: 'wrong-password',
    });

    const result = await rejoinRoom('ABC123', deps);
    expect(result.type).toBe('rejected');
    if (result.type === 'rejected') {
      expect(result.reason).toBe('wrong-password');
    }
  });

  it('bypasses password-required when passwordHash opt provided and passes it to connect', async () => {
    const { rejoinRoom, deps, docService } = await buildDeps({
      resolveResult: { uuid: 'uuid-pw', accessMode: 'password' },
      waitOutcome: 'connected',
    });

    const result = await rejoinRoom('ABC123', deps, { passwordHash: 'cached-hash' });

    expect(result.type).toBe('connected');
    expect(docService.connect).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: 'cached-hash' }),
      expect.objectContaining({ roomUuid: 'uuid-pw' }),
    );
  });

  it('normalizes room code before resolve call', async () => {
    const { rejoinRoom, deps } = await buildDeps({
      resolveResult: { uuid: 'uuid-open', accessMode: 'open' },
      waitOutcome: 'connected',
    });

    await rejoinRoom('abc-123', deps);

    // normalizeRoomCode('abc-123') → 'ABC123'
    expect(mockResolveRoom).toHaveBeenCalledWith(expect.any(String), 'ABC123');
  });

  it('does not record cache on timeout', async () => {
    const { rejoinRoom, deps, lastSessionService } = await buildDeps({
      resolveResult: { uuid: 'uuid-open', accessMode: 'open' },
      waitOutcome: 'timeout',
    });

    await rejoinRoom('ABC123', deps);
    expect(lastSessionService.record).not.toHaveBeenCalled();
  });

  it('passes roomUuid to connect opts, not to joinSession', async () => {
    const { rejoinRoom, deps, docService } = await buildDeps({
      resolveResult: { uuid: 'uuid-open', accessMode: 'open' },
      waitOutcome: 'connected',
    });

    await rejoinRoom('ABC123', deps);

    // joinSession should NOT receive roomUuid (host-attribution invariant)
    expect(docService.joinSession).not.toHaveBeenCalledWith(
      expect.objectContaining({ roomUuid: expect.anything() }),
    );
    // connect receives roomUuid in the opts (second arg)
    expect(docService.connect).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ roomUuid: 'uuid-open' }),
    );
  });
});

// ---------------------------------------------------------------------------
// dedupRejoin
// ---------------------------------------------------------------------------

describe('dedupRejoin', () => {
  it('(a) two concurrent calls return the same Promise reference and factory invoked once', async () => {
    const { dedupRejoin } = await import('./room-join.service');

    let resolveInner!: (v: import('./room-join.service').RejoinOutcome) => void;
    const innerPromise = new Promise<import('./room-join.service').RejoinOutcome>((res) => {
      resolveInner = res;
    });
    const factory = vi.fn(() => innerPromise);

    const inFlight = new Map<string, Promise<import('./room-join.service').RejoinOutcome>>();

    const p1 = dedupRejoin(inFlight, 'ABC123', factory);
    const p2 = dedupRejoin(inFlight, 'ABC123', factory);

    // Same Promise reference — no second factory call
    expect(p1).toBe(p2);
    expect(factory).toHaveBeenCalledTimes(1);

    resolveInner({ type: 'connected', roomCode: 'ABC123', roomUuid: 'uuid-1', accessMode: 'open' });
    await p1;
  });

  it('(b) map cleared after underlying promise rejects; third call starts fresh', async () => {
    const { dedupRejoin } = await import('./room-join.service');

    const inFlight = new Map<string, Promise<import('./room-join.service').RejoinOutcome>>();

    const error = new Error('relay down');
    const factory1 = vi.fn(() => Promise.reject(error));

    // First call — rejects
    await dedupRejoin(inFlight, 'ABC123', factory1).catch(() => {
      /* expected */
    });

    // Map must be empty after rejection settles
    expect(inFlight.size).toBe(0);

    // Third call (after rejection) uses a fresh factory
    const factory2 = vi.fn(() =>
      Promise.resolve<import('./room-join.service').RejoinOutcome>({ type: 'network-error' }),
    );
    const p3 = dedupRejoin(inFlight, 'ABC123', factory2);
    expect(factory2).toHaveBeenCalledTimes(1);
    await p3;
  });

  it('(c) map cleared after success; subsequent call starts fresh', async () => {
    const { dedupRejoin } = await import('./room-join.service');

    const inFlight = new Map<string, Promise<import('./room-join.service').RejoinOutcome>>();

    const result: import('./room-join.service').RejoinOutcome = {
      type: 'connected',
      roomCode: 'ABC123',
      roomUuid: 'uuid-1',
      accessMode: 'open',
    };
    const factory1 = vi.fn(() => Promise.resolve(result));

    await dedupRejoin(inFlight, 'ABC123', factory1);

    // Map must be empty after success settles
    expect(inFlight.size).toBe(0);

    // Subsequent call uses a new factory
    const factory2 = vi.fn(() =>
      Promise.resolve<import('./room-join.service').RejoinOutcome>({ type: 'unknown-room' }),
    );
    await dedupRejoin(inFlight, 'ABC123', factory2);
    expect(factory2).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// assertRoomCode
// ---------------------------------------------------------------------------

describe('assertRoomCode', () => {
  it('does not throw when code is non-null', async () => {
    const { assertRoomCode } = await import('./room-join.service');
    expect(() => assertRoomCode('ABC123', 'test')).not.toThrow();
  });

  it('throws with descriptive message when code is null', async () => {
    const { assertRoomCode } = await import('./room-join.service');
    expect(() => assertRoomCode(null, 'lobby.softExit')).toThrow(
      'lobby.softExit: docService.roomCode() is null — no active session',
    );
  });
});
