import {
  computed,
  Injectable,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core'
import {
  appendRound as appendRoundY,
  castVote as castVoteY,
  clearVote as clearVoteY,
  currentRound as currentRoundFromProjection,
  DOC_META_KEY,
  DOC_PARTICIPANTS_KEY,
  DOC_ROUNDS_KEY,
  DOC_SETTINGS_KEY,
  initDoc,
  patchSettings,
  projectDoc,
  revealRound as revealRoundY,
  upsertParticipant as upsertParticipantY,
  type DocProjection,
  type InitDocInit,
  type Meta,
  type Participant,
  type ParticipantSnapshot,
  type Round,
  type Scale,
  type Settings,
} from '@hnch/shared'
import * as Y from 'yjs'

/**
 * Caller-facing init for {@link DocService.createSession}. Mirrors the
 * fields in {@link InitDocInit} but the service fills in `roomUuid`,
 * `createdAt`, and (if missing) `revealMode`.
 */
export interface CreateSessionInit {
  readonly participantId: string
  readonly displayName: string
  readonly defaultScale: Scale
  readonly revealMode?: Settings['revealMode']
  readonly timerDurationMs?: number
  readonly sessionName?: string
  /**
   * Override the auto-minted room UUID. Tests pass a stable value;
   * production leaves this undefined so each call gets a fresh UUID.
   */
  readonly roomUuid?: string
  /** Clock injection point. Tests freeze this; production omits. */
  readonly now?: () => number
}

/**
 * Shape of `startRound()`'s input. `parentRoundId` is set on re-votes
 * (ADR-0013); everything else is straight from the round-start modal.
 */
export interface StartRoundInit {
  readonly title?: string
  readonly description?: string
  readonly ticketId?: string
  readonly parentRoundId?: string
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
 */
@Injectable({ providedIn: 'root' })
export class DocService {
  // ---------------------------------------------------------------------------
  // Private Yjs state
  // ---------------------------------------------------------------------------

  private doc: Y.Doc | null = null
  private observers: Array<() => void> = []
  private readonly projection: WritableSignal<DocProjection | null> =
    signal<DocProjection | null>(null)

  // ---------------------------------------------------------------------------
  // Public signals
  // ---------------------------------------------------------------------------

  readonly hasSession: Signal<boolean> = computed(
    () => this.projection() !== null,
  )

  readonly meta: Signal<Meta | null> = computed(
    () => this.projection()?.meta ?? null,
  )

  readonly settings: Signal<Settings | null> = computed(
    () => this.projection()?.settings ?? null,
  )

  readonly participants: Signal<readonly ParticipantSnapshot[]> = computed(
    () => this.projection()?.participants ?? [],
  )

  readonly rounds: Signal<readonly Round[]> = computed(
    () => this.projection()?.rounds ?? [],
  )

  readonly currentRound: Signal<Round | null> = computed(() => {
    const snap = this.projection()
    return snap ? currentRoundFromProjection(snap) : null
  })

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
      throw new Error('DocService.createSession: a session is already active')
    }

    const now = init.now ?? (() => Date.now())
    const roomUuid = init.roomUuid ?? crypto.randomUUID()
    const createdAt = now()

    const doc = new Y.Doc()
    const seed: InitDocInit = {
      roomUuid,
      createdAt,
      participantId: init.participantId,
      displayName: init.displayName,
      defaultScale: init.defaultScale,
      revealMode: init.revealMode ?? 'manual',
      ...(init.timerDurationMs !== undefined && {
        timerDurationMs: init.timerDurationMs,
      }),
      ...(init.sessionName !== undefined && { sessionName: init.sessionName }),
    }
    initDoc(doc, seed)

    this.attach(doc)
    return roomUuid
  }

  /**
   * Tear down the active session. Unobserves all observers, destroys
   * the `Y.Doc`, and nulls the projection so `hasSession()` flips back
   * to `false`. Idempotent — safe to call when no session is active.
   */
  endSession(): void {
    this.detach()
    this.doc?.destroy()
    this.doc = null
    this.projection.set(null)
  }

  // ---------------------------------------------------------------------------
  // Mutations (delegate straight to the pure helpers)
  // ---------------------------------------------------------------------------

  updateSettings(patch: Partial<Settings>): void {
    patchSettings(this.requireDoc('updateSettings'), patch)
  }

  upsertParticipant(id: string, value: Participant): void {
    upsertParticipantY(this.requireDoc('upsertParticipant'), id, value)
  }

  /**
   * Append a round to the session. `scale` is inherited from
   * `settings.defaultScale` inside the pure helper; we only need to
   * decide `id`, `createdBy`, `createdAt`. `createdBy` comes from the
   * current `hostParticipantId` — in Phase 2 that's always you, but
   * this keeps the attribution honest once Phase 3 adds joiners.
   */
  startRound(descriptor: StartRoundInit, opts: { now?: () => number } = {}): string {
    const doc = this.requireDoc('startRound')
    const createdBy = this.settings()?.hostParticipantId
    if (!createdBy) {
      throw new Error('DocService.startRound: no hostParticipantId in settings')
    }
    const id = crypto.randomUUID()
    const now = opts.now ?? (() => Date.now())
    appendRoundY(doc, {
      id,
      createdAt: now(),
      createdBy,
      ...(descriptor.title !== undefined && { title: descriptor.title }),
      ...(descriptor.description !== undefined && {
        description: descriptor.description,
      }),
      ...(descriptor.ticketId !== undefined && { ticketId: descriptor.ticketId }),
      ...(descriptor.parentRoundId !== undefined && {
        parentRoundId: descriptor.parentRoundId,
      }),
    })
    return id
  }

  castVote(roundId: string, participantId: string, card: string): void {
    castVoteY(this.requireDoc('castVote'), roundId, participantId, card)
  }

  clearVote(roundId: string, participantId: string): void {
    clearVoteY(this.requireDoc('clearVote'), roundId, participantId)
  }

  revealRound(roundId: string, opts: { now?: () => number } = {}): void {
    const now = opts.now ?? (() => Date.now())
    revealRoundY(this.requireDoc('revealRound'), roundId, now())
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
    this.doc = doc
    this.rebuildProjection()

    const rebuild = (): void => this.rebuildProjection()
    const meta = doc.getMap(DOC_META_KEY)
    const settings = doc.getMap(DOC_SETTINGS_KEY)
    const participants = doc.getMap(DOC_PARTICIPANTS_KEY)
    const rounds = doc.getArray(DOC_ROUNDS_KEY)

    meta.observeDeep(rebuild)
    settings.observeDeep(rebuild)
    participants.observeDeep(rebuild)
    rounds.observeDeep(rebuild)

    this.observers = [
      () => meta.unobserveDeep(rebuild),
      () => settings.unobserveDeep(rebuild),
      () => participants.unobserveDeep(rebuild),
      () => rounds.unobserveDeep(rebuild),
    ]
  }

  private detach(): void {
    for (const off of this.observers) off()
    this.observers = []
  }

  private rebuildProjection(): void {
    if (!this.doc) return
    this.projection.set(projectDoc(this.doc))
  }

  private requireDoc(op: string): Y.Doc {
    if (!this.doc) {
      throw new Error(`DocService.${op}: no active session`)
    }
    return this.doc
  }
}
