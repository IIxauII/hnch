import {
  computed,
  inject,
  Injectable,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import {
  activeRound as activeRoundFromProjection,
  currentRound as currentRoundFromProjection,
  isActiveParticipant,
  nextPendingAgendaItem as nextPendingAgendaItemFromProjection,
  openLiveSession,
  screenFor,
  UNBOUND_SESSION_COMMANDS,
  type AgendaItem,
  type DocProjection,
  type JoinRejectionReason,
  type LiveSession,
  type LiveSessionSeed,
  type Meta,
  type ParticipantSnapshot,
  type PatchRoundDescriptorInit,
  type PublicSettingsPatch,
  type Round,
  type RosterResult,
  type Screen,
  type SessionCommands,
  type SessionEvent,
  type Settings,
  type SyncStatus,
} from '@hnch/shared';
import { Capacitor } from '@capacitor/core';
import type * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

import { AppPreferenceService } from '../app-preference.service';
import { ToastService } from '../../services/toast.service';

/**
 * What {@link DocService.open} needs: the room as the relay issued it, who
 * this peer is, and how the doc is seeded.
 */
export interface OpenSessionInit {
  /**
   * The room as the relay issued it: minted at `POST /rooms` (ADR-0016), or
   * resolved from its code. The code is the human-typeable twin (ADR-0008);
   * it travels with the handshake and never appears in the doc.
   */
  readonly room: { readonly uuid: string; readonly code: string };
  /** This device's participant id — also the id it presents to the relay. */
  readonly participantId: string;
  readonly displayName: string;
  /** Avatar colour wire value (ADR-0043), pre-validated by `AvatarColorService`. */
  readonly avatarColor?: string;
  /** Present for a password-protected room (ADR-0017). */
  readonly passwordHash?: string;
  /**
   * `create` seeds the whole doc and makes this peer the host; `join` writes
   * only this peer's record, so settings, meta and the host arrive from the
   * relay without a merge conflict.
   */
  readonly seed: LiveSessionSeed;
  /** Relay override for tests. Defaults to the resolved relay URL. */
  readonly httpBaseUrl?: string;
  /** Clock injection point. Tests freeze this; production omits. */
  readonly now?: () => number;
}

/**
 * The client's adapter over the shared live session (#529), exposed as
 * Angular signals.
 *
 * Joining a session and keeping it live — the doc, presence, the relay
 * connection, change tracking, the drivers, the bound commands, teardown —
 * is `@hnch/shared`'s `live-session`, the same module the CLI runs on. What
 * stays here is the client's own: the signals that mirror the live session's
 * readings, the session epoch, the auto-reveal counter, the IndexedDB load
 * before the socket opens (ADR-0004), and the copy of the repeated-trouble
 * toast. Components bind to the signals through `computed()` selectors and
 * never import `yjs`.
 */
@Injectable({ providedIn: 'root' })
export class DocService {
  private readonly appPrefs = inject(AppPreferenceService);
  private readonly toastService = inject(ToastService);

  // ---------------------------------------------------------------------------
  // The live session and what it reports
  // ---------------------------------------------------------------------------

  /** The session this service holds, or `null` before {@link open} and after {@link teardown}. */
  private live: LiveSession | null = null;
  private persistence: IndexeddbPersistence | null = null;
  private readonly projection: WritableSignal<DocProjection | null> = signal<DocProjection | null>(
    null,
  );
  private readonly roomCodeSignal: WritableSignal<string | null> = signal<string | null>(null);
  private readonly syncStatusSignal: WritableSignal<SyncStatus | 'offline'> = signal<
    SyncStatus | 'offline'
  >('offline');
  private readonly lastRejectionSignal: WritableSignal<JoinRejectionReason | null> =
    signal<JoinRejectionReason | null>(null);
  private readonly reconnectingSignal: WritableSignal<boolean> = signal(false);
  private readonly relaySyncedSignal: WritableSignal<boolean> = signal(false);
  /** Bumped whenever the session this service holds changes — see {@link sessionEpoch}. */
  private readonly sessionEpochSignal: WritableSignal<number> = signal(0);
  private readonly relayRoomUuidSignal: WritableSignal<string | null> = signal<string | null>(null);
  private readonly onlineParticipantIdsSignal: WritableSignal<ReadonlySet<string>> = signal<
    ReadonlySet<string>
  >(new Set());
  private readonly autoRevealCountSignal: WritableSignal<number> = signal(0);
  /**
   * Listeners on {@link onSessionEvent}. App-lifetime, unlike the sessions
   * whose events they hear: the app-level sinks register once.
   */
  private readonly sessionEventListeners = new Set<(event: SessionEvent) => void>();

  // ---------------------------------------------------------------------------
  // Public signals
  // ---------------------------------------------------------------------------

  readonly hasSession: Signal<boolean> = computed(() => this.projection() !== null);

  /** Full live projection snapshot, or `null` when no session is live. */
  readonly projectionSnapshot: Signal<DocProjection | null> = this.projection.asReadonly();

  readonly meta: Signal<Meta | null> = computed(() => this.projection()?.meta ?? null);

  readonly settings: Signal<Settings | null> = computed(() => this.projection()?.settings ?? null);

  readonly participants: Signal<readonly ParticipantSnapshot[]> = computed(
    () => this.projection()?.participants ?? [],
  );

  /**
   * Active participants — raw list filtered through `isActiveParticipant`
   * (ADR-0036). Use this for any "who is in the session right now?" query:
   * lobby roster, voter denominator, online intersection.
   *
   * Use raw `participants()` for `RoundHistoryComponent` and
   * `VoteResultsComponent` chip name lookup, and for the "didn't vote"
   * denominator filter inside `VoteResultsComponent` — departed names must
   * still resolve and the `isActiveParticipant` filter is applied inside
   * those components where semantics require it.
   */
  readonly activeParticipants: Signal<readonly ParticipantSnapshot[]> = computed(() =>
    this.participants().filter(isActiveParticipant),
  );

  readonly rounds: Signal<readonly Round[]> = computed(() => this.projection()?.rounds ?? []);

  /**
   * Full agenda list sorted by sortKey (ADR-0042). All states included —
   * consumers filter by state as needed.
   */
  readonly agenda: Signal<readonly AgendaItem[]> = computed(() => this.projection()?.agenda ?? []);

  /** Pending agenda items only — convenience filter for the agenda panel. */
  readonly pendingAgenda: Signal<readonly AgendaItem[]> = computed(() =>
    this.agenda().filter((item) => item.state === 'pending'),
  );

  /**
   * First pending agenda item, or null when queue is empty.
   * Used by LobbyPage to pre-fill the round-start sheet (ADR-0042).
   */
  readonly nextPendingAgendaItem: Signal<AgendaItem | null> = computed(() => {
    const snap = this.projection();
    return snap ? nextPendingAgendaItemFromProjection(snap) : null;
  });

  readonly currentRound: Signal<Round | null> = computed(() => {
    const snap = this.projection();
    return snap ? currentRoundFromProjection(snap) : null;
  });

  /**
   * The active round — last round with status `'pending'` or `'voting'`,
   * or `null` when every round is terminal. Unlike {@link currentRound},
   * there is no anchor fallback to the last non-discarded round: that
   * fallback is exactly what let votes land on a round that had just been
   * revealed, skipped, or discarded. `currentRound` answers "what should
   * Lobby show"; `activeRound` answers "is there a round still open to vote
   * on right now" — bind vote-surface visibility to this, not `currentRound`.
   */
  readonly activeRound: Signal<Round | null> = computed(() => {
    const snap = this.projection();
    return snap ? activeRoundFromProjection(snap) : null;
  });

  /**
   * The screen this peer belongs on, or `null` while no projection has
   * arrived yet (issue #508). The rule itself is the shared `screenFor`
   * selector, which is total on a projection; the null encoding is this
   * adapter's job and it is load-bearing rather than defensive. The
   * session-resume guard has a timeout path that admits an in-session route
   * on a slow network, so a page genuinely can mount with no doc. A
   * navigation effect that read a missing projection as "no active round"
   * would bounce those peers to Lobby; `null` means "don't know yet, stay put".
   */
  readonly screen: Signal<Screen | null> = computed(() => {
    const snap = this.projection();
    return snap ? screenFor(snap) : null;
  });

  /**
   * Monotonic count of unanimous auto-reveals this peer has written
   * (ADR-0018), bumped on the live session's "auto-reveal applied" reading —
   * so a lost race does not count. A counter rather than a timestamp: two
   * auto-reveals landing in the same millisecond must still notify, and
   * there is nothing to reset. The Estimating page fires its success haptic
   * on a change; device feedback stays out of the doc layer.
   */
  readonly autoRevealCount: Signal<number> = this.autoRevealCountSignal.asReadonly();

  /** The relay-assigned 6-character room code (ADR-0008), or `null` with no session. */
  readonly roomCode: Signal<string | null> = this.roomCodeSignal.asReadonly();

  /**
   * Sync connection status. `'offline'` while no session is held; from
   * {@link open} on, `'connecting'` until the live session reports otherwise.
   */
  readonly syncStatus: Signal<SyncStatus | 'offline'> = this.syncStatusSignal.asReadonly();

  /**
   * Last relay-issued join rejection (ADR-0016's close-code table), if
   * any. Reset on each successful connect.
   */
  readonly lastRejection: Signal<JoinRejectionReason | null> =
    this.lastRejectionSignal.asReadonly();

  /**
   * True while the relay's state has applied on the *current* socket. A
   * socket that is merely open says less than it seems to: the relay accepts
   * the upgrade and *then* closes on a wrong password (ADR-0035), so
   * `syncStatus` passes through `'connected'` on the way to a rejection.
   */
  readonly relaySynced: Signal<boolean> = this.relaySyncedSignal.asReadonly();

  /**
   * Identifies the session this service holds: a number that changes every
   * time a session starts or is torn down.
   *
   * The connection signals ({@link syncStatus}, {@link relaySynced},
   * {@link lastRejection}) describe *whatever* session is current. Something
   * that waits on them across an `await` — a join in progress — notes the
   * epoch first and stops caring when it has moved on: the session it was
   * waiting for is gone, and what the signals say now is about another one.
   */
  readonly sessionEpoch: Signal<number> = this.sessionEpochSignal.asReadonly();

  /**
   * The UUID the socket is connected under, as the relay issued it (minted at
   * creation, or resolved from the code on joining). `null` with no session.
   *
   * Not the same thing as `meta().roomUuid`, which is read from the doc — and
   * the doc is writable by every participant. Anything that talks to the relay
   * about *this* session (the password's salt, the access change) goes by
   * this one.
   */
  readonly relayRoomUuid: Signal<string | null> = this.relayRoomUuidSignal.asReadonly();

  /**
   * True once the session has been got into: the socket is up *and* the
   * relay's state has applied on it. The socket alone is not a verdict — the
   * relay takes it before it turns a wrong password away (ADR-0035).
   */
  readonly joined: Signal<boolean> = computed(
    () => this.syncStatusSignal() === 'connected' && this.relaySyncedSignal(),
  );

  /**
   * True while the connection is retrying after a transient disconnect
   * (network drop, no relay-issued close code). False before the first
   * successful connect, while connected, once permanently rejected, and
   * after teardown.
   */
  readonly reconnecting: Signal<boolean> = this.reconnectingSignal.asReadonly();

  /**
   * The participant ids present on the relay, as the live session reports
   * them. This peer's own id is in it from the moment the session opens, so
   * no screen shows "my own row is offline".
   */
  readonly onlineParticipantIds: Signal<ReadonlySet<string>> =
    this.onlineParticipantIdsSignal.asReadonly();

  // ---------------------------------------------------------------------------
  // Writer seam (#516)
  // ---------------------------------------------------------------------------

  /**
   * The live session's command set, or `UNBOUND_SESSION_COMMANDS` before a
   * session exists and after {@link teardown}, so no consumer branches on
   * `hasSession()` to reach a writer; every member just refuses honestly.
   *
   * A getter rather than a signal: writers are not reactive state. Read
   * through the live session each time, so a set bound to a torn-down
   * session is never reachable from here.
   */
  get commands(): SessionCommands {
    return this.live?.commands ?? UNBOUND_SESSION_COMMANDS;
  }

  /**
   * Listen to the session events driver: the session *ended*, the *host
   * changed*, or this peer was *removed* by the host — each once, with the
   * text to show already written. Delivered a microtask after the doc change
   * that raised it, never inside it, and only while a session is held; there
   * is no replay. Listeners outlive sessions. Returns unsubscribe.
   */
  onSessionEvent(listener: (event: SessionEvent) => void): () => void {
    this.sessionEventListeners.add(listener);
    return (): void => {
      this.sessionEventListeners.delete(listener);
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Open a session — created or joined — and connect it, in one call. Any
   * session already held is torn down first.
   *
   * The doc is seeded and the signals report it at once; the IndexedDB
   * snapshot then loads into it before the socket opens, so cached state
   * shows before the relay answers (ADR-0004). A teardown while it loads
   * opens no socket, and a password set while it loads is the one the
   * socket opens with.
   */
  open(init: OpenSessionInit): void {
    this.teardown();
    this.sessionEpochSignal.update((n) => n + 1);
    this.roomCodeSignal.set(init.room.code);
    this.relayRoomUuidSignal.set(init.room.uuid);
    // Now, not one tick later when the first status arrives, so the
    // connection banner's clock starts with the attempt.
    this.syncStatusSignal.set('connecting');

    this.live = openLiveSession({
      httpBaseUrl: init.httpBaseUrl ?? this.appPrefs.resolvedRelayHttpUrl(),
      room: init.room,
      credentials: {
        deviceId: init.participantId,
        ...(init.passwordHash !== undefined && { passwordHash: init.passwordHash }),
      },
      self: {
        participantId: init.participantId,
        displayName: init.displayName,
        ...(init.avatarColor !== undefined && { avatarColor: init.avatarColor }),
      },
      seed: init.seed,
      ...(init.now !== undefined && { now: init.now }),
      beforeConnect: (doc) => this.loadLocalSnapshot(init.room.uuid, doc),
      onProjectionChange: (projection) => this.projection.set(projection),
      onOnlineIdsChange: (onlineIds) => this.onlineParticipantIdsSignal.set(onlineIds),
      onStatusChange: (status) => this.syncStatusSignal.set(status),
      onRejectionChange: (reason) => this.lastRejectionSignal.set(reason),
      onReconnectingChange: (reconnecting) => this.reconnectingSignal.set(reconnecting),
      // The throttle lives in `relay-client`; only the copy is decided here.
      onRepeatRejection: () => {
        void this.toastService.error('Trouble reaching the session. Still trying.');
      },
      onSyncedChange: (synced) => this.relaySyncedSignal.set(synced),
      onAutoReveal: () => this.autoRevealCountSignal.update((n) => n + 1),
      onSessionEvent: (event) => {
        for (const listener of this.sessionEventListeners) listener(event);
      },
    });
  }

  /**
   * Wait, up to `cap` ms, for what this peer wrote last — a leave — to leave
   * the socket before the caller tears the session down. Resolves at once
   * with no session or nothing queued; never rejects: the leave reaching
   * peers is best-effort, and the local teardown must not block on it.
   */
  async flushUpdates(cap = 500): Promise<void> {
    await this.live?.flushUpdates(cap);
  }

  /**
   * Re-handshake with a new password hash, without tearing the session down
   * (ADR-0017). Called after the host rotates the room password so this
   * client's own connection stops carrying the stale one and survives its
   * next reconnect. Pass `null` when the room reverts to open. While the
   * socket has not opened yet — the snapshot is still loading — it opens
   * with the new hash. A no-op with no session.
   */
  updateCredentials(passwordHash: string | null): void {
    this.live?.updateCredentials(passwordHash);
  }

  /**
   * Tear down the session held: destroy the doc, stop the drivers, drop the
   * command set, write nothing — the live session's `teardown` — and reset
   * every signal. Idempotent.
   *
   * Named apart from the roster command it shares a session with — this
   * means the opposite kind of act. `endSession` (via {@link commands}) ends
   * the session *for everyone*, a write every peer observes; `teardown`
   * closes it here and writes nothing.
   */
  teardown(): void {
    this.persistence?.destroy();
    this.persistence = null;
    this.live?.teardown();
    this.live = null;
    this.projection.set(null);
    this.onlineParticipantIdsSignal.set(new Set());
    this.roomCodeSignal.set(null);
    this.syncStatusSignal.set('offline');
    this.lastRejectionSignal.set(null);
    this.reconnectingSignal.set(false);
    this.relaySyncedSignal.set(false);
    this.relayRoomUuidSignal.set(null);
    this.sessionEpochSignal.update((n) => n + 1);
  }

  // ---------------------------------------------------------------------------
  // Writes that are not commands
  // ---------------------------------------------------------------------------

  /**
   * Patch session settings. `PublicSettingsPatch` excludes
   * `hostParticipantId` by construction — host changes go through
   * `commands.handoffHost` or the election (#507).
   */
  updateSettings(patch: PublicSettingsPatch): void {
    this.requireLive('updateSettings').updateSettings(patch);
  }

  /** Patch a round's `title` / `description`. Not a command: there is no rule to apply. */
  updateRoundDescriptor(roundId: string, fields: PatchRoundDescriptorInit): void {
    this.requireLive('updateRoundDescriptor').updateRoundDescriptor(roundId, fields);
  }

  /**
   * End the session for everyone — `commands.endSession()`. The live session
   * notes that this peer's own end applied, so its session event reads
   * "Session ended." rather than naming the host; a refused mis-tap notes
   * nothing.
   */
  endSessionForEveryone(): RosterResult {
    return this.commands.endSession();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * The live session's `beforeConnect`: load the IndexedDB snapshot into the
   * doc before the socket opens, so the UI is populated from cache at once
   * (ADR-0004). Native: SQLite persistence is deferred to Phase 6b.
   */
  private async loadLocalSnapshot(roomUuid: string, doc: Y.Doc): Promise<void> {
    if (Capacitor.isNativePlatform()) return;
    const persistence = new IndexeddbPersistence(roomUuid, doc);
    this.persistence = persistence;
    await persistence.whenSynced;
  }

  private requireLive(op: string): LiveSession {
    if (this.live === null) {
      throw new Error(`DocService.${op}: no active session`);
    }
    return this.live;
  }
}
