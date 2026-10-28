/**
 * Tests for agenda command handlers and the agendaItemLabel helper.
 *
 * Handler tests exercise the command flow — wait for the room's state, act
 * through the session commands, tear down — against a session over a local
 * doc (`openSession` is replaced; the live session itself is `@hnch/shared`'s
 * and tested there).
 *
 * Covers:
 *  - agendaItemLabel formatting for all states
 *  - the flow: first sync, the fallback for a relay that never answers, teardown
 *  - handleAgendaAdd: at-least-one validation, successful add
 *  - handleAgendaList: empty list, populated list output
 *  - handleAgendaSkip / handleAgendaCancel: happy path + not-found error
 *  - handleAgendaMv: happy path
 */

import * as Y from 'yjs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { bindSessionCommands, FIBONACCI_SCALE, initDoc, projectDoc } from '@hnch/shared';
import type { AgendaItem } from '@hnch/shared';
import type { SessionHandle } from '../session.js';

// ---------------------------------------------------------------------------
// agendaItemLabel unit tests (no mocking needed)
// ---------------------------------------------------------------------------

import { agendaItemLabel } from './agenda.js';

function makeItem(overrides: Partial<AgendaItem>): AgendaItem {
  return {
    id: 'item-1',
    state: 'pending',
    source: 'manual',
    sortKey: 'a0',
    createdAt: 0,
    ...overrides,
  };
}

describe('agendaItemLabel', () => {
  it('pending with title only → "• Title"', () => {
    expect(agendaItemLabel(makeItem({ title: 'Auth redesign' }))).toBe('• Auth redesign');
  });

  it('pending with ticket only → "• [PROJ-1]"', () => {
    expect(agendaItemLabel(makeItem({ ticketId: 'PROJ-1' }))).toBe('• [PROJ-1]');
  });

  it('pending with both → "• [PROJ-1] Title"', () => {
    expect(agendaItemLabel(makeItem({ title: 'Auth', ticketId: 'PROJ-1' }))).toBe(
      '• [PROJ-1] Auth',
    );
  });

  it('consumed → "✓ ..."', () => {
    expect(agendaItemLabel(makeItem({ state: 'consumed', title: 'Done' }))).toBe('✓ Done');
  });

  it('skipped → "~ ..."', () => {
    expect(agendaItemLabel(makeItem({ state: 'skipped', title: 'Skip' }))).toBe('~ Skip');
  });

  it('cancelled → "✗ ..."', () => {
    expect(agendaItemLabel(makeItem({ state: 'cancelled', title: 'Nope' }))).toBe('✗ Nope');
  });

  it('no title or ticket → falls back to id', () => {
    expect(agendaItemLabel(makeItem({ id: 'abc-123' }))).toBe('• abc-123');
  });

  it('unknown state → "? ..."', () => {
    expect(
      agendaItemLabel(makeItem({ state: 'future-state' as AgendaItem['state'], title: 'X' })),
    ).toBe('? X');
  });
});

// ---------------------------------------------------------------------------
// Handler integration tests — uses real Y.Doc, mocks relay/config/session
// ---------------------------------------------------------------------------

const MOCK_CONFIG = {
  participantId: 'user-1',
  displayName: 'Test User',
  relayUrl: 'http://localhost:1234',
};

const MOCK_CACHE = {
  roomCode: 'ABC123',
  roomUuid: 'uuid-001',
  lastSeenAt: Date.now(),
};

const MOCK_CACHE_WITH_PASSWORD = {
  ...MOCK_CACHE,
  passwordHash: 'hash-abc',
};

/** The doc behind the session the last handler opened. */
let _lastSeenDoc: Y.Doc = new Y.Doc();

/**
 * When set, the session the handler opens already holds one agenda item with
 * this id, so handlers given the same id can find it.
 */
let preSeedItemId: string | null = null;

/** Resolves the first sync of the session the handler opens. */
let completeFirstSync: () => void = () => {};
/** Whether the session's first sync completes on its own, as a reachable relay's does. */
let firstSyncArrives = true;

const teardown = vi.fn();

vi.mock('../config.js', () => ({
  loadConfig: async () => MOCK_CONFIG,
  readConfig: () => MOCK_CONFIG,
}));

type MockEntry = typeof MOCK_CACHE | typeof MOCK_CACHE_WITH_PASSWORD;
const mockReadEntries = vi.fn(() => [MOCK_CACHE] as MockEntry[]);

vi.mock('../last-session.js', () => ({
  readEntries: () => mockReadEntries(),
}));

// `resolveRoom` now lives in `@hnch/shared`; stub just that one export and
// leave the rest of the barrel real — these handlers use it heavily.
vi.mock('@hnch/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hnch/shared')>()),
  resolveRoom: async () => ({ uuid: 'uuid-001', accessMode: 'open' }),
}));

/**
 * A session over a local doc: the real command set bound to it, the real
 * projection of it, a first sync the test controls. What the handler does
 * through the handle lands in `_lastSeenDoc`.
 */
function fakeSession(): SessionHandle {
  const doc = new Y.Doc();
  _lastSeenDoc = doc;
  initDoc(doc, {
    roomUuid: 'uuid-001',
    createdAt: Date.now(),
    participantId: 'user-1',
    displayName: 'Test User',
    defaultScale: FIBONACCI_SCALE,
  });
  if (preSeedItemId !== null && preSeedItemId !== '') {
    const agendaArr = doc.getArray<Y.Map<unknown>>('agenda');
    const item = new Y.Map<unknown>();
    item.set('id', preSeedItemId);
    item.set('state', 'pending');
    item.set('source', 'manual');
    item.set('sortKey', 'a0');
    item.set('createdAt', 1);
    item.set('title', 'Pre-seeded item');
    agendaArr.push([item]);
  }

  let joined = false;
  const firstSync = new Promise<void>((resolve) => {
    completeFirstSync = () => {
      joined = true;
      resolve();
    };
  });
  if (firstSyncArrives) completeFirstSync();

  return {
    roomCode: 'ABC123',
    roomUuid: 'uuid-001',
    passwordHash: undefined,
    commands: bindSessionCommands({
      doc,
      participantId: 'user-1',
      onlineIds: () => new Set(['user-1']),
    }),
    projection: () => projectDoc(doc),
    current: () => null,
    isHost: () => true,
    hasJoined: () => joined,
    whenJoined: () => firstSync,
    onlineIds: () => new Set(['user-1']),
    updateRoundDescriptor: vi.fn(),
    updateName: vi.fn(),
    updateScale: vi.fn(),
    updateAccess: vi.fn(),
    onChange: () => () => {},
    onStatusChange: () => () => {},
    onSessionEvent: () => () => {},
    flushUpdates: () => Promise.resolve(),
    teardown,
  };
}

const openSessionMock = vi.fn(() => fakeSession());

vi.mock('../session.js', async () => {
  const actual = await vi.importActual<typeof import('../session.js')>('../session.js');
  return { ...actual, openSession: (...args: unknown[]) => openSessionMock(...(args as [])) };
});

beforeEach(() => {
  _lastSeenDoc = new Y.Doc();
  preSeedItemId = null;
  firstSyncArrives = true;
  mockReadEntries.mockReturnValue([MOCK_CACHE]);
});

afterEach(() => {
  vi.useRealTimers();
  // Spies on process.exit and the console must not outlive their test.
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function titles(): Array<string | undefined> {
  return projectDoc(_lastSeenDoc).agenda.map((item) => item.title);
}

// ---------------------------------------------------------------------------
// The command flow
// ---------------------------------------------------------------------------

describe('agenda command flow', () => {
  it('joins the remembered room with its hash, like any join', async () => {
    mockReadEntries.mockReturnValue([MOCK_CACHE_WITH_PASSWORD]);
    const { handleAgendaList } = await import('./agenda.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleAgendaList();

    expect(openSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        participantId: 'user-1',
        roomCode: 'ABC123',
        roomUuid: 'uuid-001',
        passwordHash: 'hash-abc',
      }),
    );
  });

  it('acts once the first sync has arrived, not before', async () => {
    firstSyncArrives = false;
    const { handleAgendaAdd } = await import('./agenda.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const done = handleAgendaAdd({ title: 'After the sync' });
    await vi.waitFor(() => expect(openSessionMock).toHaveBeenCalled());
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(titles()).toEqual([]);

    completeFirstSync();
    await done;

    expect(titles()).toEqual(['After the sync']);
  });

  it('acts after the fallback when the relay never answers', async () => {
    vi.useFakeTimers();
    firstSyncArrives = false;
    const { FIRST_SYNC_FALLBACK_MS, handleAgendaAdd } = await import('./agenda.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const done = handleAgendaAdd({ title: 'Regardless' });
    await vi.advanceTimersByTimeAsync(FIRST_SYNC_FALLBACK_MS - 1);
    expect(titles()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    await done;

    expect(titles()).toEqual(['Regardless']);
  });

  it('tears the session down when done, and when refused', async () => {
    const { handleAgendaAdd, handleAgendaSkip } = await import('./agenda.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    await handleAgendaAdd({ title: 'Done' });
    expect(teardown).toHaveBeenCalledTimes(1);

    await expect(handleAgendaSkip({ id: 'does-not-exist' })).rejects.toThrow('process.exit called');
    expect(teardown).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// handleAgendaAdd
// ---------------------------------------------------------------------------

describe('handleAgendaAdd', () => {
  it('exits 1 when neither --title nor --ticket provided', async () => {
    const { handleAgendaAdd } = await import('./agenda.js');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(handleAgendaAdd({})).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('exits 1 when no session cache (no last session)', async () => {
    mockReadEntries.mockReturnValue([]);
    const { handleAgendaAdd } = await import('./agenda.js');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(handleAgendaAdd({ title: 'X' })).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('appends an item and logs confirmation when title provided', async () => {
    const { handleAgendaAdd } = await import('./agenda.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleAgendaAdd({ title: 'My Story' });

    expect(logSpy.mock.calls.some((c) => String(c[0]).startsWith('Added agenda item:'))).toBe(true);
    logSpy.mockRestore();
  });

  it('appends an item and logs confirmation when ticket provided', async () => {
    const { handleAgendaAdd } = await import('./agenda.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleAgendaAdd({ ticket: 'PROJ-99' });

    expect(logSpy.mock.calls.some((c) => String(c[0]).startsWith('Added agenda item:'))).toBe(true);
    logSpy.mockRestore();
  });

  it('works with passwordHash in session cache (hits the passwordHash branch)', async () => {
    mockReadEntries.mockReturnValue([MOCK_CACHE_WITH_PASSWORD]);
    const { handleAgendaAdd } = await import('./agenda.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleAgendaAdd({ title: 'Auth story' });

    expect(logSpy.mock.calls.some((c) => String(c[0]).startsWith('Added agenda item:'))).toBe(true);
    logSpy.mockRestore();
  });

  // Doc-state assertions: verify the Y.Doc was actually mutated (not just that a
  // log message was emitted). These fail if appendAgendaItem is removed from the handler.
  it('actually writes the agenda item to the Y.Doc (title path)', async () => {
    const { handleAgendaAdd } = await import('./agenda.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleAgendaAdd({ title: 'Doc-verified title story' });
    logSpy.mockRestore();

    const state = projectDoc(_lastSeenDoc);
    expect(state.agenda.some((i) => i.title === 'Doc-verified title story')).toBe(true);
  });

  it('actually writes the agenda item to the Y.Doc (ticketId path)', async () => {
    const { handleAgendaAdd } = await import('./agenda.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleAgendaAdd({ ticket: 'DOC-999' });
    logSpy.mockRestore();

    const state = projectDoc(_lastSeenDoc);
    expect(state.agenda.some((i) => i.ticketId === 'DOC-999')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleAgendaList
// ---------------------------------------------------------------------------

describe('handleAgendaList', () => {
  it('prints "No agenda items." when agenda is empty', async () => {
    const { handleAgendaList } = await import('./agenda.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleAgendaList();

    expect(logSpy).toHaveBeenCalledWith('No agenda items.');
    logSpy.mockRestore();
  });

  it('prints ordered list when doc is pre-seeded via wireSession mock', async () => {
    preSeedItemId = 'list-test-seed-id'; // triggers seeding with this fixed id
    const { handleAgendaList } = await import('./agenda.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleAgendaList();

    const output = logSpy.mock.calls.map((c) => String(c[0]));
    // The pre-seeded item "Pre-seeded item" should appear in output
    expect(output.some((l) => l.includes('Pre-seeded item'))).toBe(true);
    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// handleAgendaSkip
// ---------------------------------------------------------------------------

describe('handleAgendaSkip', () => {
  it('exits 1 and logs error for unknown item id', async () => {
    const { handleAgendaSkip } = await import('./agenda.js');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    await expect(handleAgendaSkip({ id: 'does-not-exist' })).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('logs skip confirmation when doc is pre-seeded with a known id', async () => {
    const knownId = 'test-skip-item-id';
    preSeedItemId = knownId;
    const { handleAgendaSkip } = await import('./agenda.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleAgendaSkip({ id: knownId });

    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('Skipped'))).toBe(true);
    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// handleAgendaCancel
// ---------------------------------------------------------------------------

describe('handleAgendaCancel', () => {
  it('exits 1 and logs error for unknown item id', async () => {
    const { handleAgendaCancel } = await import('./agenda.js');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    await expect(handleAgendaCancel({ id: 'does-not-exist' })).rejects.toThrow(
      'process.exit called',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('logs cancel confirmation when doc is pre-seeded with a known id', async () => {
    const knownId = 'test-cancel-item-id';
    preSeedItemId = knownId;
    const { handleAgendaCancel } = await import('./agenda.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleAgendaCancel({ id: knownId });

    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('Cancelled'))).toBe(true);
    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// handleAgendaMv
// ---------------------------------------------------------------------------

describe('handleAgendaMv', () => {
  it('exits 1 for unknown item id', async () => {
    const { handleAgendaMv } = await import('./agenda.js');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    await expect(handleAgendaMv({ id: 'does-not-exist' })).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('logs reorder confirmation when doc is pre-seeded with a known id', async () => {
    const knownId = 'test-mv-item-id';
    preSeedItemId = knownId;
    const { handleAgendaMv } = await import('./agenda.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleAgendaMv({ id: knownId });

    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('Reordered'))).toBe(true);
    logSpy.mockRestore();
  });
});
