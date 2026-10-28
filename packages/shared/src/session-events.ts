/**
 * Session events — rule *and* driver (ADR-0023, ADR-0036 §5–6, ADR-0010).
 *
 * Three moments in a session need every peer to react, and this module is
 * where each is recognised, once, for both surfaces:
 *
 *  - **ended** — the host ended the session for everyone (ADR-0023);
 *  - **host changed** — there is a new host (hand-off, election, the host
 *    leaving), with the previous host and, where this peer can tell, why;
 *  - **removed** — the host removed *this* participant (ADR-0036 §5).
 *
 * The driver {@link startSessionEvents} owns *when* those rules re-evaluate
 * and what each event says. Consumers supply framework-free readings — the
 * projection, who is online, how far presence can be trusted, whether the
 * first sync is done, whether this peer ended the session itself — and one
 * sink. No `Y.Doc`, `Awareness`, Angular or Ink primitive crosses that seam.
 *
 * *When* is part of the rule here too, not adapter business. The two
 * surfaces used to work these out separately: the client in three app-level
 * effects that each re-read the doc, the CLI in raw Yjs observers. The CLI
 * copy fell behind — it never handled a removal, took "this peer created
 * the session" for "this peer ended it", and announced the host that
 * arrived with the first sync as a change. Each event now carries the text
 * to show, so both surfaces say the same thing at the same moment.
 */

import type { DocProjection, ParticipantSnapshot } from './doc-projection.js';
import { isActiveParticipant } from './doc.js';
import { formatHostChangeMessage, type HostChangeCause } from './host-change-message.js';

export type { HostChangeCause } from './host-change-message.js';

/** The session was ended for everyone (ADR-0023). */
export interface SessionEndedEvent {
  readonly kind: 'ended';
  /** `meta.sessionEndedAt`. One event per distinct value. */
  readonly endedAt: number;
  /**
   * This peer's own end-session write applied — never "this peer created the
   * session". Read from {@link SessionEventsDeps.endedLocally} at delivery.
   */
  readonly endedLocally: boolean;
  /** The host when the end was seen, or `null` when there is none. */
  readonly hostId: string | null;
  /** The host's name, else the creator's, else `'Host'`. */
  readonly hostName: string;
  /** The text to show. */
  readonly message: string;
}

/** There is a new host (ADR-0010): a hand-off, an election, the host leaving. */
export interface HostChangedEvent {
  readonly kind: 'host-changed';
  readonly previousHostId: string;
  /** The previous host's name, else its id; `null` when it has no record. */
  readonly previousHostName: string | null;
  readonly hostId: string;
  /** The new host's name, else its id. */
  readonly hostName: string;
  /** Why, where this peer can tell; `null` otherwise. See {@link HostChangeCause}. */
  readonly cause: HostChangeCause | null;
  /** The previous host is this peer. */
  readonly wasSelf: boolean;
  /** The new host is this peer. */
  readonly isSelf: boolean;
  /** The text to show. */
  readonly message: string;
}

/**
 * The host removed this participant (ADR-0036 §5). A voluntary leave never
 * raises it.
 */
export interface RemovedEvent {
  readonly kind: 'removed';
  readonly leftAt: number;
  /** Who removed this peer; `null` only for a `leftAt` without `removedBy`. */
  readonly removedBy: string | null;
  /** The remover's name, else its id; `null` when {@link removedBy} is. */
  readonly removedByName: string | null;
  /** The text to show. */
  readonly message: string;
}

/** The session event union, discriminated by `kind`. */
export type SessionEvent = SessionEndedEvent | HostChangedEvent | RemovedEvent;

/**
 * The readings a consumer supplies to drive session events. Deliberately
 * framework-free, mirroring the election and auto-reveal drivers: the client
 * passes signal reads, the CLI passes closures over its `Y.Doc` and
 * `Awareness`.
 */
export interface SessionEventsDeps {
  /**
   * Live doc snapshot, or `null` when no session is attached. A `null`
   * projection evaluates nothing and resets nothing — ending a session is
   * {@link SessionEventsHandle.stop}'s job.
   */
  projection(): DocProjection | null;
  /** Raw awareness set. Read only for the `disconnected` cause. */
  onlineIds(): ReadonlySet<string>;
  /**
   * Whether {@link onlineIds} can be believed right now: the relay's state
   * has applied on the *current* socket (`onSyncedChange` in `relay-client`,
   * ADR-0050). The live reading, not a sticky flag — the same one auto-reveal
   * is given.
   */
  presenceTrusted(): boolean;
  /**
   * Whether the relay's first snapshot has applied (ADR-0036 §6). The driver
   * latches it the first time it reads `true`, so the caller need not keep it
   * sticky.
   */
  firstSyncCompleted(): boolean;
  /**
   * `true` once *this peer's own* end-session write applied. Read when an
   * `ended` event is delivered, not when the end is seen, so a surface can
   * set it right after its end-session call returns.
   */
  endedLocally(): boolean;
  /** This peer's participant id, fixed for the driver's life. */
  readonly selfId: string;
  /**
   * Register `cb` to fire on *any* projection change, *any* awareness change
   * and *any* change of {@link presenceTrusted}. Returns an unsubscribe
   * function. The same contract the auto-reveal driver is given.
   */
  subscribe(cb: () => void): () => void;
  /**
   * The one sink. Must not throw: a throw loses the rest of that batch.
   * May call {@link SessionEventsHandle.stop}.
   */
  emit(event: SessionEvent): void;
}

export interface SessionEventsHandle {
  /**
   * Unsubscribe and drop anything not yet delivered. Idempotent, and safe to
   * call from inside `emit`: nothing is delivered after it has run.
   */
  stop(): void;
}

const SESSION_ENDED = 'Session ended.';
/** ADR-0023:16 — no trailing period. */
const endedBy = (name: string): string => `Session ended by ${name}`;
const REMOVED_BY_HOST = 'Removed by host';

/** A participant's display name, with an empty one counting as missing. */
function nameOf(
  participants: readonly ParticipantSnapshot[],
  id: string | null,
): string | undefined {
  if (id === null) return undefined;
  return participants.find((p) => p.id === id)?.displayName || undefined;
}

/**
 * Start recognising session end, host change and removal for one session.
 *
 * Detection runs synchronously, once on construction and on every
 * notification from {@link SessionEventsDeps.subscribe}. Delivery does not:
 * see the note above `flush`.
 */
export function startSessionEvents(deps: SessionEventsDeps): SessionEventsHandle {
  let stopped = false;
  /** The `sessionEndedAt` last acted on — one event per distinct value. */
  let handledEndedAt: number | null = null;
  /** The host last seen, or `null` while there is none: the next one is a seed. */
  let prevHostId: string | null = null;
  /** The `leftAt` last acted on — prevents a double fire. */
  let handledLeftAt: number | null = null;
  /**
   * This peer's `leftAt` at the previous evaluation, with a sentinel to tell
   * "never observed" from "observed as undefined":
   *
   * - `'unset'` — no evaluation has seen this peer's record yet.
   * - `undefined` — the last one saw no `leftAt` (no removal recorded).
   * - `number` — the last one saw `leftAt` set to this timestamp.
   *
   * Only a transition from `undefined` to `number` is a removal. A stale
   * `leftAt` present on the *first* observation (sentinel still `'unset'`) is
   * recorded and skipped, so a record loaded from an earlier visit does not
   * fire.
   */
  let prevLeftAt: number | undefined | 'unset' = 'unset';
  /** Latched {@link SessionEventsDeps.firstSyncCompleted}: once true, for good. */
  let firstSynced = false;
  /** Events seen but not yet delivered. Thunks, so each is finished at delivery. */
  let pending: Array<() => SessionEvent> = [];
  let flushScheduled = false;

  function detectEnded(p: DocProjection): void {
    const at = p.meta.sessionEndedAt;
    if (at === undefined || at === null) {
      handledEndedAt = null;
      return;
    }
    if (at === handledEndedAt) return;
    handledEndedAt = at;

    const hostId = p.settings.hostParticipantId || null;
    const hostName =
      nameOf(p.participants, hostId) ?? nameOf(p.participants, p.meta.createdBy) ?? 'Host';
    pending.push(() => {
      const endedLocally = deps.endedLocally();
      return {
        kind: 'ended',
        endedAt: at,
        endedLocally,
        hostId,
        hostName,
        message: endedLocally ? SESSION_ENDED : endedBy(hostName),
      };
    });
  }

  function detectRemoval(p: DocProjection): void {
    const me = p.participants.find((x) => x.id === deps.selfId);
    if (!me) return;

    const { leftAt, removedBy } = me;

    if (leftAt === undefined) {
      prevLeftAt = undefined;
      handledLeftAt = null;
      return;
    }

    // Voluntary leave — the surface's own leave flow tears down.
    if (removedBy === deps.selfId) {
      prevLeftAt = leftAt;
      return;
    }

    // First-sync gate (ADR-0036 §6 rejoin race fix): any `leftAt` observed
    // before the relay's first sync completes arrived via the snapshot apply,
    // not via a live host removal on this connection. Record the value so the
    // transition tracker stays current, but do not fire. The reading is
    // latched above, so a later dip of the caller's flag does not reopen it.
    if (!firstSynced) {
      prevLeftAt = leftAt;
      return;
    }

    // Stale-rejoin guard: if this is the first observation (`'unset'`) and
    // `leftAt` is already set, treat it as a pre-existing stale value — record
    // and skip. Only a real undefined → defined transition fires.
    if (prevLeftAt === 'unset') {
      prevLeftAt = leftAt;
      return;
    }

    // `leftAt` was already set at the previous evaluation: do not re-fire.
    if (prevLeftAt !== undefined) {
      prevLeftAt = leftAt;
      return;
    }

    // Transition: undefined → defined. This is a genuine removal.
    prevLeftAt = leftAt;

    // Already handled this removal (double-fire guard).
    if (leftAt === handledLeftAt) return;
    handledLeftAt = leftAt;

    const by = removedBy ?? null;
    const event: RemovedEvent = {
      kind: 'removed',
      leftAt,
      removedBy: by,
      removedByName: by === null ? null : (nameOf(p.participants, by) ?? by),
      message: REMOVED_BY_HOST,
    };
    pending.push(() => event);
  }

  function detectHostChange(p: DocProjection): void {
    // Typed as a string, but absent for a joiner before its first sync: absent
    // and empty both mean "no host", as in the election driver.
    const hostId = p.settings.hostParticipantId || null;
    if (hostId === null) {
      prevHostId = null;
      return;
    }
    // The first host seen — including one that arrives with the first sync —
    // is a seed, not a change.
    if (prevHostId === null) {
      prevHostId = hostId;
      return;
    }
    if (hostId === prevHostId) return;
    const previousHostId = prevHostId;
    prevHostId = hostId;

    const prev = p.participants.find((x) => x.id === previousHostId);
    let previousHostName: string | null = null;
    let cause: HostChangeCause | null = null;
    if (prev !== undefined) {
      previousHostName = prev.displayName || previousHostId;
      if (!isActiveParticipant(prev)) {
        cause = 'left';
      } else if (
        // Who is online is only known to a peer that is in sync itself: to one
        // that is not, everybody is gone.
        deps.presenceTrusted() &&
        !deps.onlineIds().has(previousHostId)
      ) {
        cause = 'disconnected';
      }
    }
    // No record for the previous host: no name, and no reason is given.

    const hostName = nameOf(p.participants, hostId) ?? hostId;
    const wasSelf = previousHostId === deps.selfId;
    const isSelf = hostId === deps.selfId;
    const event: HostChangedEvent = {
      kind: 'host-changed',
      previousHostId,
      previousHostName,
      hostId,
      hostName,
      cause,
      wasSelf,
      isSelf,
      message: formatHostChangeMessage({
        prevName: previousHostName,
        newName: hostName,
        isSelf,
        wasSelf,
        cause,
      }),
    };
    pending.push(() => event);
  }

  // Delivery is a microtask after detection, never inside the change that
  // raised it:
  //  - Yjs forbids writes inside an observer (commit 06219b42 — why the CLI
  //    deferred its session-end callback), and a sink may write or tear the
  //    doc down;
  //  - surfaces answer `ended` and `removed` by tearing the session down,
  //    which must not happen under the notification that is still fanning out;
  //  - the end write notifies before its caller can record that it applied,
  //    so `endedLocally` is read here rather than at detection.
  function flush(): void {
    flushScheduled = false;
    const batch = pending;
    pending = [];
    for (const make of batch) {
      if (stopped) return;
      deps.emit(make());
    }
  }

  function evaluate(): void {
    if (stopped) return;
    const p = deps.projection();
    if (!p) return;

    if (!firstSynced && deps.firstSyncCompleted()) firstSynced = true;

    // Order is part of the contract: a surface answers `ended` and `removed`
    // by stopping the driver, which drops a stale host toast queued behind.
    detectEnded(p);
    detectRemoval(p);
    detectHostChange(p);

    if (pending.length > 0 && !flushScheduled) {
      flushScheduled = true;
      queueMicrotask(flush);
    }
  }

  const unsubscribe = deps.subscribe(evaluate);
  // An end already in the snapshot when the driver starts is delivered too —
  // a peer that joins or resumes a session that has ended must still leave
  // it (ADR-0023 §5).
  evaluate();

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      pending = [];
      unsubscribe();
    },
  };
}
