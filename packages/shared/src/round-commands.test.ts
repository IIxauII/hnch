import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

import { FIBONACCI_SCALE } from './doc.js';
import { appendRound, initDoc, projectDoc } from './doc-projection.js';
import { revealCurrentRound, skipCurrentRound, discardCurrentRound } from './round-commands.js';

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
