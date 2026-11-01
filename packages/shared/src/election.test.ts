import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocProjection } from './doc-projection.js';
import type { ParticipantSnapshot } from './doc-projection.js';
import {
  evaluateElection,
  resolvePromotion,
  startElection,
  HOST_ABSENCE_ELECTION_DEBOUNCE_MS,
} from './election.js';

// Minimal projection builder — the election fns only read
// `settings.hostParticipantId` and `participants[].{id,leftAt}`.

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

// Driver behaviour — fake deps + fake timers. No Y.Doc, no framework.

function makeDeps(init: {
  hostId: string;
  participants: ParticipantSnapshot[];
  online: string[];
  myId?: string | null;
}) {
  let currentProjection: DocProjection | null = projection(init.hostId, init.participants);
  let online: ReadonlySet<string> = new Set(init.online);
  let myId: string | null = init.myId === undefined ? 'peer-a' : init.myId;
  let notify: (() => void) | null = null;

  const promote = vi.fn<[string], void>();
  const unsubscribed = vi.fn();

  const deps = {
    projection: () => currentProjection,
    onlineIds: () => online,
    myId: () => myId,
    subscribe: (cb: () => void) => {
      notify = cb;
      return () => {
        notify = null;
        unsubscribed();
      };
    },
    promote,
  };

  /** Apply a change and fire the driver's notification, as an adapter would. */
  function change(next: {
    hostId?: string;
    participants?: ParticipantSnapshot[];
    online?: string[];
    myId?: string | null;
    projection?: null;
  }): void {
    if (next.projection === null) {
      currentProjection = null;
    } else if (next.hostId !== undefined || next.participants !== undefined) {
      currentProjection = projection(
        next.hostId ?? currentProjection?.settings.hostParticipantId ?? init.hostId,
        next.participants ?? [...(currentProjection?.participants ?? [])],
      );
    }
    if (next.online !== undefined) online = new Set(next.online);
    if (next.myId !== undefined) myId = next.myId;
    notify?.();
  }

  return { deps, promote, unsubscribed, change };
}

const ROSTER = [participant('host'), participant('peer-a'), participant('peer-b')];

describe('startElection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('host online and active → nothing is armed', () => {
    const { deps, promote } = makeDeps({
      hostId: 'host',
      participants: ROSTER,
      online: ['host', 'peer-a', 'peer-b'],
    });

    const handle = startElection(deps);
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS * 2);

    expect(promote).not.toHaveBeenCalled();
    handle.stop();
  });

  it('host absent at construction → initial evaluation arms the debounce', () => {
    const { deps, promote } = makeDeps({
      hostId: 'host',
      participants: ROSTER,
      online: ['peer-a', 'peer-b'],
    });

    const handle = startElection(deps);

    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS - 1);
    expect(promote).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(promote).toHaveBeenCalledExactlyOnceWith('peer-a');

    handle.stop();
  });

  it('host drops after construction → promotes the lex-lowest eligible peer', () => {
    const { deps, promote, change } = makeDeps({
      hostId: 'host',
      participants: ROSTER,
      online: ['host', 'peer-a', 'peer-b'],
      myId: 'peer-a',
    });

    const handle = startElection(deps);
    change({ online: ['peer-a', 'peer-b'] });

    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);
    expect(promote).toHaveBeenCalledExactlyOnceWith('peer-a');

    handle.stop();
  });

  it('host returns online and active before the debounce elapses → cancelled', () => {
    const { deps, promote, change } = makeDeps({
      hostId: 'host',
      participants: ROSTER,
      online: ['host', 'peer-a', 'peer-b'],
    });

    const handle = startElection(deps);
    change({ online: ['peer-a', 'peer-b'] });
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS - 1);

    change({ online: ['host', 'peer-a', 'peer-b'] });
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS * 2);

    expect(promote).not.toHaveBeenCalled();
    handle.stop();
  });

  it('a different host goes missing mid-debounce → the timer re-keys to it', () => {
    const { deps, promote, change } = makeDeps({
      hostId: 'host',
      participants: ROSTER,
      online: ['peer-a', 'peer-b'],
    });

    const handle = startElection(deps); // armed for 'host'

    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS - 1);
    // A promotion lands elsewhere: 'peer-b' is now host, and also absent.
    change({ hostId: 'peer-b', online: ['peer-a'] });

    // The original window elapses — the re-keyed timer must not have fired yet.
    vi.advanceTimersByTime(1);
    expect(promote).not.toHaveBeenCalled();

    // The full window from the re-key does fire.
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS - 1);
    expect(promote).toHaveBeenCalledExactlyOnceWith('peer-a');

    handle.stop();
  });

  it('caller is not the winner → stands down without writing', () => {
    const { deps, promote } = makeDeps({
      hostId: 'host',
      participants: ROSTER,
      online: ['peer-a', 'peer-b'],
      myId: 'peer-b',
    });

    const handle = startElection(deps);
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);

    expect(promote).not.toHaveBeenCalled();
    handle.stop();
  });

  it('no eligible peers when the debounce fires → no promotion', () => {
    const { deps, promote, change } = makeDeps({
      hostId: 'host',
      participants: ROSTER,
      online: ['host', 'peer-a'],
    });

    const handle = startElection(deps);
    change({ online: [] });
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);

    expect(promote).not.toHaveBeenCalled();
    handle.stop();
  });

  it('kicked-but-lingering host is ineligible → election runs on a participants-only change', () => {
    // Awareness never changes: the host stays "online" throughout. Only the
    // participants map moves. This is the drift that made the CLI sit with a
    // dead host — the driver must re-evaluate on it.
    const { deps, promote, change } = makeDeps({
      hostId: 'host',
      participants: ROSTER,
      online: ['host', 'peer-a', 'peer-b'],
    });

    const handle = startElection(deps);
    change({
      participants: [participant('host', 1000), participant('peer-a'), participant('peer-b')],
    });

    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);
    expect(promote).toHaveBeenCalledExactlyOnceWith('peer-a');

    handle.stop();
  });

  it('kicked-but-lingering peer neither wins nor blocks', () => {
    const { deps, promote } = makeDeps({
      hostId: 'host',
      // 'peer-a' is lex-lowest but was kicked; its awareness entry lingers.
      participants: [participant('host'), participant('peer-a', 1000), participant('peer-b')],
      online: ['peer-a', 'peer-b'],
      myId: 'peer-b',
    });

    const handle = startElection(deps);
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS);

    expect(promote).toHaveBeenCalledExactlyOnceWith('peer-b');
    handle.stop();
  });

  it('projection going null cancels an armed timer', () => {
    const { deps, promote, change } = makeDeps({
      hostId: 'host',
      participants: ROSTER,
      online: ['peer-a', 'peer-b'],
    });

    const handle = startElection(deps);
    change({ projection: null });
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS * 2);

    expect(promote).not.toHaveBeenCalled();
    handle.stop();
  });

  it('own id going null cancels an armed timer', () => {
    const { deps, promote, change } = makeDeps({
      hostId: 'host',
      participants: ROSTER,
      online: ['peer-a', 'peer-b'],
    });

    const handle = startElection(deps);
    change({ myId: null });
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS * 2);

    expect(promote).not.toHaveBeenCalled();
    handle.stop();
  });

  it('stop() clears an armed timer and unsubscribes', () => {
    const { deps, promote, unsubscribed, change } = makeDeps({
      hostId: 'host',
      participants: ROSTER,
      online: ['peer-a', 'peer-b'],
    });

    const handle = startElection(deps);
    handle.stop();

    expect(unsubscribed).toHaveBeenCalledOnce();

    change({ online: ['peer-a'] }); // notify is detached — must be inert
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS * 2);

    expect(promote).not.toHaveBeenCalled();
  });
});
