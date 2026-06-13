import { describe, expect, it } from 'vitest';

import type { DocProjection } from './doc-projection.js';
import type { ParticipantSnapshot } from './doc-projection.js';
import { evaluateElection, resolvePromotion } from './election.js';

// ---------------------------------------------------------------------------
// Minimal projection builder — the election fns only read
// `settings.hostParticipantId` and `participants[].{id,leftAt}`.
// ---------------------------------------------------------------------------

function participant(id: string, leftAt?: number): ParticipantSnapshot {
  return { id, displayName: id, joinedAt: 0, ...(leftAt !== undefined ? { leftAt } : {}) };
}

function projection(hostId: string, participants: ParticipantSnapshot[]): DocProjection {
  return {
    meta: {} as DocProjection['meta'],
    settings: {
      defaultScale: [] as unknown as DocProjection['settings']['defaultScale'],
      hostParticipantId: hostId,
    },
    participants,
    rounds: [],
    agenda: [],
  };
}

describe('evaluateElection', () => {
  type Case = {
    name: string;
    hostId: string;
    participants: ParticipantSnapshot[];
    online: string[];
    prevMissing: string | null;
    expected: ReturnType<typeof evaluateElection>;
  };

  const cases: Case[] = [
    {
      name: 'no host set → none',
      hostId: '',
      participants: [participant('a')],
      online: ['a'],
      prevMissing: null,
      expected: { kind: 'none' },
    },
    {
      name: 'host online and active → cancel',
      hostId: 'host',
      participants: [participant('host'), participant('a')],
      online: ['host', 'a'],
      prevMissing: 'host',
      expected: { kind: 'cancel' },
    },
    {
      name: 'host absent, none debouncing → start-debounce',
      hostId: 'host',
      participants: [participant('host'), participant('a')],
      online: ['a'],
      prevMissing: null,
      expected: { kind: 'start-debounce', hostId: 'host' },
    },
    {
      name: 'host absent, same host already debouncing → none',
      hostId: 'host',
      participants: [participant('host'), participant('a')],
      online: ['a'],
      prevMissing: 'host',
      expected: { kind: 'none' },
    },
    {
      name: 'host absent, different host was debouncing → restart-on-different-missing-host',
      hostId: 'host',
      participants: [participant('host'), participant('a')],
      online: ['a'],
      prevMissing: 'old-host',
      expected: { kind: 'start-debounce', hostId: 'host' },
    },
    {
      name: 'kicked-host-lingering: host online but leftAt set → not eligible → start-debounce',
      hostId: 'host',
      participants: [participant('host', 1000), participant('a')],
      online: ['host', 'a'],
      prevMissing: null,
      expected: { kind: 'start-debounce', hostId: 'host' },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = evaluateElection(projection(c.hostId, c.participants), new Set(c.online), {
        missingHostId: c.prevMissing,
      });
      expect(result).toEqual(c.expected);
    });
  }
});

describe('resolvePromotion', () => {
  type Case = {
    name: string;
    hostId: string;
    participants: ParticipantSnapshot[];
    online: string[];
    myId: string;
    cachedMissing: string | null;
    expected: ReturnType<typeof resolvePromotion>;
  };

  const cases: Case[] = [
    {
      name: 'no cached missing → no promote',
      hostId: 'host',
      participants: [participant('host'), participant('a')],
      online: ['a'],
      myId: 'a',
      cachedMissing: null,
      expected: { promote: false },
    },
    {
      name: 'host changed since debounce started → no promote',
      hostId: 'new-host',
      participants: [participant('new-host'), participant('a')],
      online: ['a'],
      myId: 'a',
      cachedMissing: 'old-host',
      expected: { promote: false },
    },
    {
      name: 'host came back (online+active) → no promote',
      hostId: 'host',
      participants: [participant('host'), participant('a')],
      online: ['host', 'a'],
      myId: 'a',
      cachedMissing: 'host',
      expected: { promote: false },
    },
    {
      name: 'empty online set → no promote',
      hostId: 'host',
      participants: [participant('host'), participant('a')],
      online: [],
      myId: 'a',
      cachedMissing: 'host',
      expected: { promote: false },
    },
    {
      name: 'winner == me → promote',
      hostId: 'host',
      participants: [participant('host'), participant('a'), participant('b')],
      online: ['a', 'b'],
      myId: 'a',
      cachedMissing: 'host',
      expected: { promote: true, winner: 'a' },
    },
    {
      name: 'winner != me → no promote',
      hostId: 'host',
      participants: [participant('host'), participant('a'), participant('b')],
      online: ['a', 'b'],
      myId: 'b',
      cachedMissing: 'host',
      expected: { promote: false },
    },
    {
      name: 'kicked-peer-lingering: lex-lowest is kicked → excluded, next wins',
      hostId: 'host',
      participants: [participant('host'), participant('a', 1000), participant('b')],
      online: ['a', 'b'],
      myId: 'b',
      cachedMissing: 'host',
      expected: { promote: true, winner: 'b' },
    },
    {
      name: 'kicked-peer-lingering: kicked peer cannot win even if lex-lowest and is me',
      hostId: 'host',
      participants: [participant('host'), participant('a', 1000), participant('b')],
      online: ['a', 'b'],
      myId: 'a',
      cachedMissing: 'host',
      expected: { promote: false },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = resolvePromotion(
        projection(c.hostId, c.participants),
        new Set(c.online),
        c.myId,
        c.cachedMissing,
      );
      expect(result).toEqual(c.expected);
    });
  }
});
