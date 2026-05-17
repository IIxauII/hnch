import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

import {
  FIBONACCI_SCALE,
  TSHIRT_SCALE,
  isActiveParticipant,
  participantRole,
  terminalState,
  type Participant,
  type Scale,
} from './doc.js';
import {
  appendRound,
  castVote,
  clearVote,
  currentRound,
  DOC_META_KEY,
  DOC_PARTICIPANTS_KEY,
  DOC_ROUNDS_KEY,
  DOC_SETTINGS_KEY,
  endSessionForEveryone,
  initDoc,
  isConsensus,
  joinDoc,
  leaveSession,
  patchRoundDescriptor,
  patchSettings,
  projectDoc,
  removeParticipant,
  revealRound,
  skipRound,
  upsertParticipant,
  type DocProjection,
  type InitDocInit,
} from './doc-projection.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/**
 * A freshly seeded doc suitable for most tests. Returns both the doc
 * and the init payload so assertions can reference the input values.
 */
function seedDoc(overrides: Partial<InitDocInit> = {}): { doc: Y.Doc; init: InitDocInit } {
  const init: InitDocInit = {
    roomUuid: 'room-uuid-1',
    createdAt: 1_700_000_000_000,
    participantId: 'p-host',
    displayName: 'Alice',
    defaultScale: FIBONACCI_SCALE,
    sessionName: 'Sprint 42 planning',
    ...overrides,
  };
  const doc = new Y.Doc();
  initDoc(doc, init);
  return { doc, init };
}

// ---------------------------------------------------------------------------
// initDoc
// ---------------------------------------------------------------------------

describe('initDoc', () => {
  it('seeds meta, settings, and the host participant in one pass', () => {
    const { doc, init } = seedDoc();
    const snap = projectDoc(doc);

    expect(snap.meta).toEqual({
      roomUuid: init.roomUuid,
      createdAt: init.createdAt,
      createdBy: init.participantId,
    });
    expect(snap.settings).toEqual({
      name: init.sessionName,
      defaultScale: FIBONACCI_SCALE,
      hostParticipantId: init.participantId,
    });
    expect(snap.participants).toEqual([
      {
        id: init.participantId,
        displayName: init.displayName,
        joinedAt: init.createdAt,
      },
    ]);
    expect(snap.rounds).toEqual([]);
  });

  it('omits optional settings keys when not provided', () => {
    const { doc } = seedDoc({ sessionName: undefined });
    const snap = projectDoc(doc);

    expect('name' in snap.settings).toBe(false);
  });

  it('throws when called on an already-seeded doc', () => {
    const { doc } = seedDoc();
    expect(() =>
      initDoc(doc, {
        roomUuid: 'other',
        createdAt: 0,
        participantId: 'p-other',
        displayName: 'Bob',
        defaultScale: TSHIRT_SCALE,
      }),
    ).toThrow(/already seeded/);
  });

  it('fires observers exactly once per init (single transaction)', () => {
    const doc = new Y.Doc();
    let events = 0;
    const handler = (): void => {
      events += 1;
    };
    doc.on('afterTransaction', handler);

    initDoc(doc, {
      roomUuid: 'room-tx',
      createdAt: 1,
      participantId: 'p',
      displayName: 'A',
      defaultScale: FIBONACCI_SCALE,
    });

    doc.off('afterTransaction', handler);
    expect(events).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// patchSettings
// ---------------------------------------------------------------------------

describe('patchSettings', () => {
  it('shallow-merges a partial patch', () => {
    const { doc } = seedDoc();
    patchSettings(doc, { name: 'Renamed' });
    const snap = projectDoc(doc);

    expect(snap.settings.name).toBe('Renamed');
    // Untouched keys survive the patch.
    expect(snap.settings.defaultScale).toEqual(FIBONACCI_SCALE);
    expect(snap.settings.hostParticipantId).toBe('p-host');
  });

  it('treats `undefined` as explicit key deletion', () => {
    const { doc } = seedDoc();
    patchSettings(doc, { name: undefined });
    const snap = projectDoc(doc);

    expect('name' in snap.settings).toBe(false);
  });

  it('replaces the defaultScale wholesale (no per-card merge)', () => {
    const { doc } = seedDoc();
    patchSettings(doc, { defaultScale: TSHIRT_SCALE });
    const snap = projectDoc(doc);

    expect(snap.settings.defaultScale).toEqual(TSHIRT_SCALE);
  });
});

// ---------------------------------------------------------------------------
// upsertParticipant
// ---------------------------------------------------------------------------

describe('upsertParticipant', () => {
  it('adds a new participant', () => {
    const { doc } = seedDoc();
    const bob: Participant = { displayName: 'Bob', joinedAt: 1_700_000_001_000 };
    upsertParticipant(doc, 'p-bob', bob);
    const snap = projectDoc(doc);

    expect(snap.participants.map((p) => p.id)).toEqual(['p-host', 'p-bob']);
    expect(snap.participants[1]).toEqual({ id: 'p-bob', ...bob });
  });

  it('updates an existing participant in place (same id, new displayName)', () => {
    const { doc } = seedDoc();
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice (edited)',
      joinedAt: 1_700_000_000_000,
    });
    const snap = projectDoc(doc);

    expect(snap.participants).toHaveLength(1);
    expect(snap.participants[0]!.displayName).toBe('Alice (edited)');
  });

  it('orders participants by joinedAt, then id, independently of insert order', () => {
    const { doc } = seedDoc({
      participantId: 'p-middle',
      createdAt: 500,
      displayName: 'M',
    });
    upsertParticipant(doc, 'p-last', { displayName: 'L', joinedAt: 1000 });
    upsertParticipant(doc, 'p-first', { displayName: 'F', joinedAt: 100 });
    // Ties on joinedAt → fall back to id ordering.
    upsertParticipant(doc, 'p-tie-b', { displayName: 'Tb', joinedAt: 100 });
    upsertParticipant(doc, 'p-tie-a', { displayName: 'Ta', joinedAt: 100 });

    const snap = projectDoc(doc);
    expect(snap.participants.map((p) => p.id)).toEqual([
      'p-first',
      'p-tie-a',
      'p-tie-b',
      'p-middle',
      'p-last',
    ]);
  });
});

// ---------------------------------------------------------------------------
// appendRound
// ---------------------------------------------------------------------------

describe('appendRound', () => {
  it('inherits scale from settings.defaultScale and snapshots it', () => {
    const { doc } = seedDoc();
    const id = appendRound(doc, {
      id: 'r1',
      createdAt: 1_700_000_100_000,
      createdBy: 'p-host',
      title: 'Auth migration',
    });

    expect(id).toBe('r1');
    const snap = projectDoc(doc);
    expect(snap.rounds).toHaveLength(1);
    expect(snap.rounds[0]!.scale).toEqual(FIBONACCI_SCALE);
    expect(snap.rounds[0]!.title).toBe('Auth migration');
    expect(snap.rounds[0]!.votes).toEqual({});

    // Snapshot isolation: mutating the default scale afterwards must not
    // rewrite the existing round's scale.
    patchSettings(doc, { defaultScale: TSHIRT_SCALE });
    const snap2 = projectDoc(doc);
    expect(snap2.rounds[0]!.scale).toEqual(FIBONACCI_SCALE);
    expect(snap2.settings.defaultScale).toEqual(TSHIRT_SCALE);
  });

  it('accepts an explicit scale override', () => {
    const { doc } = seedDoc();
    appendRound(doc, {
      id: 'r-tshirt',
      createdAt: 1,
      createdBy: 'p-host',
      scale: TSHIRT_SCALE,
    });
    const snap = projectDoc(doc);
    expect(snap.rounds[0]!.scale).toEqual(TSHIRT_SCALE);
  });

  it('carries optional context fields and parentRoundId through', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 10, createdBy: 'p-host' });
    appendRound(doc, {
      id: 'r2',
      createdAt: 20,
      createdBy: 'p-host',
      title: 'Auth migration',
      description: 'Re-vote after break-out discussion',
      ticketId: 'PROJ-1234',
      parentRoundId: 'r1',
    });
    const snap = projectDoc(doc);
    expect(snap.rounds.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(snap.rounds[1]).toMatchObject({
      parentRoundId: 'r1',
      title: 'Auth migration',
      description: 'Re-vote after break-out discussion',
      ticketId: 'PROJ-1234',
    });
  });

  it('throws when no defaultScale is set and no override is provided', () => {
    // Direct Yjs poke: remove the defaultScale to simulate a malformed doc.
    const { doc } = seedDoc();
    doc.getMap(DOC_SETTINGS_KEY).delete('defaultScale');
    expect(() => appendRound(doc, { id: 'r-bare', createdAt: 1, createdBy: 'p-host' })).toThrow(
      /defaultScale/,
    );
  });
});

// ---------------------------------------------------------------------------
// castVote / clearVote
// ---------------------------------------------------------------------------

describe('castVote / clearVote', () => {
  it('sets a vote and overwrites on re-cast', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    castVote(doc, 'r1', 'p-host', '5');
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '5' });
    castVote(doc, 'r1', 'p-host', '8');
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '8' });
  });

  it('clears a specific participant without disturbing others', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    castVote(doc, 'r1', 'p-host', '5');
    castVote(doc, 'r1', 'p-bob', '3');
    clearVote(doc, 'r1', 'p-host');

    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-bob': '3' });
  });

  it('no-ops after the round is revealed (reveals are immutable)', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    castVote(doc, 'r1', 'p-host', '5');
    revealRound(doc, 'r1', 42);

    castVote(doc, 'r1', 'p-host', '13');
    clearVote(doc, 'r1', 'p-host');

    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '5' });
  });

  it('throws on unknown round ids', () => {
    const { doc } = seedDoc();
    expect(() => castVote(doc, 'nope', 'p-host', '5')).toThrow(/not found/);
    expect(() => clearVote(doc, 'nope', 'p-host')).toThrow(/not found/);
  });

  // ADR-0040: only revealedAt blocks mutations — skippedAt does not.
  // Pre-skip votes stay in the doc (suppressed in UI); post-skip votes are
  // also written (castVote guards on revealedAt only). This test pins that
  // contract so an accidental skippedAt guard would be caught.
  it('castVote succeeds on a skipped round (only revealedAt blocks, not skippedAt)', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    skipRound(doc, 'r1', 100);
    castVote(doc, 'r1', 'p-host', '5');
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '5' });
  });

  it('clearVote succeeds on a skipped round (only revealedAt blocks, not skippedAt)', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    castVote(doc, 'r1', 'p-host', '5');
    skipRound(doc, 'r1', 100);
    clearVote(doc, 'r1', 'p-host');
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({});
  });

  it('pre-skip votes persist in the doc projection after skipRound', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    castVote(doc, 'r1', 'p-host', '8');
    castVote(doc, 'r1', 'p-bob', '13');
    skipRound(doc, 'r1', 200);
    const snap = projectDoc(doc);
    expect(snap.rounds[0]!.votes).toEqual({ 'p-host': '8', 'p-bob': '13' });
    expect(snap.rounds[0]!.skippedAt).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// revealRound
// ---------------------------------------------------------------------------

describe('revealRound', () => {
  it('stamps revealedAt', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    revealRound(doc, 'r1', 1_700_000_200_000);
    expect(projectDoc(doc).rounds[0]!.revealedAt).toBe(1_700_000_200_000);
  });

  it('throws on unknown round ids', () => {
    const { doc } = seedDoc();
    expect(() => revealRound(doc, 'nope', 1)).toThrow(/not found/);
  });

  it('throws when the round is already skipped (ADR-0040)', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    skipRound(doc, 'r1', 1_700_000_300_000);
    expect(() => revealRound(doc, 'r1', 1_700_000_400_000)).toThrow(/already skipped/);
  });
});

// ---------------------------------------------------------------------------
// skipRound (ADR-0040)
// ---------------------------------------------------------------------------

describe('skipRound', () => {
  it('stamps skippedAt', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    skipRound(doc, 'r1', 1_700_000_250_000);
    expect(projectDoc(doc).rounds[0]!.skippedAt).toBe(1_700_000_250_000);
    expect(projectDoc(doc).rounds[0]!.revealedAt).toBeUndefined();
  });

  it('throws on unknown round ids', () => {
    const { doc } = seedDoc();
    expect(() => skipRound(doc, 'nope', 1)).toThrow(/not found/);
  });

  it('throws when the round is already revealed', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    revealRound(doc, 'r1', 1_700_000_200_000);
    expect(() => skipRound(doc, 'r1', 1_700_000_300_000)).toThrow(/already revealed/);
  });

  it('throws when the round is already skipped', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    skipRound(doc, 'r1', 1_700_000_250_000);
    expect(() => skipRound(doc, 'r1', 1_700_000_300_000)).toThrow(/already skipped/);
  });
});

// ---------------------------------------------------------------------------
// terminalState (ADR-0040)
// ---------------------------------------------------------------------------

describe('terminalState', () => {
  it('returns null when neither field is set', () => {
    expect(terminalState({})).toBeNull();
  });

  it('returns "revealed" when only revealedAt is set', () => {
    expect(terminalState({ revealedAt: 100 })).toBe('revealed');
  });

  it('returns "skipped" when only skippedAt is set', () => {
    expect(terminalState({ skippedAt: 100 })).toBe('skipped');
  });

  it('picks the earlier timestamp when both are set (CRDT merge)', () => {
    expect(terminalState({ revealedAt: 100, skippedAt: 200 })).toBe('revealed');
    expect(terminalState({ revealedAt: 200, skippedAt: 100 })).toBe('skipped');
  });

  it('prefers reveal on a literal tie (revealedAt <= skippedAt)', () => {
    expect(terminalState({ revealedAt: 100, skippedAt: 100 })).toBe('revealed');
  });
});

// ---------------------------------------------------------------------------
// appendRound always writes timerStartedAt (stopwatch)
// ---------------------------------------------------------------------------

describe('appendRound timerStartedAt', () => {
  it('always writes timerStartedAt equal to createdAt', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1_700_000_100_000, createdBy: 'p-host' });
    const snap = projectDoc(doc);
    expect(snap.rounds[0]!.timerStartedAt).toBe(1_700_000_100_000);
    expect(snap.rounds[0]!.revealedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// currentRound
// ---------------------------------------------------------------------------

describe('currentRound', () => {
  it('returns null for empty rounds', () => {
    const { doc } = seedDoc();
    expect(currentRound(projectDoc(doc))).toBeNull();
  });

  it('returns the only round when one exists and is unrevealed', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    expect(currentRound(projectDoc(doc))!.id).toBe('r1');
  });

  it('returns the last unrevealed round when earlier rounds are revealed', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    appendRound(doc, { id: 'r2', createdAt: 2, createdBy: 'p-host' });
    appendRound(doc, { id: 'r3', createdAt: 3, createdBy: 'p-host' });
    revealRound(doc, 'r1', 10);
    revealRound(doc, 'r2', 20);

    expect(currentRound(projectDoc(doc))!.id).toBe('r3');
  });

  it('falls back to the last round when all are revealed', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    appendRound(doc, { id: 'r2', createdAt: 2, createdBy: 'p-host' });
    revealRound(doc, 'r1', 10);
    revealRound(doc, 'r2', 20);

    expect(currentRound(projectDoc(doc))!.id).toBe('r2');
  });
});

// ---------------------------------------------------------------------------
// Projection round-trip + containers
// ---------------------------------------------------------------------------

describe('projectDoc round-trip', () => {
  it('produces a fully-typed snapshot over a populated doc', () => {
    const { doc } = seedDoc();
    upsertParticipant(doc, 'p-bob', { displayName: 'Bob', joinedAt: 1_700_000_050_000 });
    const r1 = appendRound(doc, {
      id: 'r1',
      createdAt: 1_700_000_100_000,
      createdBy: 'p-host',
      title: 'Auth migration',
    });
    castVote(doc, r1, 'p-host', '5');
    castVote(doc, r1, 'p-bob', '8');
    revealRound(doc, r1, 1_700_000_110_000);
    appendRound(doc, {
      id: 'r2',
      createdAt: 1_700_000_120_000,
      createdBy: 'p-host',
      parentRoundId: r1,
      title: 'Auth migration',
    });

    const snap: DocProjection = projectDoc(doc);

    // Participants stable-ordered by joinedAt.
    expect(snap.participants.map((p) => p.id)).toEqual(['p-host', 'p-bob']);

    // Rounds keep insertion order; votes project as plain records.
    expect(snap.rounds.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(snap.rounds[0]!.votes).toEqual({ 'p-host': '5', 'p-bob': '8' });
    expect(snap.rounds[0]!.revealedAt).toBe(1_700_000_110_000);
    expect(snap.rounds[1]!.parentRoundId).toBe('r1');

    // currentRound picks the unrevealed re-vote.
    expect(currentRound(snap)!.id).toBe('r2');
  });

  it('uses the documented top-level container keys', () => {
    const { doc } = seedDoc();
    // Touching these keys directly on the raw doc must see the same data.
    expect(doc.getMap(DOC_META_KEY).get('roomUuid')).toBe('room-uuid-1');
    expect(doc.getMap(DOC_SETTINGS_KEY).get('hostParticipantId')).toBe('p-host');
    expect(doc.getMap(DOC_PARTICIPANTS_KEY).size).toBe(1);
    expect(doc.getArray(DOC_ROUNDS_KEY).length).toBe(0);
  });

  it('is safe against later mutations of the source doc (values, not live handles)', () => {
    const { doc } = seedDoc();
    const snap = projectDoc(doc);
    upsertParticipant(doc, 'p-bob', { displayName: 'Bob', joinedAt: 5 });

    // The earlier snapshot reflects the state at the time it was built.
    expect(snap.participants).toHaveLength(1);
    expect(projectDoc(doc).participants).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Custom scale round-trip (sanity: projections don't collapse unknown scales)
// ---------------------------------------------------------------------------

describe('custom scales round-trip', () => {
  it('preserves a non-builtin scale verbatim', () => {
    const custom: Scale = { id: 'custom-xau', cards: ['🟢', '🟡', '🔴', '?'] };
    const { doc } = seedDoc({ defaultScale: custom });
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });

    const snap = projectDoc(doc);
    expect(snap.settings.defaultScale).toEqual(custom);
    expect(snap.rounds[0]!.scale).toEqual(custom);
  });
});

// ---------------------------------------------------------------------------
// isConsensus
// ---------------------------------------------------------------------------

describe('isConsensus', () => {
  it('returns false when no votes exist', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    const snap = projectDoc(doc);
    expect(isConsensus(snap.rounds[0]!)).toBe(false);
  });

  it('returns false when only one vote exists', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    castVote(doc, 'r1', 'p-host', '5');
    const snap = projectDoc(doc);
    expect(isConsensus(snap.rounds[0]!)).toBe(false);
  });

  it('returns true when two identical votes exist', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    castVote(doc, 'r1', 'p-host', '5');
    castVote(doc, 'r1', 'p-bob', '5');
    const snap = projectDoc(doc);
    expect(isConsensus(snap.rounds[0]!)).toBe(true);
  });

  it('returns false when two different votes exist', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    castVote(doc, 'r1', 'p-host', '5');
    castVote(doc, 'r1', 'p-bob', '8');
    const snap = projectDoc(doc);
    expect(isConsensus(snap.rounds[0]!)).toBe(false);
  });

  it('returns false when three votes with one outlier exist', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    castVote(doc, 'r1', 'p-host', '5');
    castVote(doc, 'r1', 'p-bob', '5');
    castVote(doc, 'r1', 'p-charlie', '13');
    const snap = projectDoc(doc);
    expect(isConsensus(snap.rounds[0]!)).toBe(false);
  });

  it('returns true when three identical votes exist', () => {
    const { doc } = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
    castVote(doc, 'r1', 'p-host', '5');
    castVote(doc, 'r1', 'p-bob', '5');
    castVote(doc, 'r1', 'p-charlie', '5');
    const snap = projectDoc(doc);
    expect(isConsensus(snap.rounds[0]!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// participant role (ADR-0020)
// ---------------------------------------------------------------------------

describe('participant role projection round-trip', () => {
  it('projects voter role when explicitly set', () => {
    const { doc } = seedDoc();
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice',
      joinedAt: 1_700_000_000_000,
      role: 'voter',
    });
    const snap = projectDoc(doc);
    expect(snap.participants[0]!.role).toBe('voter');
  });

  it('projects viewer role when explicitly set', () => {
    const { doc } = seedDoc();
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice',
      joinedAt: 1_700_000_000_000,
      role: 'viewer',
    });
    const snap = projectDoc(doc);
    expect(snap.participants[0]!.role).toBe('viewer');
  });

  it('omits role field when not provided (backward-compat absent = voter)', () => {
    const { doc } = seedDoc();
    // initDoc does not set role — simulates a pre-ADR-0020 participant.
    const snap = projectDoc(doc);
    expect('role' in snap.participants[0]!).toBe(false);
  });

  it('upsert can change role from viewer to voter', () => {
    const { doc } = seedDoc();
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice',
      joinedAt: 1_700_000_000_000,
      role: 'viewer',
    });
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice',
      joinedAt: 1_700_000_000_000,
      role: 'voter',
    });
    const snap = projectDoc(doc);
    expect(snap.participants[0]!.role).toBe('voter');
  });

  it('new participant with role appears correctly', () => {
    const { doc } = seedDoc();
    upsertParticipant(doc, 'p-observer', {
      displayName: 'Observer',
      joinedAt: 1_700_000_001_000,
      role: 'viewer',
    });
    const snap = projectDoc(doc);
    const observer = snap.participants.find((p) => p.id === 'p-observer')!;
    expect(observer.role).toBe('viewer');
  });

  it('updating displayName without role preserves existing viewer role (partial-update)', () => {
    const { doc } = seedDoc();
    // Set viewer role first.
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice',
      joinedAt: 1_700_000_000_000,
      role: 'viewer',
    });
    // Update displayName only — no role field.
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice (renamed)',
      joinedAt: 1_700_000_000_000,
    });
    const snap = projectDoc(doc);
    expect(snap.participants[0]!.displayName).toBe('Alice (renamed)');
    expect(snap.participants[0]!.role).toBe('viewer');
  });
});

// ---------------------------------------------------------------------------
// endSessionForEveryone
// ---------------------------------------------------------------------------

describe('endSessionForEveryone', () => {
  it('writes sessionEndedAt to meta projection', () => {
    const { doc } = seedDoc();
    const before = Date.now();
    endSessionForEveryone(doc);
    const after = Date.now();
    const snap = projectDoc(doc);
    expect(snap.meta.sessionEndedAt).toBeGreaterThanOrEqual(before);
    expect(snap.meta.sessionEndedAt).toBeLessThanOrEqual(after);
  });

  it('sessionEndedAt is undefined when not set', () => {
    const { doc } = seedDoc();
    const snap = projectDoc(doc);
    expect(snap.meta.sessionEndedAt).toBeUndefined();
  });

  it('is idempotent — second call overwrites with a new timestamp', () => {
    const { doc } = seedDoc();
    endSessionForEveryone(doc);
    const first = projectDoc(doc).meta.sessionEndedAt!;
    endSessionForEveryone(doc);
    const second = projectDoc(doc).meta.sessionEndedAt!;
    expect(second).toBeGreaterThanOrEqual(first);
  });
});

// ---------------------------------------------------------------------------
// participantRole helper
// ---------------------------------------------------------------------------

describe('participantRole', () => {
  it('returns voter when role is explicitly voter', () => {
    expect(participantRole({ role: 'voter' })).toBe('voter');
  });

  it('returns viewer when role is explicitly viewer', () => {
    expect(participantRole({ role: 'viewer' })).toBe('viewer');
  });

  it('returns voter when role is absent (backward-compat default)', () => {
    expect(participantRole({})).toBe('voter');
  });

  it('returns voter when role is undefined', () => {
    expect(participantRole({ role: undefined })).toBe('voter');
  });
});

// ---------------------------------------------------------------------------
// isActiveParticipant (ADR-0036)
// ---------------------------------------------------------------------------

describe('isActiveParticipant', () => {
  it('returns true when leftAt is absent', () => {
    expect(isActiveParticipant({})).toBe(true);
  });

  it('returns true when leftAt is undefined', () => {
    expect(isActiveParticipant({ leftAt: undefined })).toBe(true);
  });

  it('returns false when leftAt is set', () => {
    expect(isActiveParticipant({ leftAt: 1_700_000_000_000 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// leaveSession (ADR-0036)
// ---------------------------------------------------------------------------

describe('leaveSession', () => {
  it('sets leftAt and removedBy=selfId on the participant record', () => {
    const { doc } = seedDoc();
    const before = Date.now();
    leaveSession(doc, 'p-host');
    const after = Date.now();
    const snap = projectDoc(doc);
    const p = snap.participants[0]!;
    expect(p.leftAt).toBeGreaterThanOrEqual(before);
    expect(p.leftAt).toBeLessThanOrEqual(after);
    expect(p.removedBy).toBe('p-host');
  });

  it('marks the participant as inactive after leave', () => {
    const { doc } = seedDoc();
    leaveSession(doc, 'p-host');
    const p = projectDoc(doc).participants[0]!;
    expect(isActiveParticipant(p)).toBe(false);
  });

  it('is a no-op when participant record is missing', () => {
    const { doc } = seedDoc();
    expect(() => leaveSession(doc, 'nonexistent-id')).not.toThrow();
    const snap = projectDoc(doc);
    expect(snap.participants).toHaveLength(1);
    expect(snap.participants[0]!.leftAt).toBeUndefined();
  });

  it('fires exactly one transaction', () => {
    const { doc } = seedDoc();
    let txCount = 0;
    const handler = (): void => {
      txCount += 1;
    };
    doc.on('afterTransaction', handler);
    leaveSession(doc, 'p-host');
    doc.off('afterTransaction', handler);
    expect(txCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// removeParticipant (ADR-0036)
// ---------------------------------------------------------------------------

describe('removeParticipant', () => {
  it('sets leftAt and removedBy=hostId on the target record', () => {
    const { doc } = seedDoc();
    upsertParticipant(doc, 'p-bob', { displayName: 'Bob', joinedAt: 1_700_000_001_000 });
    const before = Date.now();
    removeParticipant(doc, 'p-host', 'p-bob');
    const after = Date.now();
    const snap = projectDoc(doc);
    const bob = snap.participants.find((p) => p.id === 'p-bob')!;
    expect(bob.leftAt).toBeGreaterThanOrEqual(before);
    expect(bob.leftAt).toBeLessThanOrEqual(after);
    expect(bob.removedBy).toBe('p-host');
  });

  it('marks the target as inactive after kick', () => {
    const { doc } = seedDoc();
    upsertParticipant(doc, 'p-bob', { displayName: 'Bob', joinedAt: 1_700_000_001_000 });
    removeParticipant(doc, 'p-host', 'p-bob');
    const bob = projectDoc(doc).participants.find((p) => p.id === 'p-bob')!;
    expect(isActiveParticipant(bob)).toBe(false);
  });

  it('does not touch the host record', () => {
    const { doc } = seedDoc();
    upsertParticipant(doc, 'p-bob', { displayName: 'Bob', joinedAt: 1_700_000_001_000 });
    removeParticipant(doc, 'p-host', 'p-bob');
    const host = projectDoc(doc).participants.find((p) => p.id === 'p-host')!;
    expect(isActiveParticipant(host)).toBe(true);
  });

  it('is a no-op when targetId === hostId (self-kick must use leaveSession)', () => {
    const { doc } = seedDoc();
    removeParticipant(doc, 'p-host', 'p-host');
    const host = projectDoc(doc).participants[0]!;
    expect(host.leftAt).toBeUndefined();
    expect(host.removedBy).toBeUndefined();
  });

  it('is a no-op when target record is missing', () => {
    const { doc } = seedDoc();
    expect(() => removeParticipant(doc, 'p-host', 'nonexistent-id')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// joinDoc re-join clears removal state (ADR-0036)
// ---------------------------------------------------------------------------

describe('joinDoc re-join clears leftAt / removedBy', () => {
  it('clears leftAt and removedBy when participant re-joins after leave', () => {
    const { doc } = seedDoc();
    leaveSession(doc, 'p-host');
    expect(projectDoc(doc).participants[0]!.leftAt).toBeDefined();

    joinDoc(doc, { participantId: 'p-host', displayName: 'Alice' });
    const snap = projectDoc(doc);
    const p = snap.participants[0]!;
    expect(p.leftAt).toBeUndefined();
    expect(p.removedBy).toBeUndefined();
    expect(isActiveParticipant(p)).toBe(true);
  });

  it('clears leftAt and removedBy when participant re-joins after kick', () => {
    const { doc } = seedDoc();
    upsertParticipant(doc, 'p-bob', { displayName: 'Bob', joinedAt: 1_700_000_001_000 });
    removeParticipant(doc, 'p-host', 'p-bob');
    expect(projectDoc(doc).participants.find((p) => p.id === 'p-bob')!.leftAt).toBeDefined();

    joinDoc(doc, { participantId: 'p-bob', displayName: 'Bob' });
    const bob = projectDoc(doc).participants.find((p) => p.id === 'p-bob')!;
    expect(bob.leftAt).toBeUndefined();
    expect(bob.removedBy).toBeUndefined();
  });

  it('preserves joinedAt on re-join', () => {
    const { doc, init } = seedDoc();
    leaveSession(doc, 'p-host');
    joinDoc(doc, { participantId: 'p-host', displayName: 'Alice' });
    const p = projectDoc(doc).participants[0]!;
    expect(p.joinedAt).toBe(init.createdAt);
  });

  it('creates a new record with joinedAt when participant is new', () => {
    const { doc } = seedDoc();
    const before = Date.now();
    joinDoc(doc, { participantId: 'p-new', displayName: 'New Person' });
    const after = Date.now();
    const snap = projectDoc(doc);
    const p = snap.participants.find((pp) => pp.id === 'p-new')!;
    expect(p.joinedAt).toBeGreaterThanOrEqual(before);
    expect(p.joinedAt).toBeLessThanOrEqual(after);
    expect(p.leftAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Auto-reveal denominator excludes left voters (ADR-0036)
// ---------------------------------------------------------------------------

describe('auto-reveal denominator excludes left voters', () => {
  it('2 of 3 voters voting triggers reveal when the 3rd has left without voting', () => {
    // Setup: 3 voters in a doc.
    const doc = new Y.Doc();
    initDoc(doc, {
      roomUuid: 'room-uuid-ar',
      createdAt: 1,
      participantId: 'p-a',
      displayName: 'Alice',
      defaultScale: FIBONACCI_SCALE,
    });
    upsertParticipant(doc, 'p-b', { displayName: 'Bob', joinedAt: 2 });
    upsertParticipant(doc, 'p-c', { displayName: 'Carol', joinedAt: 3 });
    appendRound(doc, { id: 'r1', createdAt: 10, createdBy: 'p-a' });

    // p-c leaves without voting.
    leaveSession(doc, 'p-c');

    // p-a and p-b vote.
    castVote(doc, 'r1', 'p-a', '5');
    castVote(doc, 'r1', 'p-b', '8');

    const snap = projectDoc(doc);
    const round = snap.rounds[0]!;

    // Active online voters = those who are active AND online (aware).
    // In this unit test we simulate "online" as all active participants,
    // demonstrating the filter logic the callers must apply.
    const activeVoterIds = snap.participants
      .filter(isActiveParticipant)
      .filter((p) => participantRole(p) === 'voter')
      .map((p) => p.id);

    // Should be p-a and p-b only — p-c is inactive.
    expect(activeVoterIds).toEqual(['p-a', 'p-b']);

    // All active voters have voted → auto-reveal should fire.
    const allActiveVotersHaveVoted =
      activeVoterIds.length > 0 && activeVoterIds.every((id) => id in round.votes);

    expect(allActiveVotersHaveVoted).toBe(true);
  });

  it('reveal does not trigger prematurely when an active voter has not voted', () => {
    const doc = new Y.Doc();
    initDoc(doc, {
      roomUuid: 'room-uuid-ar2',
      createdAt: 1,
      participantId: 'p-a',
      displayName: 'Alice',
      defaultScale: FIBONACCI_SCALE,
    });
    upsertParticipant(doc, 'p-b', { displayName: 'Bob', joinedAt: 2 });
    appendRound(doc, { id: 'r1', createdAt: 10, createdBy: 'p-a' });

    // Only p-a votes; p-b is still active and hasn't voted.
    castVote(doc, 'r1', 'p-a', '5');

    const snap = projectDoc(doc);
    const round = snap.rounds[0]!;
    const activeVoterIds = snap.participants
      .filter(isActiveParticipant)
      .filter((p) => participantRole(p) === 'voter')
      .map((p) => p.id);

    const allActiveVotersHaveVoted =
      activeVoterIds.length > 0 && activeVoterIds.every((id) => id in round.votes);

    expect(allActiveVotersHaveVoted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CRDT concurrency: concurrent leaveSession + removeParticipant (ADR-0036 §7)
// ---------------------------------------------------------------------------

describe('concurrent leaveSession + removeParticipant converge (ADR-0036 §7)', () => {
  it('both docs reach same leftAt and removedBy after exchanging updates', () => {
    // Seed a single source-of-truth doc, then fork into docA and docB.
    const docSrc = new Y.Doc();
    initDoc(docSrc, {
      roomUuid: 'room-concurrent',
      createdAt: 1_700_000_000_000,
      participantId: 'p-host',
      displayName: 'Host',
      defaultScale: FIBONACCI_SCALE,
    });
    upsertParticipant(docSrc, 'p-target', { displayName: 'Target', joinedAt: 1_700_000_001_000 });

    const initialUpdate = Y.encodeStateAsUpdate(docSrc);

    const docA = new Y.Doc();
    Y.applyUpdate(docA, initialUpdate);

    const docB = new Y.Doc();
    Y.applyUpdate(docB, initialUpdate);

    // Concurrent writes: target leaves on docA, host kicks target on docB.
    leaveSession(docA, 'p-target');
    removeParticipant(docB, 'p-host', 'p-target');

    // Exchange updates — each doc sees the other's write.
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

    // Both docs must converge to identical state.
    const snapA = projectDoc(docA);
    const snapB = projectDoc(docB);

    const targetA = snapA.participants.find((p) => p.id === 'p-target')!;
    const targetB = snapB.participants.find((p) => p.id === 'p-target')!;

    // leftAt must be defined and identical on both sides.
    expect(targetA.leftAt).toBeDefined();
    expect(targetB.leftAt).toBeDefined();
    expect(targetA.leftAt).toBe(targetB.leftAt);

    // removedBy must be defined and identical on both sides.
    expect(targetA.removedBy).toBeDefined();
    expect(targetB.removedBy).toBeDefined();
    expect(targetA.removedBy).toBe(targetB.removedBy);

    // Yjs LWW picked one winner — must be one of the two actors.
    expect(['p-target', 'p-host']).toContain(targetA.removedBy);
  });
});

// ---------------------------------------------------------------------------
// patchRoundDescriptor
// ---------------------------------------------------------------------------

describe('patchRoundDescriptor', () => {
  function makeDocWithRound(overrides: { title?: string; description?: string } = {}) {
    const { doc } = seedDoc();
    const id = appendRound(doc, {
      id: 'r-1',
      createdAt: 1_700_000_001_000,
      createdBy: 'p-host',
      ...overrides,
    });
    return { doc, id };
  }

  it('updates title only — description untouched', () => {
    const { doc, id } = makeDocWithRound({ title: 'original', description: 'keep me' });
    patchRoundDescriptor(doc, id, { title: 'updated' });
    const snap = projectDoc(doc);
    const round = snap.rounds.find((r) => r.id === id)!;
    expect(round.title).toBe('updated');
    expect(round.description).toBe('keep me');
  });

  it('updates description only — title untouched', () => {
    const { doc, id } = makeDocWithRound({ title: 'keep me', description: 'original' });
    patchRoundDescriptor(doc, id, { description: 'updated' });
    const snap = projectDoc(doc);
    const round = snap.rounds.find((r) => r.id === id)!;
    expect(round.title).toBe('keep me');
    expect(round.description).toBe('updated');
  });

  it('updates both title and description', () => {
    const { doc, id } = makeDocWithRound({ title: 'old title', description: 'old desc' });
    patchRoundDescriptor(doc, id, { title: 'new title', description: 'new desc' });
    const snap = projectDoc(doc);
    const round = snap.rounds.find((r) => r.id === id)!;
    expect(round.title).toBe('new title');
    expect(round.description).toBe('new desc');
  });

  it('no fields passed → no-op, title and description unchanged', () => {
    const { doc, id } = makeDocWithRound({ title: 'stable', description: 'stable desc' });
    patchRoundDescriptor(doc, id, {});
    const snap = projectDoc(doc);
    const round = snap.rounds.find((r) => r.id === id)!;
    expect(round.title).toBe('stable');
    expect(round.description).toBe('stable desc');
  });

  it('round not found → throws with expected message', () => {
    const { doc } = makeDocWithRound();
    expect(() => patchRoundDescriptor(doc, 'no-such-round', { title: 'x' })).toThrow(
      'patchRoundDescriptor: round no-such-round not found',
    );
  });

  it('empty string overwrites title to empty string', () => {
    const { doc, id } = makeDocWithRound({ title: 'non-empty' });
    patchRoundDescriptor(doc, id, { title: '' });
    const snap = projectDoc(doc);
    const round = snap.rounds.find((r) => r.id === id)!;
    expect(round.title).toBe('');
  });

  it('patches a revealed round — succeeds without error', () => {
    const { doc, id } = makeDocWithRound({ title: 'before reveal' });
    revealRound(doc, id, 1_700_000_002_000);
    patchRoundDescriptor(doc, id, { title: 'after reveal' });
    const snap = projectDoc(doc);
    const round = snap.rounds.find((r) => r.id === id)!;
    expect(round.title).toBe('after reveal');
    expect(round.revealedAt).toBe(1_700_000_002_000);
  });

  it('patches a skipped round — editorial corrections are not phase-gated (ADR-0040)', () => {
    const { doc, id } = makeDocWithRound({ title: 'before skip' });
    skipRound(doc, id, 1_700_000_003_000);
    patchRoundDescriptor(doc, id, { title: 'after skip', description: 'added retrospectively' });
    const snap = projectDoc(doc);
    const round = snap.rounds.find((r) => r.id === id)!;
    expect(round.title).toBe('after skip');
    expect(round.description).toBe('added retrospectively');
    expect(round.skippedAt).toBe(1_700_000_003_000);
  });
});
