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
  type LiveSessionRoom,
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

/** What {@link DocService.open} needs: the room as the relay issued it, who this peer is, the seed. */
export interface OpenSessionInit {
  /** Minted at `POST /rooms` (ADR-0016) or resolved from the code. */
  readonly room: LiveSessionRoom;
  /** Also the device id the connection presents to the relay. */
  readonly participantId: string;
  readonly displayName: string;
  /** Pre-validated by `AvatarColorService`, so peers see it from the first snapshot (ADR-0043). */
  readonly avatarColor?: string;
  /** Present for a password-protected room (ADR-0017). */
  readonly passwordHash?: string;
  /**
   * `create` seeds the whole doc and makes this peer the host; `join` writes only this peer's
   * record, so settings, meta and the host arrive from the relay without a merge conflict.
   */
  readonly seed: LiveSessionSeed;
  /** Defaults to the resolved relay URL. */
  readonly httpBaseUrl?: string;
  readonly now?: () => number;
}

/**
 * The client's adapter over the shared live session (#529), as Angular signals. How a session
 * behaves — the doc, presence, the relay connection, change tracking, the drivers, the bound
 * commands, teardown — is `@hnch/shared`'s `live-session`, the module the CLI runs on too. What
 * stays here is the client's own: the signals that mirror its readings, the session epoch, the
 * auto-reveal counter, the IndexedDB load before the socket opens (ADR-0004) and the copy of the
 * repeated-trouble toast. Components never import `yjs`.
 */
@Injectable({ providedIn: 'root' })
export class DocService {
  private readonly appPrefs = inject(AppPreferenceService);
  private readonly toastService = inject(ToastService);

  // The live session and what it reports

  /** `null` before {@link open} and after {@link teardown}. */
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
  private readonly sessionEpochSignal: WritableSignal<number> = signal(0);
  private readonly relayRoomUuidSignal: WritableSignal<string | null> = signal<string | null>(null);
  private readonly onlineParticipantIdsSignal: WritableSignal<ReadonlySet<string>> = signal<
    ReadonlySet<string>
  >(new Set());
  private readonly autoRevealCountSignal: WritableSignal<number> = signal(0);
  /** App-lifetime, unlike the sessions whose events they hear: the app-level sinks register once. */
  private readonly sessionEventListeners = new Set<(event: SessionEvent) => void>();

  // Public signals

  readonly hasSession: Signal<boolean> = computed(() => this.projection() !== null);

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
   * Auto-reveals this peer wrote (ADR-0018), bumped on the live session's "auto-reveal applied"
   * reading, so a lost race does not count. An edge signal for the success haptic: a counter, not
   * a timestamp, so two in the same millisecond still notify.
   */
  readonly autoRevealCount: Signal<number> = this.autoRevealCountSignal.asReadonly();

  /** The 6-character code the session was opened under (ADR-0008); `null` with no session. */
  readonly roomCode: Signal<string | null> = this.roomCodeSignal.asReadonly();

  /** `'offline'` with no session; `'connecting'` from {@link open} on, until the live session says otherwise. */
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
   * Retrying after a transient drop. False before the first connect, while connected, once
   * rejected for good, and after teardown.
   */
  readonly reconnecting: Signal<boolean> = this.reconnectingSignal.asReadonly();

  /**
   * Ids present on the relay, as the live session reports them. This peer's own id is in it from
   * the moment the session opens, so no screen shows its own row offline.
   */
  readonly onlineParticipantIds: Signal<ReadonlySet<string>> =
    this.onlineParticipantIdsSignal.asReadonly();

  // Writer seam (#516)

  /**
   * Every act a peer can take on the live session. `UNBOUND_SESSION_COMMANDS` outside a session,
   * so callers need no `hasSession()` branch: each member refuses instead. A getter, not a
   * signal: writers are not reactive state.
   */
  get commands(): SessionCommands {
    return this.live?.commands ?? UNBOUND_SESSION_COMMANDS;
  }

  /**
   * Session ended, host changed, or this peer was removed: each once, with its text written.
   * Delivered a microtask after the change, only while a session is held, with no replay.
   * Listeners outlive sessions. Returns unsubscribe.
   */
  onSessionEvent(listener: (event: SessionEvent) => void): () => void {
    this.sessionEventListeners.add(listener);
    return (): void => {
      this.sessionEventListeners.delete(listener);
    };
  }

  // Lifecycle

  /**
   * Open a session, created or joined, and connect it in one call; any session held is torn down
   * first. The signals report the seeded doc at once; the IndexedDB snapshot then loads into it
   * before the socket opens (ADR-0004). A teardown while it loads opens no socket, and a password
   * set while it loads is the one the socket opens with.
   */
  open(init: OpenSessionInit): void {
    this.teardown();
    this.sessionEpochSignal.update((n) => n + 1);
    this.roomCodeSignal.set(init.room.code);
    this.relayRoomUuidSignal.set(init.room.uuid);

    try {
      this.live = this.openLive(init);
    } catch (err) {
      // Nothing half-open is left to look connected.
      this.teardown();
      throw err;
    }
  }

  /**
   * Its first readings — the projection, this peer online, `connecting` — arrive before it
   * returns, so the connection banner's clock starts with the attempt.
   */
  private openLive(init: OpenSessionInit): LiveSession {
    return openLiveSession({
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
   * Wait, up to `cap` ms, for what this peer wrote last — a leave — to leave the socket before
   * the caller tears the session down. Resolves at once with no session; never rejects.
   */
  async flushUpdates(cap = 500): Promise<void> {
    await this.live?.flushUpdates(cap);
  }

  /**
   * Re-handshake with a new password hash (`null` for an open room) without a teardown
   * (ADR-0017), so this client's reconnects stop carrying the stale hash. If the socket has not
   * opened yet (the snapshot is still loading), it opens with the new hash. A no-op with no session.
   */
  updateCredentials(passwordHash: string | null): void {
    this.live?.updateCredentials(passwordHash);
  }

  /**
   * Tear down the session held — the live session's `teardown`: destroy the doc, stop the drivers,
   * drop the command set, write nothing — and reset every signal. Idempotent. The opposite of
   * `commands.endSession`, which ends the session for everyone.
   */
  teardown(): void {
    // A store that never opened rejects its close too; there is nothing to close.
    this.persistence?.destroy().catch(() => undefined);
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

  // Writes that are not commands (#516)

  /**
   * `PublicSettingsPatch` excludes `hostParticipantId`: host changes go through `handoffHost` or
   * the election, where the rules live (#507). That narrowed type is the gate.
   */
  updateSettings(patch: PublicSettingsPatch): void {
    this.requireLive('updateSettings').updateSettings(patch);
  }

  updateRoundDescriptor(roundId: string, fields: PatchRoundDescriptorInit): void {
    this.requireLive('updateRoundDescriptor').updateRoundDescriptor(roundId, fields);
  }

  /**
   * `commands.endSession()`. The live session notes that this peer's own end applied, so its
   * session event reads "Session ended." rather than naming the host; a refused mis-tap notes
   * nothing.
   */
  endSessionForEveryone(): RosterResult {
    return this.commands.endSession();
  }

  // Internals

  /**
   * The live session's `beforeConnect`: the IndexedDB snapshot into the doc before the socket
   * opens, so the UI fills from cache (ADR-0004). Native has no local persistence yet.
   *
   * A store that cannot be opened (IndexedDB blocked or missing) is no cache, not a reason to
   * stay offline: `whenSynced` never settles then, so the open's own failure ends the wait.
   */
  private async loadLocalSnapshot(roomUuid: string, doc: Y.Doc): Promise<void> {
    if (Capacitor.isNativePlatform()) return;
    const persistence = new IndexeddbPersistence(roomUuid, doc);
    this.persistence = persistence;
    const storeFailed = persistence._db.then(
      () => new Promise<void>(() => {}),
      () => undefined,
    );
    await Promise.race([persistence.whenSynced, storeFailed]);
  }

  private requireLive(op: string): LiveSession {
    if (this.live === null) {
      throw new Error(`DocService.${op}: no active session`);
    }
    return this.live;
  }
}
