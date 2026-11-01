import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

import { ABSTAIN_SENTINEL } from './abstain.js';
import { FIBONACCI_SCALE } from './doc.js';
import {
  appendRound,
  discardRound,
  initDoc,
  leaveSession,
  projectDoc,
  removeParticipant,
  skipRound,
  upsertParticipant,
} from './doc-projection.js';
import { revealCurrentRound } from './round-commands.js';
import { toggleCurrentVote, clearCurrentVote } from './vote-commands.js';

/** Freshly seeded doc with no rounds. Seeded host `p-host` is a voter by default. */
function seedDoc(): Y.Doc {
  const doc = new Y.Doc();
  initDoc(doc, {
    roomUuid: 'room-uuid-1',
    createdAt: 1_700_000_000_000,
    participantId: 'p-host',
    displayName: 'Alice',
    defaultScale: FIBONACCI_SCALE,
  });
  return doc;
}

/** Seeded doc with one active (pending) round `r1`. */
function seedWithRound(): Y.Doc {
  const doc = seedDoc();
  appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' });
  return doc;
}

function makeViewer(doc: Y.Doc, id: string, displayName: string): void {
  upsertParticipant(doc, id, { displayName, joinedAt: 1, role: 'viewer' });
}

describe('active-round gate', () => {
  it('toggleCurrentVote refuses with no-active-round when there are no rounds at all', () => {
    const doc = seedDoc();
    const result = toggleCurrentVote(doc, 'p-host', '5');
    expect(result).toEqual({ applied: false, reason: 'no-active-round' });
  });

  it('clearCurrentVote refuses with no-active-round when there are no rounds at all', () => {
    const doc = seedDoc();
    expect(clearCurrentVote(doc, 'p-host')).toEqual({
      applied: false,
      reason: 'no-active-round',
    });
  });

  it('toggleCurrentVote refuses on a revealed round, votes map untouched', () => {
    const doc = seedWithRound();
    revealCurrentRound(doc, () => 100);
    const result = toggleCurrentVote(doc, 'p-host', '5');
    expect(result).toEqual({ applied: false, reason: 'no-active-round' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({});
  });

  it('toggleCurrentVote refuses on a skipped round, votes map untouched', () => {
    const doc = seedWithRound();
    skipRound(doc, 'r1', 100);
    const result = toggleCurrentVote(doc, 'p-host', '5');
    expect(result).toEqual({ applied: false, reason: 'no-active-round' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({});
  });

  it('toggleCurrentVote refuses on a discarded round, votes map untouched', () => {
    const doc = seedWithRound();
    discardRound(doc, 'r1', 100, 'p-host');
    const result = toggleCurrentVote(doc, 'p-host', '5');
    expect(result).toEqual({ applied: false, reason: 'no-active-round' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({});
  });

  it('clearCurrentVote refuses on a skipped round, votes map untouched (pre-skip vote survives)', () => {
    const doc = seedWithRound();
    // Cast while active so a stray pre-skip vote is present, then skip.
    toggleCurrentVote(doc, 'p-host', '5');
    skipRound(doc, 'r1', 100);
    const result = clearCurrentVote(doc, 'p-host');
    expect(result).toEqual({ applied: false, reason: 'no-active-round' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '5' });
  });

  it('clearCurrentVote refuses on a discarded round, votes map untouched (pre-discard vote survives)', () => {
    const doc = seedWithRound();
    toggleCurrentVote(doc, 'p-host', '5');
    discardRound(doc, 'r1', 100, 'p-host');
    const result = clearCurrentVote(doc, 'p-host');
    expect(result).toEqual({ applied: false, reason: 'no-active-round' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '5' });
  });
});

// Role gate (toggleCurrentVote only)

describe('role gate', () => {
  it('toggleCurrentVote refuses a viewer with not-a-voter', () => {
    const doc = seedWithRound();
    makeViewer(doc, 'p-viewer', 'Bob');
    const result = toggleCurrentVote(doc, 'p-viewer', '5');
    expect(result).toEqual({ applied: false, reason: 'not-a-voter' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({});
  });

  it('toggleCurrentVote refuses an unknown participant id with not-a-voter', () => {
    const doc = seedWithRound();
    const result = toggleCurrentVote(doc, 'p-ghost', '5');
    expect(result).toEqual({ applied: false, reason: 'not-a-voter' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({});
  });

  it('toggleCurrentVote refuses a participant who left the session with not-a-voter', () => {
    const doc = seedWithRound();
    upsertParticipant(doc, 'p-bob', { displayName: 'Bob', joinedAt: 1 });
    leaveSession(doc, 'p-bob', 1_700_000_500_000);
    const result = toggleCurrentVote(doc, 'p-bob', '5');
    expect(result).toEqual({ applied: false, reason: 'not-a-voter' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({});
  });

  it('toggleCurrentVote refuses a participant removed by the host with not-a-voter', () => {
    const doc = seedWithRound();
    upsertParticipant(doc, 'p-bob', { displayName: 'Bob', joinedAt: 1 });
    removeParticipant(doc, 'p-host', 'p-bob', 1_700_000_500_000);
    const result = toggleCurrentVote(doc, 'p-bob', '5');
    expect(result).toEqual({ applied: false, reason: 'not-a-voter' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({});
  });
});

describe('toggleCurrentVote — toggle rule', () => {
  it('cast, then re-select the same card clears, then re-select casts again', () => {
    const doc = seedWithRound();

    const cast = toggleCurrentVote(doc, 'p-host', '5');
    expect(cast).toEqual({ applied: true, effect: 'cast' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '5' });

    const cleared = toggleCurrentVote(doc, 'p-host', '5');
    expect(cleared).toEqual({ applied: true, effect: 'cleared' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({});

    const recast = toggleCurrentVote(doc, 'p-host', '5');
    expect(recast).toEqual({ applied: true, effect: 'cast' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '5' });
  });

  it('selecting a different card changes the vote (cast, not cleared)', () => {
    const doc = seedWithRound();
    toggleCurrentVote(doc, 'p-host', '5');
    const result = toggleCurrentVote(doc, 'p-host', '8');
    expect(result).toEqual({ applied: true, effect: 'cast' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '8' });
  });

  it('toggles the abstain sentinel like any other card value', () => {
    const doc = seedWithRound();
    const cast = toggleCurrentVote(doc, 'p-host', ABSTAIN_SENTINEL);
    expect(cast).toEqual({ applied: true, effect: 'cast' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': ABSTAIN_SENTINEL });

    const cleared = toggleCurrentVote(doc, 'p-host', ABSTAIN_SENTINEL);
    expect(cleared).toEqual({ applied: true, effect: 'cleared' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({});
  });

  it('replaces an abstain vote with a numeric card (cast, not cleared)', () => {
    const doc = seedWithRound();
    toggleCurrentVote(doc, 'p-host', ABSTAIN_SENTINEL);
    const result = toggleCurrentVote(doc, 'p-host', '5');
    expect(result).toEqual({ applied: true, effect: 'cast' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '5' });
  });

  it('replaces a numeric vote with the abstain sentinel (cast, not cleared)', () => {
    const doc = seedWithRound();
    toggleCurrentVote(doc, 'p-host', '5');
    const result = toggleCurrentVote(doc, 'p-host', ABSTAIN_SENTINEL);
    expect(result).toEqual({ applied: true, effect: 'cast' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': ABSTAIN_SENTINEL });
  });
});

// Role-flip mid-round: viewer may still clear

describe('clearCurrentVote — role-flip mid-round', () => {
  it('a voter who becomes a viewer mid-round can still clear their vote', () => {
    const doc = seedWithRound();
    toggleCurrentVote(doc, 'p-host', '5');
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '5' });

    // Flip to viewer mid-round.
    upsertParticipant(doc, 'p-host', { displayName: 'Alice', joinedAt: 1, role: 'viewer' });

    const cleared = clearCurrentVote(doc, 'p-host');
    expect(cleared).toEqual({ applied: true, effect: 'cleared' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({});
  });

  it('a viewer cannot toggleCurrentVote but can clearCurrentVote', () => {
    const doc = seedWithRound();
    makeViewer(doc, 'p-viewer', 'Bob');

    expect(toggleCurrentVote(doc, 'p-viewer', '5')).toEqual({
      applied: false,
      reason: 'not-a-voter',
    });

    // No vote was ever cast, but clearCurrentVote still succeeds (no-op write).
    expect(clearCurrentVote(doc, 'p-viewer')).toEqual({ applied: true, effect: 'cleared' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({});
  });

  it('a participant kicked mid-round cannot toggleCurrentVote but can still clearCurrentVote', () => {
    const doc = seedWithRound();
    upsertParticipant(doc, 'p-bob', { displayName: 'Bob', joinedAt: 1 });
    toggleCurrentVote(doc, 'p-bob', '5');
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-bob': '5' });

    removeParticipant(doc, 'p-host', 'p-bob', 1_700_000_500_000);

    expect(toggleCurrentVote(doc, 'p-bob', '8')).toEqual({
      applied: false,
      reason: 'not-a-voter',
    });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-bob': '5' });

    expect(clearCurrentVote(doc, 'p-bob')).toEqual({ applied: true, effect: 'cleared' });
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({});
  });
});
