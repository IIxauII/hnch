/**
 * Tests for the unanimous auto-reveal predicate (ADR-0018, ADR-0020,
 * ADR-0036, ADR-0041).
 *
 * This is the single test surface for the rule *and* the driver — the client
 * and CLI no longer own a copy of either. Every filter the predicate applies
 * (active roster, online, role, abstain denominator, terminal guard) is
 * exercised here, as is the driver's re-evaluation contract.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ABSTAIN_SENTINEL } from './abstain.js';
import { shouldAutoReveal, startAutoReveal } from './auto-reveal.js';
import type { Round, RoundStatus } from './doc.js';
import type { DocProjection, ParticipantSnapshot } from './doc-projection.js';

/** Build a participant snapshot with sensible defaults (active voter). */
function participant(
  id: string,
  overrides: Partial<ParticipantSnapshot> = {},
): ParticipantSnapshot {
  return { id, displayName: id, joinedAt: 0, ...overrides };
}

/** Convenience: an active voter that is also online. */
const voter = (id: string) => participant(id);
const viewer = (id: string) => participant(id, { role: 'viewer' });
const left = (id: string) => participant(id, { leftAt: 1000, removedBy: 'host' });

const round = (votes: Record<string, string>, status: RoundStatus = 'voting') => ({
  votes,
  status,
});

describe('shouldAutoReveal', () => {
  it('returns false when no round', () => {
    const ps = [voter('v1')];
    expect(shouldAutoReveal(null, ps, new Set(['v1']))).toBe(false);
    expect(shouldAutoReveal(undefined, ps, new Set(['v1']))).toBe(false);
  });

  it('returns false when the online set is empty', () => {
    expect(shouldAutoReveal(round({ v1: '5' }), [voter('v1')], new Set())).toBe(false);
  });

  it('returns true when all online voters have voted', () => {
    const ps = [voter('v1'), voter('v2')];
    expect(shouldAutoReveal(round({ v1: '5', v2: '8' }), ps, new Set(['v1', 'v2']))).toBe(true);
  });

  it('returns true for a single online voter who has voted', () => {
    expect(shouldAutoReveal(round({ v1: '5' }), [voter('v1')], new Set(['v1']))).toBe(true);
  });

  it('returns false when a non-voting online voter remains', () => {
    const ps = [voter('v1'), voter('v2')];
    // v2 is online but has not voted
    expect(shouldAutoReveal(round({ v1: '5' }), ps, new Set(['v1', 'v2']))).toBe(false);
  });

  it('excludes viewers from the denominator (ADR-0020)', () => {
    const ps = [voter('v1'), viewer('view1')];
    // Only the voter counts; viewer has no vote and is ignored.
    expect(shouldAutoReveal(round({ v1: '5' }), ps, new Set(['v1', 'view1']))).toBe(true);
  });

  it('excludes offline participants from the denominator', () => {
    const ps = [voter('v1'), voter('v2')];
    // v2 is in the roster but not online → not counted.
    expect(shouldAutoReveal(round({ v1: '5' }), ps, new Set(['v1']))).toBe(true);
  });

  // ADR-0036 — active roster
  it('excludes an online voter with `leftAt` set from the denominator', () => {
    const ps = [voter('v1'), left('gone')];
    // 'gone' is kicked-but-still-connected; must not count toward unanimity.
    expect(shouldAutoReveal(round({ v1: '5' }), ps, new Set(['v1', 'gone']))).toBe(true);
  });

  // ADR-0041 — abstain math
  it('excludes abstainers from numerator and denominator', () => {
    const ps = [voter('v1'), voter('v2')];
    // v2 abstained; v1 voted numerically → unanimous among non-abstainers.
    expect(
      shouldAutoReveal(round({ v1: '5', v2: ABSTAIN_SENTINEL }), ps, new Set(['v1', 'v2'])),
    ).toBe(true);
  });

  it('returns false when all online voters abstained (denominator 0)', () => {
    const ps = [voter('v1'), voter('v2')];
    expect(
      shouldAutoReveal(
        round({ v1: ABSTAIN_SENTINEL, v2: ABSTAIN_SENTINEL }),
        ps,
        new Set(['v1', 'v2']),
      ),
    ).toBe(false);
  });

  it('returns false when one abstains, one votes, and one has not voted', () => {
    const ps = [voter('v1'), voter('v2'), voter('v3')];
    expect(
      shouldAutoReveal(round({ v1: ABSTAIN_SENTINEL, v2: '5' }), ps, new Set(['v1', 'v2', 'v3'])),
    ).toBe(false);
  });

  // Terminal guard
  it('returns false when the round is already revealed', () => {
    expect(shouldAutoReveal(round({ v1: '5' }, 'revealed'), [voter('v1')], new Set(['v1']))).toBe(
      false,
    );
  });

  it('returns false when the round is skipped', () => {
    expect(shouldAutoReveal(round({ v1: '5' }, 'skipped'), [voter('v1')], new Set(['v1']))).toBe(
      false,
    );
  });

  it('returns false when the round is discarded', () => {
    expect(shouldAutoReveal(round({ v1: '5' }, 'discarded'), [voter('v1')], new Set(['v1']))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/**
 * Minimal projection builder — the driver only reads `participants` and
 * `rounds` (via `currentRound`).
 */
function projection(rounds: Round[], participants: ParticipantSnapshot[]): DocProjection {
  return {
    meta: {} as DocProjection['meta'],
    settings: {
      defaultScale: [] as unknown as DocProjection['settings']['defaultScale'],
    } as DocProjection['settings'],
    participants,
    rounds,
    agenda: [],
  };
}

/** A projection round: `currentRound` reads `status`, the predicate reads `votes`. */
function projRound(
  id: string,
  votes: Record<string, string>,
  status: RoundStatus = 'voting',
): Round {
  return {
    id,
    scale: { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] },
    votes,
    createdAt: 0,
    createdBy: 'v1',
    status,
  };
}

/** Stand up a driver against mutable state, as an adapter would. */
function makeDeps(init: {
  rounds: Round[];
  participants: ParticipantSnapshot[];
  online: string[];
  /** Whether awareness can be believed. Default: yes. */
  trusted?: boolean;
  /** This peer. Default: `v1`. */
  selfId?: string | null;
}) {
  let current: DocProjection | null = projection(init.rounds, init.participants);
  let online: ReadonlySet<string> = new Set(init.online);
  let trusted = init.trusted ?? true;
  let notify: (() => void) | null = null;

  const reveal = vi.fn();
  const unsubscribed = vi.fn();

  const deps = {
    projection: () => current,
    onlineIds: () => online,
    presenceTrusted: () => trusted,
    selfId: () => (init.selfId === undefined ? 'v1' : init.selfId),
    subscribe: (cb: () => void) => {
      notify = cb;
      return () => {
        notify = null;
        unsubscribed();
      };
    },
    reveal,
  };

  /** Apply a change and fire the driver's notification, as an adapter would. */
  function change(next: {
    rounds?: Round[];
    participants?: ParticipantSnapshot[];
    online?: string[];
    trusted?: boolean;
    projection?: null;
  }): void {
    if (next.trusted !== undefined) trusted = next.trusted;
    if (next.projection === null) {
      current = null;
    } else if (next.rounds !== undefined || next.participants !== undefined) {
      current = projection(
        next.rounds ?? [...(current?.rounds ?? [])],
        next.participants ?? [...(current?.participants ?? [])],
      );
    }
    if (next.online !== undefined) online = new Set(next.online);
    notify?.();
  }

  return { deps, reveal, unsubscribed, change };
}

const PAIR = [voter('v1'), voter('v2')];

describe('startAutoReveal', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('unanimity already present at construction → reveals on the initial evaluation', () => {
    const { deps, reveal } = makeDeps({
      rounds: [projRound('r1', { v1: '5', v2: '8' })],
      participants: PAIR,
      online: ['v1', 'v2'],
    });

    const handle = startAutoReveal(deps);

    expect(reveal).toHaveBeenCalledOnce();
    handle.stop();
  });

  it('a missing vote holds the reveal until the last vote lands', () => {
    const { deps, reveal, change } = makeDeps({
      rounds: [projRound('r1', { v1: '5' })],
      participants: PAIR,
      online: ['v1', 'v2'],
    });

    const handle = startAutoReveal(deps);
    expect(reveal).not.toHaveBeenCalled();

    change({ rounds: [projRound('r1', { v1: '5', v2: '8' })] });

    expect(reveal).toHaveBeenCalledOnce();
    handle.stop();
  });

  it('an awareness-only change can fire the reveal — the doc never moves', () => {
    // v2 is online and has not voted, so v1's vote is not yet unanimous.
    // v2 dropping out of awareness shrinks the denominator to {v1}, which
    // is already satisfied. This is why `subscribe` must cover awareness.
    const { deps, reveal, change } = makeDeps({
      rounds: [projRound('r1', { v1: '5' })],
      participants: PAIR,
      online: ['v1', 'v2'],
    });

    const handle = startAutoReveal(deps);
    expect(reveal).not.toHaveBeenCalled();

    change({ online: ['v1'] });

    expect(reveal).toHaveBeenCalledOnce();
    handle.stop();
  });

  it('a kicked-but-lingering voter neither blocks nor fires twice (participants-only change)', () => {
    // Awareness never changes: v2 stays "online" throughout. Only the
    // participants map moves — the same drift axis election.ts warns about.
    const { deps, reveal, change } = makeDeps({
      rounds: [projRound('r1', { v1: '5' })],
      participants: PAIR,
      online: ['v1', 'v2'],
    });

    const handle = startAutoReveal(deps);
    expect(reveal).not.toHaveBeenCalled();

    change({ participants: [voter('v1'), left('v2')] });

    expect(reveal).toHaveBeenCalledOnce();
    handle.stop();
  });

  it('does not re-fire once the round is revealed', () => {
    const { deps, reveal, change } = makeDeps({
      rounds: [projRound('r1', { v1: '5', v2: '8' })],
      participants: PAIR,
      online: ['v1', 'v2'],
    });

    const handle = startAutoReveal(deps);
    expect(reveal).toHaveBeenCalledOnce();

    // The write lands and comes back through the projection, as it would
    // via the adapter's doc observer. The predicate's terminal guard is the
    // only thing stopping a second call — the driver keeps no dedupe state.
    change({ rounds: [projRound('r1', { v1: '5', v2: '8' }, 'revealed')] });
    change({ rounds: [projRound('r1', { v1: '5', v2: '8' }, 'revealed')] });

    expect(reveal).toHaveBeenCalledOnce();
    handle.stop();
  });

  it('evaluates the current round, so a fresh round after a terminal one is picked up', () => {
    const { deps, reveal, change } = makeDeps({
      rounds: [projRound('r1', { v1: '5', v2: '8' }, 'revealed')],
      participants: PAIR,
      online: ['v1', 'v2'],
    });

    const handle = startAutoReveal(deps);
    expect(reveal).not.toHaveBeenCalled();

    change({
      rounds: [
        projRound('r1', { v1: '5', v2: '8' }, 'revealed'),
        projRound('r2', { v1: '3', v2: '3' }),
      ],
    });

    expect(reveal).toHaveBeenCalledOnce();
    handle.stop();
  });

  it('a null projection is inert', () => {
    const { deps, reveal, change } = makeDeps({
      rounds: [projRound('r1', { v1: '5' })],
      participants: PAIR,
      online: ['v1', 'v2'],
    });

    const handle = startAutoReveal(deps);
    change({ projection: null });

    expect(reveal).not.toHaveBeenCalled();
    handle.stop();
  });

  it('stop() unsubscribes and later notifications are inert', () => {
    const { deps, reveal, unsubscribed, change } = makeDeps({
      rounds: [projRound('r1', { v1: '5' })],
      participants: PAIR,
      online: ['v1', 'v2'],
    });

    const handle = startAutoReveal(deps);
    handle.stop();

    expect(unsubscribed).toHaveBeenCalledOnce();

    change({ rounds: [projRound('r1', { v1: '5', v2: '8' })] });

    expect(reveal).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The trust gate. Awareness is cleared when a socket closes and refilled by
// the relay once the next one has synced; in between, "everyone online has
// voted" is true of a peer that has voted and sees nobody else.
// ---------------------------------------------------------------------------

describe('startAutoReveal — presence that cannot be trusted', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not reveal on what awareness says right after a drop', () => {
    // v1 has voted, v2 has not. The socket drops: awareness is down to v1.
    const { deps, reveal, change } = makeDeps({
      rounds: [projRound('r1', { v1: '5' })],
      participants: PAIR,
      online: ['v1', 'v2'],
    });
    const handle = startAutoReveal(deps);

    change({ trusted: false, online: ['v1'] });

    expect(reveal).not.toHaveBeenCalled();
    handle.stop();
  });

  it('does not reveal on construction either: a reload in the middle of a round', () => {
    const { deps, reveal } = makeDeps({
      rounds: [projRound('r1', { v1: '5' })],
      participants: PAIR,
      online: ['v1'],
      trusted: false,
    });

    const handle = startAutoReveal(deps);

    expect(reveal).not.toHaveBeenCalled();
    handle.stop();
  });

  it('holds its verdict until the relay has said who is here', () => {
    const { deps, reveal, change } = makeDeps({
      rounds: [projRound('r1', { v1: '5' })],
      participants: PAIR,
      online: ['v1'],
      trusted: false,
    });
    const handle = startAutoReveal(deps);

    // Synced: v2 is here after all, and has not voted.
    change({ trusted: true, online: ['v1', 'v2'] });

    expect(reveal).not.toHaveBeenCalled();
    handle.stop();
  });

  it('reveals a round that went unanimous while this peer was away', () => {
    const { deps, reveal, change } = makeDeps({
      rounds: [projRound('r1', { v1: '5' })],
      participants: PAIR,
      online: ['v1'],
      trusted: false,
    });
    const handle = startAutoReveal(deps);

    change({
      trusted: true,
      online: ['v1', 'v2'],
      rounds: [projRound('r1', { v1: '5', v2: '8' })],
    });

    expect(reveal).toHaveBeenCalledOnce();
    handle.stop();
  });

  it('evaluates a session nobody else is part of, trusted or not', () => {
    // Nobody to miscount: a solo round still reveals while offline.
    const { deps, reveal, change } = makeDeps({
      rounds: [projRound('r1', {})],
      participants: [voter('v1')],
      online: ['v1'],
      trusted: false,
    });
    const handle = startAutoReveal(deps);
    expect(reveal).not.toHaveBeenCalled();

    change({ rounds: [projRound('r1', { v1: '5' })] });

    expect(reveal).toHaveBeenCalledOnce();
    handle.stop();
  });

  it('does not count someone who left as a peer', () => {
    const { deps, reveal } = makeDeps({
      rounds: [projRound('r1', { v1: '5' })],
      participants: [voter('v1'), left('v2')],
      online: ['v1'],
      trusted: false,
    });

    const handle = startAutoReveal(deps);

    expect(reveal).toHaveBeenCalledOnce();
    handle.stop();
  });

  it('takes any other active participant for a peer before it has an id of its own', () => {
    const { deps, reveal } = makeDeps({
      rounds: [projRound('r1', { v1: '5' })],
      participants: [voter('v1')],
      online: ['v1'],
      trusted: false,
      selfId: null,
    });

    const handle = startAutoReveal(deps);

    expect(reveal).not.toHaveBeenCalled();
    handle.stop();
  });
});
