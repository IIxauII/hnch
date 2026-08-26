import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

import { FIBONACCI_SCALE } from './doc.js';
import { appendRound, initDoc, joinDoc, projectDoc } from './doc-projection.js';
import {
  discardCurrentRound,
  revealCurrentRound,
  skipCurrentRound,
  startRound,
} from './round-commands.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Freshly seeded doc with no rounds. */
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

const FIXED = () => 1_700_000_900_000;

// ---------------------------------------------------------------------------
// startRound
// ---------------------------------------------------------------------------

describe('startRound', () => {
  it('applies: mints an id, stamps the clock into createdAt/timerStartedAt, attributes the host', () => {
    const doc = seedDoc();
    const result = startRound(doc, {}, FIXED);
    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error('unreachable');

    const round = projectDoc(doc).rounds[0]!;
    // The id in the result is the id that landed in the projection.
    expect(round.id).toBe(result.id);
    expect(result.at).toBe(1_700_000_900_000);
    expect(round.createdAt).toBe(1_700_000_900_000);
    expect(round.timerStartedAt).toBe(1_700_000_900_000);
    // createdBy comes from settings.hostParticipantId, not a caller-supplied id —
    // there is no actor parameter on this command at all.
    expect(round.createdBy).toBe('p-host');
  });

  it('carries descriptor fields when supplied', () => {
    const doc = seedDoc();
    startRound(
      doc,
      { title: 'Story A', description: 'Some detail', ticketId: 'T-1', agendaItemId: 'a-1' },
      FIXED,
    );

    const round = projectDoc(doc).rounds[0]!;
    expect(round.title).toBe('Story A');
    expect(round.description).toBe('Some detail');
    expect(round.ticketId).toBe('T-1');
    expect(round.agendaItemId).toBe('a-1');
  });

  it('leaves descriptor fields absent when omitted', () => {
    const doc = seedDoc();
    startRound(doc, {}, FIXED);

    const round = projectDoc(doc).rounds[0]!;
    expect(round.title).toBeUndefined();
    expect(round.description).toBeUndefined();
    expect(round.ticketId).toBeUndefined();
    expect(round.agendaItemId).toBeUndefined();
  });

  it('links parentRoundId for a re-vote, without inheriting the parent’s descriptor fields', () => {
    const doc = seedDoc();
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host', title: 'Parent title' });

    const result = startRound(doc, { parentRoundId: 'r1' }, FIXED);
    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error('unreachable');

    const revote = projectDoc(doc).rounds[1]!;
    expect(revote.parentRoundId).toBe('r1');
    // Bare `startRound(doc, { parentRoundId })` does not carry the parent's
    // title over — a caller that wants it passes it explicitly.
    expect(revote.title).toBeUndefined();
  });

  it('refuses with no-host and writes nothing when settings.hostParticipantId is unset', () => {
    // A joiner whose settings have not synced yet: joinDoc writes only the
    // participant record, never settings/meta, so hostParticipantId is unset.
    const doc = new Y.Doc();
    joinDoc(doc, { participantId: 'p-joiner', displayName: 'Joiner', joinedAt: 1 });

    const result = startRound(doc, {}, FIXED);
    expect(result).toEqual({ applied: false, reason: 'no-host' });
    expect(projectDoc(doc).rounds).toHaveLength(0);
  });

  it('defaults the clock to Date.now when none is injected', () => {
    const doc = seedDoc();
    const before = Date.now();
    const result = startRound(doc);
    const after = Date.now();

    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error('unreachable');
    expect(result.at).toBeGreaterThanOrEqual(before);
    expect(result.at).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// revealCurrentRound
// ---------------------------------------------------------------------------

describe('revealCurrentRound', () => {
  it('reveals an active round: applied + stamped clock + doc effect', () => {
    const doc = seedWithRound();
    const result = revealCurrentRound(doc, FIXED);
    expect(result).toEqual({ applied: true, at: 1_700_000_900_000 });
    const round = projectDoc(doc).rounds[0]!;
    expect(round.status).toBe('revealed');
    expect(round.terminalAt).toBe(1_700_000_900_000);
  });

  it('no-ops with already-terminal when the round is already revealed', () => {
    const doc = seedWithRound();
    revealCurrentRound(doc, FIXED);
    const result = revealCurrentRound(doc, () => 2_000_000_000_000);
    expect(result).toEqual({ applied: false, reason: 'already-terminal' });
    // doc unchanged — original reveal timestamp preserved.
    expect(projectDoc(doc).rounds[0]!.terminalAt).toBe(1_700_000_900_000);
  });

  it('no-ops with no-current-round when no round exists', () => {
    const doc = seedDoc();
    const result = revealCurrentRound(doc, FIXED);
    expect(result).toEqual({ applied: false, reason: 'no-current-round' });
  });
});

// ---------------------------------------------------------------------------
// skipCurrentRound
// ---------------------------------------------------------------------------

describe('skipCurrentRound', () => {
  it('skips an active round: applied + stamped clock + doc effect', () => {
    const doc = seedWithRound();
    const result = skipCurrentRound(doc, FIXED);
    expect(result).toEqual({ applied: true, at: 1_700_000_900_000 });
    const round = projectDoc(doc).rounds[0]!;
    expect(round.status).toBe('skipped');
    expect(round.terminalAt).toBe(1_700_000_900_000);
  });

  it('no-ops with already-terminal when the round is already revealed', () => {
    const doc = seedWithRound();
    revealCurrentRound(doc, FIXED);
    const result = skipCurrentRound(doc, () => 2_000_000_000_000);
    expect(result).toEqual({ applied: false, reason: 'already-terminal' });
    expect(projectDoc(doc).rounds[0]!.status).toBe('revealed');
  });

  it('no-ops with no-current-round when no round exists', () => {
    const doc = seedDoc();
    expect(skipCurrentRound(doc, FIXED)).toEqual({
      applied: false,
      reason: 'no-current-round',
    });
  });
});

// ---------------------------------------------------------------------------
// discardCurrentRound
// ---------------------------------------------------------------------------

describe('discardCurrentRound', () => {
  it('discards an active round: applied + stamped clock + doc effect', () => {
    const doc = seedWithRound();
    const result = discardCurrentRound(doc, 'p-host', FIXED);
    expect(result).toEqual({ applied: true, at: 1_700_000_900_000 });
    // Discarded rounds are tombstones — excluded from currentRound projection.
    expect(projectDoc(doc).rounds[0]!.status).toBe('discarded');
  });

  it('no-ops with already-terminal when the round is already revealed', () => {
    const doc = seedWithRound();
    revealCurrentRound(doc, FIXED);
    const result = discardCurrentRound(doc, 'p-host', () => 2_000_000_000_000);
    expect(result).toEqual({ applied: false, reason: 'already-terminal' });
    expect(projectDoc(doc).rounds[0]!.status).toBe('revealed');
  });

  it('no-ops with no-current-round when no round exists', () => {
    const doc = seedDoc();
    expect(discardCurrentRound(doc, 'p-host', FIXED)).toEqual({
      applied: false,
      reason: 'no-current-round',
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: lost race no-ops instead of throwing; clock defaults to now
// ---------------------------------------------------------------------------

describe('round commands — gate behavior', () => {
  it('illegal transition no-ops instead of throwing (lost race)', () => {
    const doc = seedWithRound();
    revealCurrentRound(doc, FIXED);
    // A peer skip on an already-revealed round must not throw.
    expect(() => skipCurrentRound(doc, FIXED)).not.toThrow();
    expect(() => discardCurrentRound(doc, 'p-host', FIXED)).not.toThrow();
  });

  it('defaults the clock to Date.now when none is injected', () => {
    const doc = seedWithRound();
    const before = Date.now();
    const result = revealCurrentRound(doc);
    expect(result.applied).toBe(true);
    if (result.applied) {
      expect(result.at).toBeGreaterThanOrEqual(before);
      expect(result.at).toBeLessThanOrEqual(Date.now());
    }
  });
});
