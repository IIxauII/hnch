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

/**
 * Caller-facing init for {@link DocService.createSession}. Mirrors the
 * fields in {@link InitDocInit} but the service fills in `createdAt`;
 * `roomUuid` is the one the relay minted at `POST /rooms` and
 * `roomCode` is its human-typeable twin.
 */
export interface CreateSessionInit {
  readonly participantId: string;
  readonly displayName: string;
  readonly defaultScale: Scale;
  readonly sessionName?: string;
  /**
   * Optional avatar color wire value (ADR-0043). Caller should pass the
   * pre-validated value from `AvatarColorService` so the creator's color
   * is visible to peers from the first relay snapshot.
   */
  readonly avatarColor?: string;
  /**
   * The room's UUID, minted by the relay's `POST /rooms` response
   * (ADR-0016). Tests may pass a stable value; production always
   * plumbs through the relay's assignment.
   *
   * Optional for back-compat with tests that mint a purely local doc;
   * when omitted, a fresh `crypto.randomUUID()` fills in.
   */
  readonly roomUuid?: string;
  /**
   * The 6-character room code (ADR-0008). Kept on the service as a
   * separate signal rather than inside the Yjs doc — schema.md is
   * explicit that "room codes do not appear in the doc" (the code is
   * a relay-side lookup, the doc travels under the UUID).
   */
  readonly roomCode?: string;
  /** Clock injection point. Tests freeze this; production omits. */
  readonly now?: () => number;
}

/**
 * Options for {@link DocService.connect}. `httpBaseUrl` defaults to the
 * resolved relay URL (override, else environment); tests may override it.
 * `relay-client` derives the WebSocket URL from it.
 */
export interface ConnectOptions {
  readonly httpBaseUrl?: string;
  /** Override room UUID — required when joining via {@link DocService.joinSession} since meta hasn't synced yet. */
  readonly roomUuid?: string;
}

/**
 * Yjs-backed session state exposed as Angular signals.
 *
 * All Yjs specifics — the `Y.Doc`, the `Y.observe*` wiring, the
 * container key constants — live behind this service. Components bind
 * to the exposed signals through `computed()` selectors; they never
 * import `yjs` directly. That keeps the binding layer swappable
 * (plan §2.1) and keeps every screen framework-free of the CRDT layer.
 *
 * The projection + mutation logic proper lives in
 * `@hnch/shared/doc-projection` so it stays unit-testable against a
 * headless `Y.Doc`; this service is a thin Angular wrapper on top.
 *
 * Phase 3 adds a sync-provider handle: {@link connect} opens a
 * `y-websocket` against the relay once the session exists, and
 * {@link syncStatus} reflects the live connection state for the
 * UI's status chip.
 */
@Injectable({ providedIn: 'root' })
export class DocService {
  private readonly appPrefs = inject(AppPreferenceService);
  private readonly toastService = inject(ToastService);
  private readonly participantIdService = inject(ParticipantIdService);

  // ---------------------------------------------------------------------------
  // Private Yjs + sync state
  // ---------------------------------------------------------------------------

  private doc: Y.Doc | null = null;
  /**
   * The writer seam bound to the live session, or `null` before {@link attach}
   * and after {@link detach}. Backs the public {@link commands} getter — never
   * read directly outside it, so a stale set bound to a destroyed doc can
   * never leak past the null check.
   */
  private boundCommands: SessionCommands | null = null;
  private persistence: IndexeddbPersistence | null = null;
  private observers: Array<() => void> = [];
  private readonly projection: WritableSignal<DocProjection | null> = signal<DocProjection | null>(
    null,
  );
  private readonly roomCodeSignal: WritableSignal<string | null> = signal<string | null>(null);
  private provider: RelayConnection | null = null;
  /**
   * Set in joinSession, consumed by the next connectWithPersistence call,
   * cleared immediately after. Used to gate the post-sync `rejoin` roster
   * write (ADR-0036 §6 LWW fix).
   */
  private joinParticipantId: string | null = null;
  private readonly syncStatusSignal: WritableSignal<SyncStatus | 'offline'> = signal<
    SyncStatus | 'offline'
  >('offline');
  private readonly lastRejectionSignal: WritableSignal<JoinRejectionReason | null> =
    signal<JoinRejectionReason | null>(null);
  /**
   * Mirrors `relay-client`'s derived reconnecting state. It owns the
   * derivation (first-connect gate, permanent rejection, manual teardown);
   * this service only holds the last value it pushed.
   */
  private readonly reconnectingSignal: WritableSignal<boolean> = signal(false);
  /**
   * Flips to true after the relay sends its first sync_step_2 and y-websocket
   * fires `onSynced`. Resets on `teardown`. Used by
   * `ParticipantRemovalService` to gate kick handling: any `leftAt` observed
   * before this flips came in via the snapshot apply (prior kick), not a live
   * host action on this connection.
   */
  private readonly hasFirstSyncCompletedSignal: WritableSignal<boolean> = signal(false);
  /**
   * True while `endSessionForEveryone()` is in flight locally — guards the
   * `SessionEndService` observer from treating a self-triggered end as a
   * remote one.
   */
  readonly endingSessionLocally: WritableSignal<boolean> = signal(false);
  private awareness: Awareness | null = null;
  private awarenessOff: (() => void) | null = null;
  /**
   * Session-scoped host-election handle (ADR-0010). Started in
   * {@link attach}, stopped in {@link detach} — deliberately *not*
   * app-lifetime, so a doc-less app arms no timers.
   */
  private electionHandle: ElectionHandle | null = null;
  /**
   * Session-scoped unanimous auto-reveal handle (ADR-0018). Started and
   * stopped alongside {@link electionHandle}: the rule applies for the whole
   * session, not just while the Estimating page happens to be mounted.
   */
  private autoRevealHandle: AutoRevealHandle | null = null;
  /**
   * Change callbacks of every live shared driver. One fan-out, so there is a
   * single place deciding what counts as a change — the axis two hand-wired
   * drivers would otherwise drift on.
   */
  private readonly driverNotifiers = new Set<() => void>();
  private readonly onlineParticipantIdsSignal: WritableSignal<ReadonlySet<string>> = signal<
    ReadonlySet<string>
  >(new Set());
  private readonly autoRevealCountSignal: WritableSignal<number> = signal(0);

  // ---------------------------------------------------------------------------
  // Public signals
  // ---------------------------------------------------------------------------

  readonly hasSession: Signal<boolean> = computed(() => this.projection() !== null);

  /**
   * Full live projection snapshot, or `null` when no session is live.
   * Also feeds the shared host-election driver started in {@link attach}
   * (ADR-0048) — this service supplies the live projection; the
   * intersection with awareness happens inside `@hnch/shared`.
   */
  readonly projectionSnapshot: Signal<DocProjection | null> = this.projection.asReadonly();

  readonly meta: Signal<Meta | null> = computed(() => this.projection()?.meta ?? null);

  readonly settings: Signal<Settings | null> = computed(() => this.projection()?.settings ?? null);

  readonly participants: Signal<readonly ParticipantSnapshot[]> = computed(
    () => this.projection()?.participants ?? [],
  );

  /**
   * Active participants — raw list filtered through `isActiveParticipant`
   * (ADR-0036). Use this for any "who is in the session right now?" query:
   * lobby roster, voter denominator, auto-reveal check, online intersection.
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

  /**
   * Pending agenda items only — convenience filter for the agenda panel.
   */
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
   * revealed, skipped, or discarded (the seam `toggleCurrentVote` /
   * `clearCurrentVote` close). `currentRound` answers "what should Lobby
   * show"; `activeRound` answers "is there a round still open to vote on
   * right now" — bind vote-surface visibility to this, not `currentRound`.
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
   * on a slow network and lets the WebSocket reconnect in the background, so
   * a page genuinely can mount with no doc. A navigation effect that read a
   * missing projection as "no active round" would bounce those peers to
   * Lobby; `null` means "don't know yet, stay put".
   */
  readonly screen: Signal<Screen | null> = computed(() => {
    const snap = this.projection();
    return snap ? screenFor(snap) : null;
  });

  /**
   * Monotonic count of unanimous auto-reveals this session has written
   * (ADR-0018). A counter rather than a timestamp: two auto-reveals landing
   * in the same millisecond must still notify, and there is nothing to reset.
   *
   * Consumers use it purely as an edge signal — the Estimating page fires its
   * success haptic on a change. Device feedback stays out of the doc layer.
   */
  readonly autoRevealCount: Signal<number> = this.autoRevealCountSignal.asReadonly();

  /**
   * The relay-assigned 6-character room code (ADR-0008). `null` before
   * {@link createSession} runs or if the caller didn't plumb a code
   * through (e.g., local-only test seeds).
   */
  readonly roomCode: Signal<string | null> = this.roomCodeSignal.asReadonly();

  /**
   * Sync connection status. `'offline'` while no provider is attached
   * (pre-connect, post-disconnect); otherwise mirrors the y-websocket
   * `status` event's `connecting | connected | disconnected`.
   */
  readonly syncStatus: Signal<SyncStatus | 'offline'> = this.syncStatusSignal.asReadonly();

  /**
   * Last relay-issued join rejection (ADR-0016's close-code table), if
   * any. Reset on each successful connect.
   */
  readonly lastRejection: Signal<JoinRejectionReason | null> =
    this.lastRejectionSignal.asReadonly();

  /**
   * True once the relay has completed its first sync (y-websocket `onSynced`).
   * Resets to false on `teardown`. Consumers should not act on `leftAt`
   * transitions observed before this is true — those came from the snapshot
   * apply, not a live host action on this connection (ADR-0036 §6).
   */
  readonly hasFirstSyncCompleted: Signal<boolean> = this.hasFirstSyncCompletedSignal.asReadonly();

  /**
   * True while the connection is retrying after a transient disconnect
   * (network drop, no relay-issued close code). False before the first
   * successful connect, while connected, once permanently rejected, and
   * during a manual teardown.
   *
   * Components should show a reconnecting indicator when this is truthy.
   */
  readonly reconnecting: Signal<boolean> = this.reconnectingSignal.asReadonly();

  /**
   * Set of participantIds that are currently online per awareness
   * (plan §3.7). Seeded with the local participant as soon as
   * {@link createSession} runs; peers are added/removed as
   * y-websocket propagates their awareness changes.
   *
   * Consumers typically read {@link onlineParticipants} /
   * {@link offlineParticipants} instead of this raw set, but the set
   * is exposed for components (like `avatar-vote-row`) that want to
   * intersect it against a round's `votes`.
   */
  readonly onlineParticipantIds: Signal<ReadonlySet<string>> =
    this.onlineParticipantIdsSignal.asReadonly();

  /**
   * Active participants filtered to those whose `participantId` is currently
   * in awareness. Used by Lobby's row styling and Estimating's avatar
   * row — a ghost from a silent disconnect drops off here, whereas
   * the Yjs participants list keeps them ("the vote was cast"
   * semantic). Left/kicked participants are excluded (ADR-0036).
   */
  readonly onlineParticipants: Signal<readonly ParticipantSnapshot[]> = computed(() => {
    const online = this.onlineParticipantIdsSignal();
    return this.activeParticipants().filter((p) => online.has(p.id));
  });

  /** Complement of {@link onlineParticipants} within the active set. Rendered dimmed. */
  readonly offlineParticipants: Signal<readonly ParticipantSnapshot[]> = computed(() => {
    const online = this.onlineParticipantIdsSignal();
    return this.activeParticipants().filter((p) => !online.has(p.id));
  });

  // ---------------------------------------------------------------------------
  // Writer seam (#516)
  // ---------------------------------------------------------------------------

  /**
   * The whole UI-facing writer seam — every act a peer can take against the
   * live session, bound once in {@link attach}. `UNBOUND_SESSION_COMMANDS`
   * before a session exists and after {@link teardown}, so no consumer
   * branches on `hasSession()` to reach a writer; every member just refuses
   * honestly instead.
   *
   * A getter rather than a signal: writers are not reactive state. Backed by
   * {@link boundCommands} rather than exposed directly, so a second session
   * rebinding (or {@link teardown} clearing it) can never leave a stale set —
   * bound to a doc that no longer exists — reachable from here.
   */
  get commands(): SessionCommands {
    return this.boundCommands ?? UNBOUND_SESSION_COMMANDS;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Seed a fresh `Y.Doc` with the provided init. Throws if a session
   * is already live — callers must call {@link teardown} first to
   * keep the single-session invariant explicit.
   *
   * Returns the room UUID (either minted here or passed in).
   */
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
   * Join an existing session on the relay. Unlike {@link createSession},
   * this only writes the participant entry — settings, meta, and
   * `hostParticipantId` are received from the relay via Yjs sync,
   * avoiding CRDT-merge conflicts with the creator's initial writes.
   */
  joinSession(init: {
    participantId: string;
    displayName: string;
    roomCode?: string;
    /** Avatar color wire value (ADR-0043), pre-validated by `AvatarColorService`. */
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
    // Store so connectWithPersistence can schedule the post-sync leftAt clear
    // (ADR-0036 §6 LWW fix — delete must run after relay snapshot merges).
    this.joinParticipantId = init.participantId;
  }

  /**
   * Open a sync connection to the relay for the active session.
   * Throws if no session exists; idempotently no-ops if a provider is
   * already attached. Credentials follow ADR-0016's query-param
   * encoding — `deviceId` is always sent; Phase-5 password/invite
   * fields ride on the same object without any wire change.
   */
  connect(credentials: JoinCredentials, opts: ConnectOptions = {}): void {
    const doc = this.requireDoc('connect');
    if (this.provider !== null) return;
    const roomUuid = opts.roomUuid ?? this.meta()?.roomUuid;
    if (roomUuid === undefined) {
      throw new Error('DocService.connect: session has no roomUuid');
    }

    // Start in `connecting` immediately so the UI's status chip doesn't
    // flash `offline` during the one-tick gap before y-websocket's
    // first `status` event fires.
    this.syncStatusSignal.set('connecting');

    const httpUrl = opts.httpBaseUrl ?? this.appPrefs.resolvedRelayHttpUrl();

    void this.connectWithPersistence(doc, roomUuid, httpUrl, credentials, this.joinParticipantId);
    this.joinParticipantId = null;
  }

  private async connectWithPersistence(
    doc: Y.Doc,
    roomUuid: string,
    httpBaseUrl: string,
    credentials: JoinCredentials,
    joinParticipantId: string | null = null,
  ): Promise<void> {
    // PWA: load local IndexedDB snapshot before opening WebSocket so the
    // UI is immediately populated from cache (ADR-0004).
    // Native: SQLite persistence deferred to Phase 6b (ADR-0004).
    if (!Capacitor.isNativePlatform()) {
      this.persistence = new IndexeddbPersistence(roomUuid, doc);
      await this.persistence.whenSynced;
    }

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
        void this.toastService.error('Trouble reaching the room — retrying.');
      },
      // ADR-0036 §6 LWW fix: flip `hasFirstSyncCompleted` before clearing any
      // stale `leftAt`/`removedBy` so that `ParticipantRemovalService` can
      // distinguish snapshot-apply observations from live host kicks. When this
      // client joined (not created) the session, the delete carries a higher
      // Lamport clock than the snapshot's `set('leftAt', ...)` and wins the
      // LWW merge, making the participant active again.
      onSynced: () => {
        this.hasFirstSyncCompletedSignal.set(true);
        if (joinParticipantId !== null) {
          rejoinRoster(doc, joinParticipantId);
        }
      },
    });
  }

  /**
   * Wait for the active WebSocket's `bufferedAmount` to drain before the
   * caller tears down the session. Gives y-websocket a chance to flush
   * any pending Yjs updates (e.g. `leaveSession` mutation) before the
   * socket is closed.
   *
   * - Polls at 16 ms intervals (≈ one animation frame) for up to `cap` ms.
   * - Resolves immediately when no provider is attached or the buffer is
   *   already empty.
   * - Always resolves (never rejects) — the leave mutation reaching peers
   *   is best-effort; the local session teardown must not block on it.
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
   * Re-handshake the live socket with a new password hash, without tearing
   * the session down (ADR-0017). Called after the host rotates the room
   * password so this client's own connection stops carrying the stale `pw`
   * and survives its next reconnect. Pass `null` when the room reverts to
   * open. No-op when the hash is unchanged or no connection is attached.
   */
  updateCredentials(passwordHash: string | null): void {
    this.provider?.updateCredentials({ passwordHash });
  }

  /**
   * Close the sync connection without tearing down the session. Used
   * when the client wants to drop the socket but keep viewing local
   * state; {@link teardown} calls this automatically.
   */
  disconnect(): void {
    if (this.provider === null) {
      this.syncStatusSignal.set('offline');
      this.reconnectingSignal.set(false);
      return;
    }
    this.provider.disconnect();
    this.provider = null;
    this.syncStatusSignal.set('offline');
    this.reconnectingSignal.set(false);
  }

  /**
   * Tear down the active session. Unobserves all observers, destroys
   * the `Y.Doc`, and nulls the projection so `hasSession()` flips back
   * to `false`. Idempotent — safe to call when no session is active.
   *
   * Named apart from the roster command it shares a session with — this
   * means the opposite kind of act. `endSession` (via {@link commands}) ends
   * the session *for everyone*, a write every peer observes; `teardown`
   * destroys only the local doc and writes nothing. `detach` drops
   * {@link boundCommands} as part of this, so a call that lands after
   * teardown refuses through {@link UNBOUND_SESSION_COMMANDS} instead of
   * reaching a destroyed doc (#516).
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
  }

  // ---------------------------------------------------------------------------
  // Mutations carrying client behaviour (#516)
  // ---------------------------------------------------------------------------
  //
  // Everything else a peer can write goes through `commands`, bound once in
  // `attach`. The three members below stay named because each carries
  // behaviour beyond a `requireDoc` — see each doc comment for why.

  /**
   * Patch session settings. `PublicSettingsPatch` excludes
   * `hostParticipantId` by construction — host changes go through
   * `commands.handoffHost` / the election adapter's `promoteHost`, which is
   * where the rules live (#507). Its own narrowed parameter type is its
   * gate, which is why it stays a forward rather than joining the bound set.
   */
  updateSettings(patch: PublicSettingsPatch): void {
    patchSettings(this.requireDoc('updateSettings'), patch);
  }

  /**
   * Patch a round's `title` / `description`. Not a command — there is no
   * rule to apply, so it stays a plain forward alongside `updateSettings`.
   */
  updateRoundDescriptor(roundId: string, fields: { title?: string; description?: string }): void {
    patchRoundDescriptorY(this.requireDoc('updateRoundDescriptor'), roundId, fields);
  }

  /**
   * Write `sessionEndedAt` to meta, broadcasting session termination to all
   * peers, via `commands.endSession()`. Sets `endingSessionLocally` so
   * `SessionEndService` can distinguish this local trigger from a remote one
   * — but only once the shared host gate has actually applied the write, or
   * a refused mis-tap would leave the end-session banner armed for a session
   * that is still running. This is the one act that is genuinely not a
   * forward, which is why it keeps its name rather than folding into
   * `commands`.
   */
  endSessionForEveryone(): RosterResult {
    const result = this.commands.endSession();
    if (result.applied) this.endingSessionLocally.set(true);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Wire `Y.observe` on each top-level container. Every event triggers
   * a full-projection rebuild; see plan §2.1 (and the "projection
   * granularity" risk in plan §7) for why that's acceptable at Phase 2
   * scale.
   */
  private attach(doc: Y.Doc, participantId: string): void {
    this.doc = doc;
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
    for (const off of this.observers) off();
    this.observers = [];
    // Drop the bound set so a late call after leaving refuses through
    // `UNBOUND_SESSION_COMMANDS` rather than writing to a destroyed doc; a
    // second session rebinds a fresh set in `attach` (#516).
    this.boundCommands = null;
  }

  private rebuildProjection(): void {
    if (!this.doc) return;
    this.projection.set(projectDoc(this.doc));
    // Synchronous notify — the drivers are plain callbacks, not effect()s,
    // so nothing has to be flushed for them to re-evaluate.
    this.notifyDrivers();
  }

  /**
   * Wire the shared host-election driver to this session (ADR-0010,
   * ADR-0048). The rule, the 5 s debounce, and the missing-host state all
   * live in `@hnch/shared`; this is the adapter. It is notified on every
   * projection rebuild *and* every awareness change — a kicked host sets
   * `leftAt` without touching awareness, and vice versa.
   *
   * Called from {@link attach}, which both session entry points run *after*
   * {@link initAwareness} — the driver's initial evaluation must not see an
   * empty online set, or it would arm a debounce against a present host.
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
   * Wire the shared unanimous auto-reveal driver to this session (ADR-0018).
   * The predicate, the re-evaluation contract, and the terminal guard that
   * makes per-round bookkeeping unnecessary all live in `@hnch/shared`; this
   * is the adapter.
   *
   * Session-scoped rather than page-scoped: ADR-0018 has every peer check
   * independently, and the predicate counts an online voter toward the
   * denominator regardless of which screen it is on — so it would be
   * incoherent for such a peer to count but not check.
   */
  private startAutoRevealDriver(): void {
    this.autoRevealHandle?.stop();
    this.autoRevealHandle = startAutoReveal({
      projection: () => this.projection(),
      onlineIds: () => this.onlineParticipantIdsSignal(),
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

  /** Register a shared driver's change callback. Returns its unsubscribe. */
  private subscribeDriver(cb: () => void): () => void {
    this.driverNotifiers.add(cb);
    return (): void => {
      this.driverNotifiers.delete(cb);
    };
  }

  /** Fan a change out to every live driver. */
  private notifyDrivers(): void {
    for (const notify of this.driverNotifiers) notify();
  }

  /**
   * Spin up the local awareness channel (plan §3.7). The provider in
   * {@link connect} reuses this instance so the `setLocalStateField`
   * we write here lands on the wire as soon as the socket opens; a
   * fresh provider after a reconnect picks up the same awareness and
   * keeps the peer set coherent across drop-and-rejoin sequences.
   *
   * We seed the local peer synchronously so `onlineParticipantIds`
   * already contains the local participant before any network event —
   * Lobby / Estimating never observe a "my own row is offline" flash.
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
