import { describe, expect, it, vi } from 'vitest';

import type { DocProjection, ParticipantSnapshot } from './doc-projection.js';
import { startSessionEvents, type SessionEvent } from './session-events.js';

// ---------------------------------------------------------------------------
// Fixtures — plain projections, as the election and auto-reveal suites use.
// The driver reads `meta.{createdBy,sessionEndedAt}`,
// `settings.hostParticipantId` and `participants[]`.
// ---------------------------------------------------------------------------

const SELF = 'p-self';

function person(
  id: string,
  displayName: string,
  extra: { leftAt?: number; removedBy?: string } = {},
): ParticipantSnapshot {
  return { id, displayName, joinedAt: 0, ...extra };
}

interface State {
  hostId?: string;
  createdBy?: string;
  sessionEndedAt?: number;
  participants?: ParticipantSnapshot[];
}

function projection(state: State): DocProjection {
  return {
    meta: {
      roomUuid: 'room',
      createdAt: 0,
      createdBy: state.createdBy ?? 'p-creator',
      ...(state.sessionEndedAt !== undefined && { sessionEndedAt: state.sessionEndedAt }),
    },
    // `hostParticipantId` is typed as a string but is absent at runtime for a
    // joiner before sync — the fixture reproduces that.
    settings: {
      defaultScale: [] as unknown as DocProjection['settings']['defaultScale'],
      ...(state.hostId !== undefined && { hostParticipantId: state.hostId }),
    } as DocProjection['settings'],
    participants: state.participants ?? [],
    rounds: [],
    agenda: [],
  };
}

/** Stand up a driver against mutable readings, as an adapter would. */
function makeDeps(
  init: State & {
    online?: string[];
    trusted?: boolean;
    firstSync?: boolean;
    endedLocally?: boolean;
  },
) {
  let state: State = { ...init };
  let current: DocProjection | null = projection(state);
  let online: ReadonlySet<string> = new Set(init.online ?? []);
  let trusted = init.trusted ?? true;
  let firstSync = init.firstSync ?? true;
  let endedLocally = init.endedLocally ?? false;
  let notify: (() => void) | null = null;

  const events: SessionEvent[] = [];
  const unsubscribed = vi.fn();

  const deps = {
    projection: () => current,
    onlineIds: () => online,
    presenceTrusted: () => trusted,
    firstSyncCompleted: () => firstSync,
    endedLocally: () => endedLocally,
    selfId: SELF,
    subscribe: (cb: () => void) => {
      notify = cb;
      return () => {
        notify = null;
        unsubscribed();
      };
    },
    emit: (event: SessionEvent) => {
      events.push(event);
    },
  };

  /** Apply a change and fire the driver's notification, as an adapter would. */
  function change(
    next: State & {
      online?: string[];
      trusted?: boolean;
      firstSync?: boolean;
      projection?: null;
    },
  ): void {
    const { online: nextOnline, trusted: nextTrusted, firstSync: nextSync, ...doc } = next;
    if (nextTrusted !== undefined) trusted = nextTrusted;
    if (nextSync !== undefined) firstSync = nextSync;
    if (nextOnline !== undefined) online = new Set(nextOnline);
    if ('projection' in next && next.projection === null) {
      current = null;
    } else {
      state = { ...state, ...doc };
      current = projection(state);
    }
    notify?.();
  }

  /** Replace one field outright — `change` merges, so it cannot remove one. */
  function without(key: keyof State): void {
    const { [key]: _dropped, ...rest } = state;
    state = rest;
    current = projection(state);
    notify?.();
  }

  return {
    deps,
    events,
    unsubscribed,
    change,
    without,
    setEndedLocally: (v: boolean) => {
      endedLocally = v;
    },
  };
}

/** Let the driver's deferred delivery run. */
const settle = (): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, 0);
  });

const HOST = person('p-host', 'Hana');
const CREATOR = person('p-creator', 'Cleo');
const ME = person(SELF, 'Sam');

// ---------------------------------------------------------------------------
// ended
// ---------------------------------------------------------------------------

describe('startSessionEvents — ended', () => {
  it('delivers an end already in the projection at start, before the first sync, never synchronously (ADR-0023 §5)', async () => {
    const { deps, events } = makeDeps({
      hostId: 'p-host',
      sessionEndedAt: 100,
      participants: [HOST, ME],
      firstSync: false,
    });

    const handle = startSessionEvents(deps);
    expect(events).toEqual([]);

    await settle();
    expect(events).toEqual([
      {
        kind: 'ended',
        endedAt: 100,
        endedLocally: false,
        hostId: 'p-host',
        hostName: 'Hana',
        message: 'Session ended by Hana',
      },
    ]);
    handle.stop();
  });

  it('fires once per distinct sessionEndedAt; the same value again is silent, a new one fires again', async () => {
    const { deps, events, change, without } = makeDeps({
      hostId: 'p-host',
      participants: [HOST, ME],
    });
    const handle = startSessionEvents(deps);

    change({ sessionEndedAt: 100 });
    change({ sessionEndedAt: 100 });
    await settle();
    change({ participants: [HOST, ME] });
    await settle();
    expect(events.map((e) => e.kind === 'ended' && e.endedAt)).toEqual([100]);

    change({ sessionEndedAt: 200 });
    await settle();
    expect(events.map((e) => e.kind === 'ended' && e.endedAt)).toEqual([100, 200]);

    // An absent field re-arms the tracker: the same value fires once more.
    without('sessionEndedAt');
    change({ sessionEndedAt: 200 });
    await settle();
    expect(events.map((e) => e.kind === 'ended' && e.endedAt)).toEqual([100, 200, 200]);
    handle.stop();
  });

  it.each([
    {
      name: 'the host',
      participants: [HOST, CREATOR, ME],
      expected: { hostId: 'p-host', hostName: 'Hana', message: 'Session ended by Hana' },
    },
    {
      name: 'the creator when the host has no record',
      participants: [CREATOR, ME],
      expected: { hostId: 'p-host', hostName: 'Cleo', message: 'Session ended by Cleo' },
    },
    {
      name: 'the creator when the host name is empty',
      participants: [person('p-host', ''), CREATOR, ME],
      expected: { hostId: 'p-host', hostName: 'Cleo', message: 'Session ended by Cleo' },
    },
    {
      name: '"Host" when neither has a name',
      participants: [person('p-host', ''), person('p-creator', ''), ME],
      expected: { hostId: 'p-host', hostName: 'Host', message: 'Session ended by Host' },
    },
    {
      name: '"Host" when neither has a record',
      participants: [ME],
      expected: { hostId: 'p-host', hostName: 'Host', message: 'Session ended by Host' },
    },
  ])('a remote end names $name, with no trailing period', async ({ participants, expected }) => {
    const { deps, events, change } = makeDeps({ hostId: 'p-host', participants });
    const handle = startSessionEvents(deps);

    change({ sessionEndedAt: 100 });
    await settle();

    expect(events).toEqual([{ kind: 'ended', endedAt: 100, endedLocally: false, ...expected }]);
    handle.stop();
  });

  it('a session with no host names the creator, and carries hostId null', async () => {
    const { deps, events, change } = makeDeps({ participants: [CREATOR, ME] });
    const handle = startSessionEvents(deps);

    change({ sessionEndedAt: 100 });
    await settle();

    expect(events).toEqual([
      {
        kind: 'ended',
        endedAt: 100,
        endedLocally: false,
        hostId: null,
        hostName: 'Cleo',
        message: 'Session ended by Cleo',
      },
    ]);
    handle.stop();
  });

  it('the host\'s own end reads "Session ended." even though endedLocally turns true only after the change was notified', async () => {
    const { deps, events, change, setEndedLocally } = makeDeps({
      hostId: SELF,
      createdBy: SELF,
      participants: [ME],
    });
    const handle = startSessionEvents(deps);

    // As `endSessionForEveryone` does it: the write notifies, then the
    // caller records that it applied.
    change({ sessionEndedAt: 100 });
    setEndedLocally(true);
    await settle();

    expect(events).toEqual([
      {
        kind: 'ended',
        endedAt: 100,
        endedLocally: true,
        hostId: SELF,
        hostName: 'Sam',
        message: 'Session ended.',
      },
    ]);
    handle.stop();
  });

  it('a creator who is no longer host and did not end it is told who did', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-host',
      createdBy: SELF,
      participants: [HOST, ME],
    });
    const handle = startSessionEvents(deps);

    change({ sessionEndedAt: 100 });
    await settle();

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'ended',
        endedLocally: false,
        message: 'Session ended by Hana',
      }),
    ]);
    handle.stop();
  });

  it('stop() drops a pending end, delivers nothing after, is idempotent and unsubscribes once', async () => {
    const { deps, events, change, unsubscribed } = makeDeps({
      hostId: 'p-host',
      participants: [HOST, ME],
    });
    const handle = startSessionEvents(deps);

    change({ sessionEndedAt: 100 });
    handle.stop();
    await settle();
    change({ sessionEndedAt: 200 });
    await settle();

    expect(events).toEqual([]);
    handle.stop();
    expect(unsubscribed).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// host changed
// ---------------------------------------------------------------------------

const BOB = person('p-bob', 'Bob');
const ALICE = person('p-alice', 'Alice');

describe('startSessionEvents — host changed, no event', () => {
  it('the first host seen is a seed, not a change', async () => {
    const { deps, events } = makeDeps({ hostId: 'p-bob', participants: [BOB, ME] });
    const handle = startSessionEvents(deps);
    await settle();
    expect(events).toEqual([]);
    handle.stop();
  });

  it('a joiner whose first projection has no host, and whose host arrives with the sync, sees no change', async () => {
    const { deps, events, change } = makeDeps({ participants: [ME], firstSync: false });
    const handle = startSessionEvents(deps);

    change({ hostId: 'p-bob', participants: [BOB, ME], firstSync: true });
    await settle();

    expect(events).toEqual([]);
    handle.stop();
  });

  it('an absent host re-arms the seed: the next host after it is not a change either', async () => {
    const { deps, events, change, without } = makeDeps({
      hostId: 'p-bob',
      participants: [BOB, ALICE, ME],
      online: ['p-bob', 'p-alice', SELF],
    });
    const handle = startSessionEvents(deps);

    without('hostId');
    change({ hostId: '' });
    change({ hostId: 'p-alice' });
    await settle();
    expect(events).toEqual([]);

    // …and a change after the new seed fires again.
    change({ hostId: 'p-bob' });
    await settle();
    expect(events).toHaveLength(1);
    handle.stop();
  });
});

describe('startSessionEvents — host changed, cause', () => {
  it('left: the previous host is inactive', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-bob',
      participants: [BOB, ALICE, ME],
      online: ['p-bob', 'p-alice', SELF],
    });
    const handle = startSessionEvents(deps);

    change({
      hostId: 'p-alice',
      participants: [person('p-bob', 'Bob', { leftAt: 5, removedBy: 'p-bob' }), ALICE, ME],
    });
    await settle();

    expect(events).toEqual([
      {
        kind: 'host-changed',
        previousHostId: 'p-bob',
        previousHostName: 'Bob',
        hostId: 'p-alice',
        hostName: 'Alice',
        cause: 'left',
        wasSelf: false,
        isSelf: false,
        message: 'Bob left. Alice is now the host.',
      },
    ]);
    handle.stop();
  });

  it('disconnected: presence is trusted and the previous host is offline', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-bob',
      participants: [BOB, ME],
      online: ['p-bob', SELF],
    });
    const handle = startSessionEvents(deps);

    change({ online: [SELF] });
    change({ hostId: SELF });
    await settle();

    expect(events).toEqual([
      {
        kind: 'host-changed',
        previousHostId: 'p-bob',
        previousHostName: 'Bob',
        hostId: SELF,
        hostName: 'Sam',
        cause: 'disconnected',
        wasSelf: false,
        isSelf: true,
        message: 'Bob disconnected. You are now the host.',
      },
    ]);
    handle.stop();
  });

  it('the same change while presence is untrusted gives no cause', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-bob',
      participants: [BOB, ME],
      online: ['p-bob', SELF],
    });
    const handle = startSessionEvents(deps);

    change({ trusted: false, online: [SELF] });
    change({ hostId: SELF });
    await settle();

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'host-changed',
        cause: null,
        message: 'You are now the host',
      }),
    ]);
    handle.stop();
  });

  it('a change carried in a reconnect sync gets its cause from the trust reported later in the same task', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-bob',
      participants: [BOB, ALICE, ME],
      online: ['p-bob', 'p-alice', SELF],
    });
    const handle = startSessionEvents(deps);

    // This peer drops; Bob drops too and Alice is elected while it is away.
    change({ trusted: false, online: [SELF] });
    // Reconnect: the relay's awareness states land first, then y-websocket
    // applies sync step 2 and only after that reports the sync, all in one task.
    change({ online: ['p-alice', SELF] });
    change({ hostId: 'p-alice' });
    change({ trusted: true });
    await settle();

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'host-changed',
        cause: 'disconnected',
        message: 'Bob disconnected. Alice is now the host.',
      }),
    ]);
    handle.stop();
  });

  it('a hand-off from a host who is present gives no cause', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-bob',
      participants: [BOB, ALICE, ME],
      online: ['p-bob', 'p-alice', SELF],
    });
    const handle = startSessionEvents(deps);

    change({ hostId: 'p-alice' });
    await settle();

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'host-changed',
        previousHostName: 'Bob',
        cause: null,
        message: 'Alice is now the host',
      }),
    ]);
    handle.stop();
  });

  it('a previous host with no record gives no cause and no previous name', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-ghost',
      participants: [ALICE, ME],
      online: ['p-alice', SELF],
    });
    const handle = startSessionEvents(deps);

    change({ hostId: 'p-alice' });
    await settle();

    expect(events).toEqual([
      {
        kind: 'host-changed',
        previousHostId: 'p-ghost',
        previousHostName: null,
        hostId: 'p-alice',
        hostName: 'Alice',
        cause: null,
        wasSelf: false,
        isSelf: false,
        message: 'Alice is now the host',
      },
    ]);
    handle.stop();
  });
});

describe('startSessionEvents — host changed, flags and names', () => {
  it('wasSelf: a host who handed off is told only who the host is now', async () => {
    const { deps, events, change } = makeDeps({
      hostId: SELF,
      participants: [ME, BOB],
      online: [SELF, 'p-bob'],
    });
    const handle = startSessionEvents(deps);

    // Even with a cause on hand (this peer's record has left), none is told.
    change({
      hostId: 'p-bob',
      participants: [person(SELF, 'Sam', { leftAt: 5, removedBy: SELF }), BOB],
    });
    await settle();

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'host-changed',
        previousHostId: SELF,
        cause: 'left',
        wasSelf: true,
        isSelf: false,
        message: 'Bob is now the host',
      }),
    ]);
    handle.stop();
  });

  it('an empty display name falls back to the participant id, for both hosts', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-bob',
      participants: [person('p-bob', ''), person('p-alice', ''), ME],
      online: [SELF],
    });
    const handle = startSessionEvents(deps);

    change({ hostId: 'p-alice' });
    await settle();

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'host-changed',
        previousHostName: 'p-bob',
        hostName: 'p-alice',
        cause: 'disconnected',
        message: 'p-bob disconnected. p-alice is now the host.',
      }),
    ]);
    handle.stop();
  });

  it('a new host with no record is named by its id', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-bob',
      participants: [BOB, ME],
      online: ['p-bob', SELF],
    });
    const handle = startSessionEvents(deps);

    change({ hostId: 'p-new' });
    await settle();

    expect(events).toEqual([
      expect.objectContaining({
        hostId: 'p-new',
        hostName: 'p-new',
        message: 'p-new is now the host',
      }),
    ]);
    handle.stop();
  });
});

// ---------------------------------------------------------------------------
// removed
// ---------------------------------------------------------------------------

const KICKED = (leftAt: number, by = 'p-host'): ParticipantSnapshot =>
  person(SELF, 'Sam', { leftAt, removedBy: by });

describe('startSessionEvents — removed, does not fire', () => {
  it('before the first sync: a removal carried in the snapshot is not a live kick (ADR-0036 §6)', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-host',
      participants: [HOST, ME],
      firstSync: false,
    });
    const handle = startSessionEvents(deps);

    change({ participants: [HOST, KICKED(10)] });
    await settle();
    expect(events).toEqual([]);

    // Nor once the sync lands with the same leftAt still there.
    change({ firstSync: true });
    await settle();
    expect(events).toEqual([]);
    handle.stop();
  });

  it('on a stale leftAt seen first, after the first sync', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-host',
      participants: [HOST, KICKED(10)],
    });
    const handle = startSessionEvents(deps);

    change({ participants: [HOST, KICKED(10)] });
    await settle();

    expect(events).toEqual([]);
    handle.stop();
  });

  it('on a voluntary leave (removedBy is this peer)', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-host',
      participants: [HOST, ME],
    });
    const handle = startSessionEvents(deps);

    change({ participants: [HOST, KICKED(10, SELF)] });
    await settle();

    expect(events).toEqual([]);
    handle.stop();
  });

  it('while this peer has no record yet', async () => {
    const { deps, events, change } = makeDeps({ hostId: 'p-host', participants: [HOST] });
    const handle = startSessionEvents(deps);

    change({ participants: [HOST, person('p-other', 'Ola', { leftAt: 5, removedBy: 'p-host' })] });
    await settle();

    expect(events).toEqual([]);
    handle.stop();
  });
});

describe('startSessionEvents — removed, fires', () => {
  it('once on an absent → set transition, with who removed this peer; the same leftAt again is silent', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-host',
      participants: [HOST, ME],
    });
    const handle = startSessionEvents(deps);

    change({ participants: [HOST, KICKED(10)] });
    change({ participants: [HOST, KICKED(10)] });
    await settle();
    change({ participants: [HOST, KICKED(10)] });
    await settle();

    expect(events).toEqual([
      {
        kind: 'removed',
        leftAt: 10,
        removedBy: 'p-host',
        removedByName: 'Hana',
        message: 'Removed by host',
      },
    ]);
    handle.stop();
  });

  it('a removal written after a rejoin fires again', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-host',
      participants: [HOST, ME],
    });
    const handle = startSessionEvents(deps);

    change({ participants: [HOST, KICKED(10)] });
    change({ participants: [HOST, ME] });
    change({ participants: [HOST, KICKED(20)] });
    await settle();

    expect(events.map((e) => e.kind === 'removed' && e.leftAt)).toEqual([10, 20]);
    handle.stop();
  });

  it('names the remover by id when it has no name, and carries nulls without a remover', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-host',
      participants: [person('p-host', ''), ME],
    });
    const handle = startSessionEvents(deps);

    change({ participants: [person('p-host', ''), KICKED(10)] });
    change({ participants: [person('p-host', ''), ME] });
    change({ participants: [person('p-host', ''), person(SELF, 'Sam', { leftAt: 20 })] });
    await settle();

    expect(events).toEqual([
      expect.objectContaining({ kind: 'removed', removedBy: 'p-host', removedByName: 'p-host' }),
      expect.objectContaining({ kind: 'removed', removedBy: null, removedByName: null }),
    ]);
    handle.stop();
  });

  it('after the first sync even when firstSyncCompleted reads false again later (the driver latches it)', async () => {
    const { deps, events, change } = makeDeps({
      hostId: 'p-host',
      participants: [HOST, ME],
      firstSync: false,
    });
    const handle = startSessionEvents(deps);

    change({ firstSync: true });
    change({ firstSync: false });
    change({ participants: [HOST, KICKED(10)] });
    await settle();

    expect(events).toEqual([expect.objectContaining({ kind: 'removed', leftAt: 10 })]);
    handle.stop();
  });
});

// ---------------------------------------------------------------------------
// delivery
// ---------------------------------------------------------------------------

describe('startSessionEvents — delivery', () => {
  /** A session one doc change can end, remove this peer from and re-host. */
  const allThreeAtOnce = () =>
    makeDeps({
      hostId: 'p-host',
      participants: [HOST, ALICE, ME],
      online: ['p-host', 'p-alice', SELF],
    });

  it('delivers one evaluation in the order ended, removed, host-changed, none of it synchronously', async () => {
    const { deps, events, change } = allThreeAtOnce();
    const handle = startSessionEvents(deps);

    change({ sessionEndedAt: 100, hostId: 'p-alice', participants: [HOST, ALICE, KICKED(10)] });
    expect(events).toEqual([]);
    await settle();

    expect(events.map((e) => e.kind)).toEqual(['ended', 'removed', 'host-changed']);
    handle.stop();
  });

  it('a sink that stops the driver on `ended` cuts off what is queued behind it', async () => {
    const { deps, events, change } = allThreeAtOnce();
    let handle: { stop(): void } | null = null;
    handle = startSessionEvents({
      ...deps,
      emit: (event) => {
        events.push(event);
        if (event.kind === 'ended') handle?.stop();
      },
    });

    change({ sessionEndedAt: 100, hostId: 'p-alice', participants: [HOST, ALICE, KICKED(10)] });
    await settle();

    expect(events.map((e) => e.kind)).toEqual(['ended']);
  });

  it('a sink that stops the driver on `removed` cuts off the host change behind it', async () => {
    const { deps, events, change } = allThreeAtOnce();
    let handle: { stop(): void } | null = null;
    handle = startSessionEvents({
      ...deps,
      emit: (event) => {
        events.push(event);
        if (event.kind === 'removed') handle?.stop();
      },
    });

    change({ hostId: 'p-alice', participants: [HOST, ALICE, KICKED(10)] });
    await settle();

    expect(events.map((e) => e.kind)).toEqual(['removed']);
  });

  it('a no-session reading evaluates nothing', async () => {
    const { deps, events, change } = makeDeps({ hostId: 'p-host', participants: [HOST, ME] });
    const handle = startSessionEvents(deps);

    change({ projection: null });
    await settle();

    expect(events).toEqual([]);
    handle.stop();
  });
});
