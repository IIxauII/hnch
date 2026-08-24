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
  appendAgendaItem as appendAgendaItemY,
  appendRound as appendRoundY,
  clearCurrentVote as clearCurrentVoteCommand,
  currentRound as currentRoundFromProjection,
  discardCurrentRound as discardCurrentRoundCommand,
  DOC_AGENDA_KEY,
  DOC_META_KEY,
  DOC_PARTICIPANTS_KEY,
  DOC_ROUNDS_KEY,
  DOC_SETTINGS_KEY,
  endSessionForEveryone as endSessionForEveryoneY,
  initDoc,
  isActiveParticipant,
  joinDoc,
  leaveSession as leaveSessionY,
  nextPendingAgendaItem as nextPendingAgendaItemFromProjection,
  onlineIdsFrom,
  participantRole,
  patchSettings,
  projectDoc,
  patchRoundDescriptor as patchRoundDescriptorY,
  reorderAgendaItem as reorderAgendaItemY,
  removeParticipant as removeParticipantY,
  revealCurrentRound as revealCurrentRoundCommand,
  setAvatarColor as setAvatarColorY,
  setAgendaItemState as setAgendaItemStateY,
  screenFor,
  startAutoReveal,
  startElection,
  skipCurrentRound as skipCurrentRoundCommand,
  toggleCurrentVote as toggleCurrentVoteCommand,
  updateAgendaItemFields as updateAgendaItemFieldsY,
  upsertParticipant as upsertParticipantY,
  type AgendaItem,
  type AppendAgendaItemInit,
  type DocProjection,
  type AutoRevealHandle,
  type ElectionHandle,
  type InitDocInit,
  type JoinCredentials,
  type JoinRejectionReason,
  type Meta,
  type Participant,
  type ParticipantSnapshot,
  type Round,
  type Scale,
  type Screen,
  type Settings,
  type TerminalResult,
  type UpdateAgendaItemFieldsInit,
  type VoteResult,
} from '@hnch/shared';
import { Capacitor } from '@capacitor/core';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

import { environment } from '../../../environments/environment';
import { AppPreferenceService } from '../app-preference.service';
import { ParticipantIdService } from '../participant-id.service';
import { ToastService } from '../../services/toast.service';
import { createSyncProvider, type SyncProvider, type SyncStatus } from './sync-provider';

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
 * Shape of `startRound()`'s input. `parentRoundId` is set on re-votes
 * (ADR-0013); `agendaItemId` is set when started from an agenda item (ADR-0042).
 */
export interface StartRoundInit {
  readonly title?: string;
  readonly description?: string;
  readonly ticketId?: string;
  readonly parentRoundId?: string;
  /** ID of the agenda item this round was started from (ADR-0042). */
  readonly agendaItemId?: string;
}

/**
 * Options for {@link DocService.connect}. `wsBaseUrl` defaults to the
 * environment-configured relay URL; tests may override it.
 */
export interface ConnectOptions {
  readonly wsBaseUrl?: string;
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
  private persistence: IndexeddbPersistence | null = null;
  private observers: Array<() => void> = [];
  private readonly projection: WritableSignal<DocProjection | null> = signal<DocProjection | null>(
    null,
  );
  private readonly roomCodeSignal: WritableSignal<string | null> = signal<string | null>(null);
  private provider: SyncProvider | null = null;
  /**
   * Set in joinSession, consumed by the next connectWithPersistence call,
   * cleared immediately after. Used to gate the post-sync clearOwnLeftStatus
   * callback (ADR-0036 §6 LWW fix).
   */
  private joinParticipantId: string | null = null;
  private readonly syncStatusSignal: WritableSignal<SyncStatus | 'offline'> = signal<
    SyncStatus | 'offline'
  >('offline');
  private readonly lastRejectionSignal: WritableSignal<JoinRejectionReason | null> =
    signal<JoinRejectionReason | null>(null);
  /** Flips to true on the first `connected` event; resets on endSession. */
  private readonly hasEverConnectedSignal: WritableSignal<boolean> = signal(false);
  /**
   * Flips to true after the relay sends its first sync_step_2 and y-websocket
   * fires `onSynced`. Resets on `endSession`. Used by
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
   * True while the provider is attempting to reconnect after a transient
   * disconnect (network drop, no relay-issued close code). False when
   * connected, permanently rejected (`lastRejection` is set), or no
   * provider is active (`syncStatus === 'offline'`).
   *
   * Components should show a reconnecting indicator when this is truthy.
   * `'connecting'` is included because y-websocket re-emits it on each
   * retry attempt; `'offline'` is excluded because that means no provider.
   */
  /**
   * True once the relay has completed its first sync (y-websocket `onSynced`).
   * Resets to false on `endSession`. Consumers should not act on `leftAt`
   * transitions observed before this is true — those came from the snapshot
   * apply, not a live host action on this connection (ADR-0036 §6).
   */
  readonly hasFirstSyncCompleted: Signal<boolean> = this.hasFirstSyncCompletedSignal.asReadonly();

  readonly reconnecting: Signal<boolean> = computed(() => {
    const s = this.syncStatusSignal();
    return (
      this.hasEverConnectedSignal() &&
      (s === 'disconnected' || s === 'connecting') &&
      this.lastRejectionSignal() === null
    );
  });

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
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Seed a fresh `Y.Doc` with the provided init. Throws if a session
   * is already live — callers must call {@link endSession} first to
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
    this.attach(doc);
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
      ...(init.avatarColor !== undefined && { avatarColor: init.avatarColor }),
    });

    // Awareness before attach — see the note in `createSession`.
    this.initAwareness(doc, init.participantId);
    this.attach(doc);
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

    // Use AppPreferenceService relay URL override if set; fallback to environment default.
    const wsUrl = opts.wsBaseUrl ?? this.appPrefs.relayWsUrl() ?? environment.relayWsUrl;

    void this.connectWithPersistence(doc, roomUuid, wsUrl, credentials, this.joinParticipantId);
    this.joinParticipantId = null;
  }

  private async connectWithPersistence(
    doc: Y.Doc,
    roomUuid: string,
    wsUrl: string,
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

    this.provider = createSyncProvider({
      wsBaseUrl: wsUrl,
      roomUuid,
      doc,
      credentials,
      ...(this.awareness !== null && { awareness: this.awareness }),
      toastService: this.toastService,
      onStatusChange: (status) => {
        this.syncStatusSignal.set(status);
        if (status === 'connected') this.hasEverConnectedSignal.set(true);
      },
      onRejectionChange: (reason) => this.lastRejectionSignal.set(reason),
      // ADR-0036 §6 LWW fix: flip `hasFirstSyncCompleted` before clearing any
      // stale `leftAt`/`removedBy` so that `ParticipantRemovalService` can
      // distinguish snapshot-apply observations from live host kicks. When this
      // client joined (not created) the session, the delete carries a higher
      // Lamport clock than the snapshot's `set('leftAt', ...)` and wins the
      // LWW merge, making the participant active again.
      onSynced: () => {
        this.hasFirstSyncCompletedSignal.set(true);
        if (joinParticipantId !== null) {
          this.clearOwnLeftStatus(joinParticipantId);
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
   * Close the sync connection without tearing down the session. Used
   * when the client wants to drop the socket but keep viewing local
   * state; {@link endSession} calls this automatically.
   */
  disconnect(): void {
    if (this.provider === null) {
      this.syncStatusSignal.set('offline');
      return;
    }
    this.provider.disconnect();
    this.provider = null;
    this.syncStatusSignal.set('offline');
  }

  /**
   * Tear down the active session. Unobserves all observers, destroys
   * the `Y.Doc`, and nulls the projection so `hasSession()` flips back
   * to `false`. Idempotent — safe to call when no session is active.
   */
  endSession(): void {
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
    this.hasEverConnectedSignal.set(false);
    this.hasFirstSyncCompletedSignal.set(false);
    this.endingSessionLocally.set(false);
    this.joinParticipantId = null;
  }

  // ---------------------------------------------------------------------------
  // Mutations (delegate straight to the pure helpers)
  // ---------------------------------------------------------------------------

  updateSettings(patch: Partial<Settings>): void {
    patchSettings(this.requireDoc('updateSettings'), patch);
  }

  upsertParticipant(id: string, value: Participant): void {
    upsertParticipantY(this.requireDoc('upsertParticipant'), id, value);
  }

  /**
   * Write the caller's chosen avatar color to their participant record
   * (ADR-0043). Caller is responsible for sanitizing via
   * `parseAvatarColor` first — bad input is the writer's bug, not the
   * reader's problem.
   *
   * No-op when no session is active.
   */
  setAvatarColor(participantId: string, color: string): void {
    if (this.doc === null) return;
    setAvatarColorY(this.doc, participantId, color);
  }

  /**
   * Flip a participant's role between `'voter'` and `'viewer'`.
   * Reads the current participant snapshot to preserve all other fields.
   */
  toggleRole(participantId: string): void {
    const participant = this.participants().find((p) => p.id === participantId);
    if (!participant) return;
    const currentRole = participantRole(participant);
    const nextRole = currentRole === 'voter' ? 'viewer' : 'voter';
    upsertParticipantY(this.requireDoc('toggleRole'), participantId, {
      displayName: participant.displayName,
      joinedAt: participant.joinedAt,
      role: nextRole,
    });
  }

  /**
   * Append a round to the session. `scale` is inherited from
   * `settings.defaultScale` inside the pure helper; we only need to
   * decide `id`, `createdBy`, `createdAt`. `createdBy` comes from the
   * current `hostParticipantId` — in Phase 2 that's always you, but
   * this keeps the attribution honest once Phase 3 adds joiners.
   */
  startRound(descriptor: StartRoundInit, opts: { now?: () => number } = {}): string {
    const doc = this.requireDoc('startRound');
    const settings = this.settings();
    const createdBy = settings?.hostParticipantId;
    if (!createdBy) {
      throw new Error('DocService.startRound: no hostParticipantId in settings');
    }
    const id = crypto.randomUUID();
    const now = opts.now ?? (() => Date.now());
    const timestamp = now();
    appendRoundY(doc, {
      id,
      createdAt: timestamp,
      createdBy,
      ...(descriptor.title !== undefined && { title: descriptor.title }),
      ...(descriptor.description !== undefined && {
        description: descriptor.description,
      }),
      ...(descriptor.ticketId !== undefined && { ticketId: descriptor.ticketId }),
      ...(descriptor.parentRoundId !== undefined && {
        parentRoundId: descriptor.parentRoundId,
      }),
      ...(descriptor.agendaItemId !== undefined && {
        agendaItemId: descriptor.agendaItemId,
      }),
    });
    return id;
  }

  updateRoundDescriptor(roundId: string, fields: { title?: string; description?: string }): void {
    patchRoundDescriptorY(this.requireDoc('updateRoundDescriptor'), roundId, fields);
  }

  /**
   * Cast, change, or clear the caller's vote on the active round via the
   * shared `vote-commands` seam. No round id — the command selects
   * `activeRound` internally and applies the toggle rule (re-selecting the
   * card already on record clears it) plus the voter-role gate. Returns a
   * `VoteResult` so callers branch on `applied` (e.g. suppress haptics on a
   * refusal) instead of re-spelling the gate.
   */
  toggleCurrentVote(participantId: string, card: string): VoteResult {
    return toggleCurrentVoteCommand(this.requireDoc('toggleCurrentVote'), participantId, card);
  }

  /**
   * Clear the caller's vote on the active round via the shared command.
   * Gated on the active round only — not on voter role — so a participant
   * who flips voter → viewer mid-round can still withdraw a vote already
   * sitting in the tally. See `toggleCurrentVote`.
   *
   * **No production caller yet, deliberately.** The Estimating page renders
   * no card grid and no abstain button for a viewer, so the role-flip escape
   * this exemption exists for is not reachable from the UI today; the CLI's
   * only clear path (Backspace/Delete in `CardPicker`) is likewise hidden
   * from viewers. This is the seam a future "withdraw my vote" affordance
   * binds to — keep it rather than inlining `toggleCurrentVote` at that
   * point, since clearing must stay ungated on role.
   */
  clearCurrentVote(participantId: string): VoteResult {
    return clearCurrentVoteCommand(this.requireDoc('clearCurrentVote'), participantId);
  }

  /**
   * Reveal the current round via the shared `round-commands` seam. No-arg —
   * the command selects `currentRound` and applies the terminal-legality gate
   * internally. Returns a `TerminalResult` so callers branch on `applied`
   * (e.g. suppress haptics on a lost race) instead of re-spelling the gate.
   */
  revealCurrentRound(opts: { now?: () => number } = {}): TerminalResult {
    const clock = opts.now ?? Date.now;
    return revealCurrentRoundCommand(this.requireDoc('revealCurrentRound'), clock);
  }

  /** Skip the current round via the shared command. See `revealCurrentRound`. */
  skipCurrentRound(): TerminalResult {
    return skipCurrentRoundCommand(this.requireDoc('skipCurrentRound'));
  }

  /**
   * Host back-chevron discard of the current round. Writes `discardedAt` +
   * `discardedBy` — distinct from reveal/skip, leaves any linked agenda item
   * `pending` and excludes the round from `currentRound()` and history
   * projections. UI must gate on `isHost()`; the command does not enforce
   * host authority (matches the reveal/skip surface).
   */
  discardCurrentRound(discardedBy: string): TerminalResult {
    return discardCurrentRoundCommand(this.requireDoc('discardCurrentRound'), discardedBy);
  }

  /**
   * Write `sessionEndedAt` to meta, broadcasting session termination to all
   * peers. Sets `endingSessionLocally` so `SessionEndService` can distinguish
   * this local trigger from a remote one.
   */
  endSessionForEveryone(): void {
    this.endingSessionLocally.set(true);
    endSessionForEveryoneY(this.requireDoc('endSessionForEveryone'));
  }

  /**
   * Voluntary leave — soft-deletes own participant record (ADR-0036).
   * Call before tearing down the local session so the mutation reaches
   * peers before the WS closes.
   */
  leaveSession(selfId: string): void {
    leaveSessionY(this.requireDoc('leaveSession'), selfId);
  }

  /**
   * Host kick — soft-deletes the target participant's record (ADR-0036).
   * No-op when `targetId === hostId`. UI must gate on `isHost()`.
   */
  removeParticipant(hostId: string, targetId: string): void {
    removeParticipantY(this.requireDoc('removeParticipant'), hostId, targetId);
  }

  // ---------------------------------------------------------------------------
  // Agenda mutations (ADR-0042)
  // ---------------------------------------------------------------------------

  /**
   * Append a new agenda item. Validates that at least one of `{title, ticketId}`
   * is non-empty. Returns the new item's id.
   * UI should gate on `isHost()` — service calls through unconditionally.
   */
  appendAgendaItem(init: Omit<AppendAgendaItemInit, 'createdAt'>): string {
    return appendAgendaItemY(this.requireDoc('appendAgendaItem'), {
      ...init,
      createdAt: Date.now(),
    });
  }

  /**
   * Patch editable fields (title, ticketId, description) on a pending agenda item.
   * Throws when item is not found or state is skipped/cancelled.
   */
  updateAgendaItemFields(id: string, patch: UpdateAgendaItemFieldsInit): void {
    updateAgendaItemFieldsY(this.requireDoc('updateAgendaItemFields'), id, patch);
  }

  /**
   * Soft-delete an agenda item (state → 'cancelled').
   */
  cancelAgendaItem(id: string): void {
    setAgendaItemStateY(this.requireDoc('cancelAgendaItem'), id, 'cancelled');
  }

  /**
   * Skip an agenda item without creating a round (state → 'skipped').
   */
  skipAgendaItem(id: string): void {
    setAgendaItemStateY(this.requireDoc('skipAgendaItem'), id, 'skipped');
  }

  /**
   * Reorder a pending agenda item. `before` / `after` are the sortKeys of the
   * adjacent items; pass null/undefined for the list boundaries.
   */
  reorderAgendaItem(id: string, before?: string | null, after?: string | null): void {
    reorderAgendaItemY(this.requireDoc('reorderAgendaItem'), id, before, after);
  }

  /**
   * Clear `leftAt` and `removedBy` on the local participant's record after
   * the relay snapshot has synced (ADR-0036 §6 LWW fix).
   *
   * Called from the `onSynced` hook in `connectWithPersistence` — at that
   * point the relay's ops are already applied to the doc, so this delete
   * carries a higher Lamport clock than the snapshot's `set('leftAt', ...)`
   * and wins the LWW merge. The participant transitions back to active.
   *
   * No-op when the doc is not active or the participant has no `leftAt`.
   */
  private clearOwnLeftStatus(selfId: string): void {
    const doc = this.doc;
    if (!doc) return;
    const participantsMap = doc.getMap(DOC_PARTICIPANTS_KEY) as Y.Map<Y.Map<unknown>>;
    const me = participantsMap.get(selfId);
    if (!me || !me.has('leftAt')) return;
    doc.transact(() => {
      me.delete('leftAt');
      me.delete('removedBy');
    });
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
  private attach(doc: Y.Doc): void {
    this.doc = doc;
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
      promote: (winnerId) => this.updateSettings({ hostParticipantId: winnerId }),
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
        if (this.revealCurrentRound().applied) {
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
