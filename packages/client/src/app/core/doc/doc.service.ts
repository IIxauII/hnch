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
  AWARENESS_PARTICIPANT_ID_FIELD,
  bindSessionCommands,
  currentRound as currentRoundFromProjection,
  DOC_AGENDA_KEY,
  DOC_META_KEY,
  DOC_PARTICIPANTS_KEY,
  DOC_ROUNDS_KEY,
  DOC_SETTINGS_KEY,
  initDoc,
  isActiveParticipant,
  joinDoc,
  nextPendingAgendaItem as nextPendingAgendaItemFromProjection,
  onlineIdsFrom,
  patchSettings,
  projectDoc,
  patchRoundDescriptor as patchRoundDescriptorY,
  promoteHost as promoteHostCommand,
  rejoin as rejoinRoster,
  screenFor,
  startAutoReveal,
  startElection,
  startSessionEvents,
  UNBOUND_SESSION_COMMANDS,
  type AgendaItem,
  type DocProjection,
  type AutoRevealHandle,
  type ElectionHandle,
  type InitDocInit,
  type JoinCredentials,
  type JoinRejectionReason,
  type Meta,
  type ParticipantSnapshot,
  type Round,
  type Scale,
  type Screen,
  type PublicSettingsPatch,
  type RosterResult,
  type SessionCommands,
  type SessionEvent,
  type SessionEventsHandle,
  type Settings,
} from '@hnch/shared';
import { Capacitor } from '@capacitor/core';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

import { AppPreferenceService } from '../app-preference.service';
import { ParticipantIdService } from '../participant-id.service';
import { ToastService } from '../../services/toast.service';
import { connectToRelay, type RelayConnection, type SyncStatus } from '@hnch/shared';

/** {@link InitDocInit} for {@link DocService.createSession}; the service stamps `createdAt`. */
export interface CreateSessionInit {
  readonly participantId: string;
  readonly displayName: string;
  readonly defaultScale: Scale;
  readonly sessionName?: string;
  /** Pre-validated by `AvatarColorService`, so peers see it from the first snapshot (ADR-0043). */
  readonly avatarColor?: string;
  /**
   * Minted by the relay's `POST /rooms` (ADR-0016). Omitted only by tests that build a purely
   * local doc; a fresh UUID fills in.
   */
  readonly roomUuid?: string;
  /** Held as a signal, not in the doc: the code is a relay-side lookup (ADR-0008). */
  readonly roomCode?: string;
  readonly now?: () => number;
}

export interface ConnectOptions {
  /** Defaults to the resolved relay URL; `relay-client` derives the WebSocket URL from it. */
  readonly httpBaseUrl?: string;
  /** Required for {@link DocService.joinSession}, since meta has not synced yet. */
  readonly roomUuid?: string;
}

/**
 * Yjs-backed session state as Angular signals. Components never import `yjs`: the projection
 * and mutation logic lives in `@hnch/shared`, testable against a headless `Y.Doc`, and this
 * service is the Angular adapter plus the relay connection ({@link connect}).
 */
@Injectable({ providedIn: 'root' })
export class DocService {
  private readonly appPrefs = inject(AppPreferenceService);
  private readonly toastService = inject(ToastService);
  private readonly participantIdService = inject(ParticipantIdService);

  // Private Yjs + sync state

  private doc: Y.Doc | null = null;
  /** Backs {@link commands}; `null` outside a session so a stale set can never leak. */
  private boundCommands: SessionCommands | null = null;
  private persistence: IndexeddbPersistence | null = null;
  private observers: Array<() => void> = [];
  private readonly projection: WritableSignal<DocProjection | null> = signal<DocProjection | null>(
    null,
  );
  private readonly roomCodeSignal: WritableSignal<string | null> = signal<string | null>(null);
  private provider: RelayConnection | null = null;
  /**
   * Held here, not only in the provider: the provider does not exist while the local snapshot
   * loads, and a password set in that window would otherwise be dropped.
   */
  private credentials: JoinCredentials | null = null;
  private sessionParticipantId: string | null = null;
  /** Set by joinSession for the next connect; gates the post-sync `rejoin` (ADR-0036 §6). */
  private joinParticipantId: string | null = null;
  private readonly syncStatusSignal: WritableSignal<SyncStatus | 'offline'> = signal<
    SyncStatus | 'offline'
  >('offline');
  private readonly lastRejectionSignal: WritableSignal<JoinRejectionReason | null> =
    signal<JoinRejectionReason | null>(null);
  /** The last value `relay-client` pushed; it owns the reconnecting derivation. */
  private readonly reconnectingSignal: WritableSignal<boolean> = signal(false);
  private readonly hasFirstSyncCompletedSignal: WritableSignal<boolean> = signal(false);
  private readonly relaySyncedSignal: WritableSignal<boolean> = signal(false);
  private readonly sessionEpochSignal: WritableSignal<number> = signal(0);
  private readonly relayRoomUuidSignal: WritableSignal<string | null> = signal<string | null>(null);
  /** Our own end-session write applied, so the events driver says "Session ended." */
  readonly endingSessionLocally: WritableSignal<boolean> = signal(false);
  private awareness: Awareness | null = null;
  private awarenessOff: (() => void) | null = null;
  /** Session-scoped, not app-lifetime, so a doc-less app arms no timers (ADR-0010). */
  private electionHandle: ElectionHandle | null = null;
  private autoRevealHandle: AutoRevealHandle | null = null;
  /** Stopping it drops undelivered events, so nothing reaches a listener after teardown. */
  private sessionEventsHandle: SessionEventsHandle | null = null;
  /** App-lifetime, unlike the driver: the app-level sinks outlive every session. */
  private readonly sessionEventListeners = new Set<(event: SessionEvent) => void>();
  /** One fan-out for every driver, so one place decides what counts as a change. */
  private readonly driverNotifiers = new Set<() => void>();
  private readonly onlineParticipantIdsSignal: WritableSignal<ReadonlySet<string>> = signal<
    ReadonlySet<string>
  >(new Set());
  private readonly autoRevealCountSignal: WritableSignal<number> = signal(0);

  // Public signals

  readonly hasSession: Signal<boolean> = computed(() => this.projection() !== null);

  /** Also feeds the host-election driver started in {@link attach} (ADR-0048). */
  readonly projectionSnapshot: Signal<DocProjection | null> = this.projection.asReadonly();

  readonly meta: Signal<Meta | null> = computed(() => this.projection()?.meta ?? null);

  readonly settings: Signal<Settings | null> = computed(() => this.projection()?.settings ?? null);

  readonly participants: Signal<readonly ParticipantSnapshot[]> = computed(
    () => this.projection()?.participants ?? [],
  );

  /**
   * For "who is in the session now?": roster, voter denominator, auto-reveal (ADR-0036). Round
   * history and vote chips read raw `participants()` so departed names still resolve.
   */
  readonly activeParticipants: Signal<readonly ParticipantSnapshot[]> = computed(() =>
    this.participants().filter(isActiveParticipant),
  );

  readonly rounds: Signal<readonly Round[]> = computed(() => this.projection()?.rounds ?? []);

  /** Sorted by sortKey, every state included (ADR-0042). */
  readonly agenda: Signal<readonly AgendaItem[]> = computed(() => this.projection()?.agenda ?? []);

  readonly pendingAgenda: Signal<readonly AgendaItem[]> = computed(() =>
    this.agenda().filter((item) => item.state === 'pending'),
  );

  readonly nextPendingAgendaItem: Signal<AgendaItem | null> = computed(() => {
    const snap = this.projection();
    return snap ? nextPendingAgendaItemFromProjection(snap) : null;
  });

  readonly currentRound: Signal<Round | null> = computed(() => {
    const snap = this.projection();
    return snap ? currentRoundFromProjection(snap) : null;
  });

  /**
   * The round still open to vote on, or `null`. Unlike {@link currentRound} it never falls back
   * to the last non-discarded round: that fallback let votes land on a round that had just
   * closed. Bind vote surfaces to this; `currentRound` is what Lobby shows.
   */
  readonly activeRound: Signal<Round | null> = computed(() => {
    const snap = this.projection();
    return snap ? activeRoundFromProjection(snap) : null;
  });

  /**
   * `null` until a projection arrives (#508), and that is load-bearing: the session-resume guard
   * can admit an in-session route before the doc loads, and a navigation effect that read a
   * missing projection as "no active round" would bounce the peer to Lobby.
   */
  readonly screen: Signal<Screen | null> = computed(() => {
    const snap = this.projection();
    return snap ? screenFor(snap) : null;
  });

  /**
   * Auto-reveals this session wrote (ADR-0018), an edge signal for the success haptic. A counter,
   * not a timestamp, so two in the same millisecond still notify.
   */
  readonly autoRevealCount: Signal<number> = this.autoRevealCountSignal.asReadonly();

  /** `null` for local-only docs created without a code (ADR-0008). */
  readonly roomCode: Signal<string | null> = this.roomCodeSignal.asReadonly();

  /** `'offline'` while no provider is attached; otherwise the y-websocket status. */
  readonly syncStatus: Signal<SyncStatus | 'offline'> = this.syncStatusSignal.asReadonly();

  /** The last close-code rejection (ADR-0016); reset on each successful connect. */
  readonly lastRejection: Signal<JoinRejectionReason | null> =
    this.lastRejectionSignal.asReadonly();

  /**
   * True while the relay's state has applied on the current socket. An open socket says less:
   * the relay accepts the upgrade and then closes on a wrong password (ADR-0035).
   */
  readonly relaySynced: Signal<boolean> = this.relaySyncedSignal.asReadonly();

  /**
   * Changes whenever a session starts or is torn down. Code that waits on the connection signals
   * across an `await` notes it first and stops caring once it moves: the signals then describe
   * another session.
   */
  readonly sessionEpoch: Signal<number> = this.sessionEpochSignal.asReadonly();

  /**
   * The UUID the relay issued for this connection. Not `meta().roomUuid`, which any participant
   * can write: anything that talks to the relay about this session goes by this one.
   */
  readonly relayRoomUuid: Signal<string | null> = this.relayRoomUuidSignal.asReadonly();

  /** Socket up and the relay's state applied: the socket alone is no verdict (ADR-0035). */
  readonly joined: Signal<boolean> = computed(
    () => this.syncStatusSignal() === 'connected' && this.relaySyncedSignal(),
  );

  /**
   * Set by the first `onSynced`, reset on teardown. The events driver ignores `leftAt` seen
   * before it: that came from the snapshot, not a live kick (ADR-0036 §6).
   */
  readonly hasFirstSyncCompleted: Signal<boolean> = this.hasFirstSyncCompletedSignal.asReadonly();

  /**
   * Retrying after a transient drop. False before the first connect, while connected, once
   * rejected for good, and during a manual teardown.
   */
  readonly reconnecting: Signal<boolean> = this.reconnectingSignal.asReadonly();

  /**
   * Ids online per awareness, seeded with the local participant at session start so no screen
   * shows its own row offline.
   */
  readonly onlineParticipantIds: Signal<ReadonlySet<string>> =
    this.onlineParticipantIdsSignal.asReadonly();

  /** Active and in awareness: a silent disconnect drops off here but keeps its cast vote. */
  readonly onlineParticipants: Signal<readonly ParticipantSnapshot[]> = computed(() => {
    const online = this.onlineParticipantIdsSignal();
    return this.activeParticipants().filter((p) => online.has(p.id));
  });

  /** Complement of {@link onlineParticipants} within the active set. Rendered dimmed. */
  readonly offlineParticipants: Signal<readonly ParticipantSnapshot[]> = computed(() => {
    const online = this.onlineParticipantIdsSignal();
    return this.activeParticipants().filter((p) => !online.has(p.id));
  });

  // Writer seam (#516)

  /**
   * Every act a peer can take on the live session. `UNBOUND_SESSION_COMMANDS` outside a session,
   * so callers need no `hasSession()` branch: each member refuses instead. A getter, not a
   * signal: writers are not reactive state.
   */
  get commands(): SessionCommands {
    return this.boundCommands ?? UNBOUND_SESSION_COMMANDS;
  }

  /**
   * Session ended, host changed, or this peer was removed: each once, with its text written.
   * Delivered a microtask after the change, only while a driver runs, with no replay. Returns
   * unsubscribe.
   */
  onSessionEvent(listener: (event: SessionEvent) => void): () => void {
    this.sessionEventListeners.add(listener);
    return (): void => {
      this.sessionEventListeners.delete(listener);
    };
  }

  // Lifecycle

  /** Throws while a session is live: call {@link teardown} first. Returns the room UUID. */
  createSession(init: CreateSessionInit): string {
    if (this.doc !== null) {
      throw new Error('DocService.createSession: a session is already active');
    }

    const now = init.now ?? (() => Date.now());
    const roomUuid = init.roomUuid ?? crypto.randomUUID();
    const createdAt = now();

    const doc = new Y.Doc();
    const seed: InitDocInit = {
      roomUuid,
      createdAt,
      participantId: init.participantId,
      displayName: init.displayName,
      defaultScale: init.defaultScale,
      ...(init.sessionName !== undefined && { sessionName: init.sessionName }),
      ...(init.avatarColor !== undefined && { avatarColor: init.avatarColor }),
    };
    initDoc(doc, seed);

    // Awareness first: `attach` starts the host-election driver, whose initial
    // evaluation reads the online set. Seeding the local peer beforehand means
    // the driver never sees a present host as absent (ADR-0010).
    this.initAwareness(doc, init.participantId);
    this.attach(doc, init.participantId);
    this.roomCodeSignal.set(init.roomCode ?? null);
    return roomUuid;
  }

  /**
   * Writes only the participant entry: meta, settings and the host arrive by sync, which avoids
   * merge conflicts with the creator's initial writes.
   */
  joinSession(init: {
    participantId: string;
    displayName: string;
    roomCode?: string;
    /** Pre-validated by `AvatarColorService` (ADR-0043). */
    avatarColor?: string;
  }): void {
    if (this.doc !== null) {
      throw new Error('DocService.joinSession: a session is already active');
    }

    const doc = new Y.Doc();
    joinDoc(doc, {
      participantId: init.participantId,
      displayName: init.displayName,
      joinedAt: Date.now(),
      ...(init.avatarColor !== undefined && { avatarColor: init.avatarColor }),
    });

    // Awareness before attach — see the note in `createSession`.
    this.initAwareness(doc, init.participantId);
    this.attach(doc, init.participantId);
    this.roomCodeSignal.set(init.roomCode ?? null);
    // The `leftAt` clear must run after the relay snapshot merges (ADR-0036 §6).
    this.joinParticipantId = init.participantId;
  }

  /** Throws without a session; a no-op while a connection is open or opening. */
  connect(credentials: JoinCredentials, opts: ConnectOptions = {}): void {
    const doc = this.requireDoc('connect');
    // Connected, or about to be: the snapshot is loading and the socket opens
    // when it has. A second one would never be closed.
    if (this.provider !== null || this.credentials !== null) return;
    // What the relay issued, handed in by whoever asked it. The doc's own
    // word for it is only taken for a doc that has not been anywhere yet.
    const roomUuid = opts.roomUuid ?? this.meta()?.roomUuid;
    if (roomUuid === undefined) {
      throw new Error('DocService.connect: session has no roomUuid');
    }

    // `connecting` now, so the banner's clock starts now, not at the first `status` event.
    this.syncStatusSignal.set('connecting');
    this.credentials = credentials;
    this.relayRoomUuidSignal.set(roomUuid);

    const httpUrl = opts.httpBaseUrl ?? this.appPrefs.resolvedRelayHttpUrl();

    void this.connectWithPersistence(doc, roomUuid, httpUrl, this.joinParticipantId);
    this.joinParticipantId = null;
  }

  private async connectWithPersistence(
    doc: Y.Doc,
    roomUuid: string,
    httpBaseUrl: string,
    joinParticipantId: string | null = null,
  ): Promise<void> {
    // PWA: load the IndexedDB snapshot before the socket opens, so the UI fills from cache.
    // Native has no local persistence yet (ADR-0004).
    if (!Capacitor.isNativePlatform()) {
      const persistence = new IndexeddbPersistence(roomUuid, doc);
      this.persistence = persistence;
      await persistence.whenSynced;
      // The session may have been torn down, or replaced, while the snapshot
      // loaded. A provider created now would be bound to a destroyed doc and
      // would block the next session's `connect()`.
      if (this.doc !== doc) {
        if (this.persistence === persistence) this.persistence = null;
        void persistence.destroy();
        return;
      }
    }
    // Read after the wait: the credentials may have changed during it.
    const credentials = this.credentials;
    if (credentials === null) return;

    this.provider = connectToRelay({
      httpBaseUrl,
      roomUuid,
      doc,
      credentials,
      ...(this.awareness !== null && { awareness: this.awareness }),
      onStatusChange: (status) => this.syncStatusSignal.set(status),
      onRejectionChange: (reason) => this.lastRejectionSignal.set(reason),
      onReconnectingChange: (reconnecting) => this.reconnectingSignal.set(reconnecting),
      // The throttle (3 transient closes inside 60 s) lives in `relay-client`;
      // the toast is surface-side, so only the copy is decided here.
      onRepeatRejection: () => {
        void this.toastService.error('Trouble reaching the session. Still trying.');
      },
      // Flip the flag before clearing a stale `leftAt`, so the events driver can tell the
      // snapshot from a live kick. A joiner's delete outclocks the snapshot's set and wins the
      // LWW merge (ADR-0036 §6).
      onSynced: () => {
        this.hasFirstSyncCompletedSignal.set(true);
        if (joinParticipantId !== null) {
          rejoinRoster(doc, joinParticipantId);
        }
      },
      // The online set only means something while synced. Re-notify on both
      // edges: a round that went unanimous while we were away reveals on the
      // rising edge, and nothing evaluates on the falling one.
      onSyncedChange: (synced) => {
        this.relaySyncedSignal.set(synced);
        this.notifyDrivers();
      },
    });
  }

  /**
   * Wait (polling every 16 ms, up to `cap` ms) for the socket's `bufferedAmount` to drain, so a
   * last update such as `leaveSession` can reach peers before teardown. Never rejects: delivery
   * is best-effort and teardown must not block on it.
   */
  async flushUpdates(cap = 500): Promise<void> {
    if (this.provider === null) return;
    const ws = (this.provider as unknown as { ws?: WebSocket }).ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const deadline = Date.now() + cap;
    while (ws.bufferedAmount > 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 16));
    }
  }

  /**
   * Re-handshake with a new password hash (`null` for an open room) without a teardown
   * (ADR-0017), so this client's reconnects stop carrying the stale hash. No-op when unchanged.
   */
  updateCredentials(passwordHash: string | null): void {
    if (this.credentials !== null) {
      const { passwordHash: _previous, ...rest } = this.credentials;
      this.credentials = passwordHash === null ? rest : { ...rest, passwordHash };
    }
    // No provider yet means the socket has not been opened: it will open
    // with the credentials above.
    this.provider?.updateCredentials({ passwordHash });
  }

  /** Drop the socket but keep the local session; {@link teardown} calls this. */
  disconnect(): void {
    // Also calls off a connection that was still on its way: the socket
    // opens with credentials, and there are none now.
    this.credentials = null;
    if (this.provider === null) {
      this.syncStatusSignal.set('offline');
      this.reconnectingSignal.set(false);
      this.relaySyncedSignal.set(false);
      return;
    }
    this.provider.disconnect();
    this.provider = null;
    this.syncStatusSignal.set('offline');
    this.reconnectingSignal.set(false);
    this.relaySyncedSignal.set(false);
  }

  /**
   * Destroy the local doc and write nothing; idempotent. The opposite of `commands.endSession`,
   * which ends the session for everyone. Later calls refuse via `UNBOUND_SESSION_COMMANDS` (#516).
   */
  teardown(): void {
    this.disconnect();
    this.persistence?.destroy();
    this.persistence = null;
    this.teardownAwareness();
    this.detach();
    this.doc?.destroy();
    this.doc = null;
    this.projection.set(null);
    this.roomCodeSignal.set(null);
    this.lastRejectionSignal.set(null);
    this.hasFirstSyncCompletedSignal.set(false);
    this.endingSessionLocally.set(false);
    this.joinParticipantId = null;
    this.credentials = null;
    this.relayRoomUuidSignal.set(null);
    this.sessionEpochSignal.update((n) => n + 1);
  }

  // Mutations carrying client behaviour (#516); every other write goes through `commands`.

  /**
   * `PublicSettingsPatch` excludes `hostParticipantId`: host changes go through `handoffHost` or
   * the election, where the rules live (#507). That narrowed type is the gate.
   */
  updateSettings(patch: PublicSettingsPatch): void {
    patchSettings(this.requireDoc('updateSettings'), patch);
  }

  /** A plain forward: there is no rule to apply. */
  updateRoundDescriptor(roundId: string, fields: { title?: string; description?: string }): void {
    patchRoundDescriptorY(this.requireDoc('updateRoundDescriptor'), roundId, fields);
  }

  /**
   * Sets `endingSessionLocally` only once the host gate applied the write, so a refused mis-tap
   * does not arm the banner. Setting it after the write is safe: the driver reads it at
   * delivery, a microtask later.
   */
  endSessionForEveryone(): RosterResult {
    const result = this.commands.endSession();
    if (result.applied) this.endingSessionLocally.set(true);
    return result;
  }

  // Internals

  /** Every container event rebuilds the whole projection, which is cheap at session scale. */
  private attach(doc: Y.Doc, participantId: string): void {
    this.doc = doc;
    this.sessionParticipantId = participantId;
    this.sessionEpochSignal.update((n) => n + 1);
    // Bind the writer seam before the drivers start — the auto-reveal
    // driver's `reveal()` adapter reaches it immediately below (#516).
    this.boundCommands = bindSessionCommands({
      doc,
      participantId,
      onlineIds: () => this.onlineParticipantIdsSignal(),
    });
    this.rebuildProjection();
    this.startElectionDriver();
    this.startAutoRevealDriver();
    this.startSessionEventsDriver(participantId);

    const rebuild = (): void => this.rebuildProjection();
    const meta = doc.getMap(DOC_META_KEY);
    const settings = doc.getMap(DOC_SETTINGS_KEY);
    const participants = doc.getMap(DOC_PARTICIPANTS_KEY);
    const rounds = doc.getArray(DOC_ROUNDS_KEY);
    const agenda = doc.getArray(DOC_AGENDA_KEY);

    meta.observeDeep(rebuild);
    settings.observeDeep(rebuild);
    participants.observeDeep(rebuild);
    rounds.observeDeep(rebuild);
    agenda.observeDeep(rebuild);

    this.observers = [
      () => meta.unobserveDeep(rebuild),
      () => settings.unobserveDeep(rebuild),
      () => participants.unobserveDeep(rebuild),
      () => rounds.unobserveDeep(rebuild),
      () => agenda.unobserveDeep(rebuild),
    ];
  }

  private detach(): void {
    this.electionHandle?.stop();
    this.electionHandle = null;
    this.autoRevealHandle?.stop();
    this.autoRevealHandle = null;
    this.sessionEventsHandle?.stop();
    this.sessionEventsHandle = null;
    for (const off of this.observers) off();
    this.observers = [];
    // A late call after leaving now refuses instead of writing to a destroyed doc (#516).
    this.boundCommands = null;
    this.sessionParticipantId = null;
  }

  private rebuildProjection(): void {
    if (!this.doc) return;
    this.projection.set(projectDoc(this.doc));
    // Synchronous notify — the drivers are plain callbacks, not effect()s,
    // so nothing has to be flushed for them to re-evaluate.
    this.notifyDrivers();
  }

  /**
   * Adapter for the shared election driver (ADR-0010, ADR-0048). Notified on every rebuild and
   * every awareness change: a kicked host sets `leftAt` without touching awareness, and vice
   * versa. Must start after {@link initAwareness}, or it would debounce against a present host.
   */
  private startElectionDriver(): void {
    this.electionHandle?.stop();
    this.electionHandle = startElection({
      projection: () => this.projection(),
      onlineIds: () => this.onlineParticipantIdsSignal(),
      myId: () => this.participantIdService.id(),
      subscribe: (cb) => this.subscribeDriver(cb),
      promote: (winnerId) => {
        promoteHostCommand(this.requireDoc('promoteHost'), winnerId);
      },
    });
  }

  /**
   * Adapter for the shared auto-reveal driver (ADR-0018). Session-scoped, not page-scoped: every
   * peer checks, and an online voter counts toward the denominator whatever screen it is on.
   */
  private startAutoRevealDriver(): void {
    this.autoRevealHandle?.stop();
    this.autoRevealHandle = startAutoReveal({
      projection: () => this.projection(),
      onlineIds: () => this.onlineParticipantIdsSignal(),
      // The gate itself — and the solo exemption — are the shared driver's;
      // this only says what the relay client reported.
      presenceTrusted: () => this.relaySyncedSignal(),
      selfId: () => this.sessionParticipantId,
      subscribe: (cb) => this.subscribeDriver(cb),
      reveal: () => {
        // Bump only when the write actually landed — a lost race no-ops, and
        // the Estimating page keys its haptic off this counter.
        if (this.commands.revealCurrentRound().applied) {
          this.autoRevealCountSignal.update((n) => n + 1);
        }
      },
    });
  }

  /**
   * Adapter for the shared session events driver (ADR-0023, ADR-0036 §5–6). Presence trust is
   * the live `relaySynced`, not the sticky first-sync flag: a host looks disconnected only to a
   * peer that is in sync itself.
   */
  private startSessionEventsDriver(participantId: string): void {
    this.sessionEventsHandle?.stop();
    this.sessionEventsHandle = startSessionEvents({
      projection: () => this.projection(),
      onlineIds: () => this.onlineParticipantIdsSignal(),
      presenceTrusted: () => this.relaySyncedSignal(),
      firstSyncCompleted: () => this.hasFirstSyncCompletedSignal(),
      endedLocally: () => this.endingSessionLocally(),
      selfId: participantId,
      subscribe: (cb) => this.subscribeDriver(cb),
      emit: (event) => {
        for (const listener of this.sessionEventListeners) listener(event);
      },
    });
  }

  private subscribeDriver(cb: () => void): () => void {
    this.driverNotifiers.add(cb);
    return (): void => {
      this.driverNotifiers.delete(cb);
    };
  }

  private notifyDrivers(): void {
    for (const notify of this.driverNotifiers) notify();
  }

  /**
   * The provider reuses this instance, so the local state reaches the wire as the socket opens
   * and survives reconnects. Seeded synchronously so no screen shows its own row offline.
   */
  private initAwareness(doc: Y.Doc, participantId: string): void {
    const awareness = new Awareness(doc);
    awareness.setLocalStateField(AWARENESS_PARTICIPANT_ID_FIELD, participantId);

    const refresh = (): void => {
      this.onlineParticipantIdsSignal.set(onlineIdsFrom(awareness.getStates()));
      this.notifyDrivers();
    };

    awareness.on('change', refresh);
    refresh();

    this.awareness = awareness;
    this.awarenessOff = (): void => awareness.off('change', refresh);
  }

  private teardownAwareness(): void {
    this.awarenessOff?.();
    this.awarenessOff = null;
    this.awareness?.destroy();
    this.awareness = null;
    this.onlineParticipantIdsSignal.set(new Set());
  }

  private requireDoc(op: string): Y.Doc {
    if (!this.doc) {
      throw new Error(`DocService.${op}: no active session`);
    }
    return this.doc;
  }
}
