/**
 * Tests for agenda command handlers and the agendaItemLabel helper.
 *
 * Handler tests exercise validation logic and the actual Yjs mutations using
 * a controlled Y.Doc that is shared between the test and the wireSession mock.
 *
 * Covers:
 *  - agendaItemLabel formatting for all states
 *  - handleAgendaAdd: at-least-one validation, successful add
 *  - handleAgendaList: empty list, populated list output
 *  - handleAgendaSkip / handleAgendaCancel: happy path + not-found error
 *  - handleAgendaMv: happy path
 */

import * as Y from 'yjs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { initDoc } from '@hnch/shared';
import type { AgendaItem } from '@hnch/shared';

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

/** Track the doc created by each handler call so mocks can initialise it. */
let _lastSeenDoc: Y.Doc = new Y.Doc();

/**
 * When set, wireSession mock will pre-populate the doc with one agenda item
 * using this id so handlers that receive the same id can find the item.
 */
let preSeedItemId: string | null = null;

vi.mock('../config.js', () => ({
  loadConfig: async () => MOCK_CONFIG,
  readConfig: () => MOCK_CONFIG,
}));

type MockEntry = typeof MOCK_CACHE | typeof MOCK_CACHE_WITH_PASSWORD;
const mockReadEntries = vi.fn(() => [MOCK_CACHE] as MockEntry[]);

vi.mock('../last-session.js', () => ({
  readEntries: () => mockReadEntries(),
}));

vi.mock('../relay-api.js', () => ({
  resolveRoom: async () => ({ uuid: 'uuid-001', accessMode: 'open' }),
}));

vi.mock('../session.js', async () => {
  const actual = await vi.importActual<typeof import('../session.js')>('../session.js');

  return {
    ...actual,
    wireSession: (opts: { doc: Y.Doc }) => {
      // Capture the doc that the handler created so we can initialise it
      _lastSeenDoc = opts.doc;
      initDoc(opts.doc, {
        roomUuid: 'uuid-001',
        createdAt: Date.now(),
        participantId: 'user-1',
        displayName: 'Test User',
      });

      // Optionally pre-seed an item with a FIXED known id so handlers can find it.
      // preSeedItemId holds the id to use; after seeding it still holds that id.
      if (preSeedItemId !== null && preSeedItemId !== '') {
        const knownId = preSeedItemId;
        const agendaArr = opts.doc.getArray<Y.Map<unknown>>('agenda');
        const item = new Y.Map<unknown>();
        item.set('id', knownId);
        item.set('state', 'pending');
        item.set('source', 'manual');
        item.set('sortKey', 'a0');
        item.set('createdAt', 1);
        item.set('title', 'Pre-seeded item');
        agendaArr.push([item]);
      }

      return {
        doc: opts.doc,
        awareness: { setLocalStateField: vi.fn() },
        roomCode: 'ABC123',
        roomUuid: 'uuid-001',
        projection: () => ({ agenda: [], rounds: [], participants: [], settings: {}, meta: {} }),
        isHost: () => true,
        onlineIds: () => new Set(['user-1']),
        onChange: () => () => {},
        onStatusChange: (cb: (s: string) => void) => {
          // Fire 'connected' after a tick so openAgendaConnection resolves
          setTimeout(() => cb('connected'), 10);
          return () => {};
        },
        onHostChange: () => () => {},
        reveal: vi.fn(),
        skip: vi.fn(),
        newRound: vi.fn(),
        revote: vi.fn(),
        updateRoundDescriptor: vi.fn(),
        updateName: vi.fn(),
        updateScale: vi.fn(),
        updateDisplayName: vi.fn(),
        updateAccess: vi.fn(),
        handoffHost: vi.fn(),
        toggleRole: vi.fn(),
        endSessionForEveryone: vi.fn(),
        disconnect: vi.fn(),
      };
    },
  };
});

beforeEach(() => {
  _lastSeenDoc = new Y.Doc();
  preSeedItemId = null;
  mockReadEntries.mockReturnValue([MOCK_CACHE]);
});

afterEach(() => {
  vi.clearAllMocks();
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

    const { projectDoc } = await import('@hnch/shared');
    const state = projectDoc(_lastSeenDoc);
    expect(state.agenda.some((i) => i.title === 'Doc-verified title story')).toBe(true);
  });

  it('actually writes the agenda item to the Y.Doc (ticketId path)', async () => {
    const { handleAgendaAdd } = await import('./agenda.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleAgendaAdd({ ticket: 'DOC-999' });
    logSpy.mockRestore();

    const { projectDoc } = await import('@hnch/shared');
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
