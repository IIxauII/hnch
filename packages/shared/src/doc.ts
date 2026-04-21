/**
 * Yjs doc shape — platform-neutral TypeScript mirror of `schema.md`.
 *
 * This module defines the logical shape of session state (ADR-0003's Yjs
 * doc). It carries no runtime Yjs dependency: the CRDT bindings (Y.Map,
 * Y.Array) live in the client package. Shared stays platform-neutral so
 * the relay can import these types without pulling Angular or Yjs into
 * its dependency graph.
 *
 * The authoritative description is `schema.md`; this file mirrors it
 * one-to-one. Any divergence is a bug in one of the two — fix schema.md
 * first (and write an ADR if it's a shape-level change), then update here.
 */

// ---------------------------------------------------------------------------
// Reveal mode (settings-level per ADR-0015)
// ---------------------------------------------------------------------------

/**
 * How rounds reveal in a session.
 *
 * - `manual` — host taps Reveal Votes.
 * - `timer`  — auto-reveal when `timerDurationMs` elapses from
 *              `round.timerStartedAt` (ADR-0011, ADR-0015).
 *
 * Per ADR-0015, v1 has no `'unanimous'` mode and no per-round override.
 */
export type RevealMode = 'manual' | 'timer'

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

/**
 * A voting scale — the set of card faces available in a round.
 *
 * Scales are inlined into each round at creation time rather than looked
 * up from a shared registry, so custom scales work without coordination
 * between client versions and a round's scale is frozen against later
 * edits to `settings.defaultScale`.
 *
 * `cards` entries are arbitrary strings — numbers, t-shirt sizes, emoji,
 * and sentinels like `"?"` (unsure) and `"☕"` (coffee break) are all
 * just string values.
 */
export interface Scale {
  /** `'fibonacci' | 't-shirt' | `custom-${uuid}`` */
  id: string
  /** Card faces, in display order. */
  cards: string[]
}

// ---------------------------------------------------------------------------
// meta — session header (set once at creation, immutable)
// ---------------------------------------------------------------------------

export interface Meta {
  /** Internal UUID for this session. Room codes (ADR-0008) are a relay-side lookup to this UUID. */
  roomUuid: string
  /** Unix milliseconds when the session was created. */
  createdAt: number
  /** `participantId` of the creator. This is also the initial host (ADR-0010). */
  createdBy: string
}

// ---------------------------------------------------------------------------
// settings — host-editable session config
// ---------------------------------------------------------------------------

export interface Settings {
  /** Human-readable session name, e.g. `"Sprint 42 planning"`. Optional. */
  name?: string
  /** Scale inherited by newly-created rounds. Snapshotted into each round at creation. */
  defaultScale: Scale
  /** How rounds reveal; applies session-wide per ADR-0015. */
  revealMode: RevealMode
  /**
   * Timer duration applied to every round when `revealMode === 'timer'`.
   * Absent or `0` means no timer (and `revealMode` should be `'manual'`).
   * Session-level only; no per-round override (ADR-0015).
   */
  timerDurationMs?: number
  /** The `participantId` currently holding host authority (ADR-0010). */
  hostParticipantId: string
}

// ---------------------------------------------------------------------------
// participants — who's in the session (cumulative; online status via awareness)
// ---------------------------------------------------------------------------

export interface Participant {
  /** The name shown to other participants. User-editable. */
  displayName: string
  /** Unix milliseconds when this participant first joined the session. */
  joinedAt: number
}

// ---------------------------------------------------------------------------
// rounds — flat list with optional parentRoundId for re-vote lineage (ADR-0013)
// ---------------------------------------------------------------------------

export interface Round {
  /** UUID. */
  id: string
  /** E.g. `"Auth migration"`. Optional; inherited from parent on re-vote. */
  title?: string
  /** Longer context; inherited from parent on re-vote. */
  description?: string
  /** Tracker reference like `"PROJ-1234"`; inherited from parent on re-vote. */
  ticketId?: string
  /** If this is a re-vote, the `id` of the previous round in the chain. */
  parentRoundId?: string
  /** Snapshotted at round creation from `settings.defaultScale`; independent after creation. */
  scale: Scale
  /**
   * Unix milliseconds when the timer started. Written by the host at round
   * start (ADR-0011). Absent means voting has not started. Duration is
   * read from `settings.timerDurationMs` (ADR-0015).
   */
  timerStartedAt?: number
  /**
   * Unix milliseconds when the round was revealed. Written by the host, or
   * as a fallback by any client if the timer expires with no host present
   * (ADR-0011). Absent means the round has not been revealed.
   */
  revealedAt?: number
  /** `participantId` of whoever created the round. */
  createdBy: string
  /** Unix milliseconds when the round was created. */
  createdAt: number
  /**
   * Votes keyed by `participantId`. Value is the card face string (e.g.
   * `"5"`, `"?"`, `"☕"`). Vote-change-before-reveal is just overwriting
   * this key — only the final value is retained (ADR-0013).
   *
   * In the Yjs doc this is a `Y.Map<string, string>`; the `Record` shape
   * here is the platform-neutral projection.
   */
  votes: Record<string, string>
}

// ---------------------------------------------------------------------------
// Awareness — ephemeral presence (not persisted in the doc)
// ---------------------------------------------------------------------------

/**
 * The payload each connected client publishes via Yjs awareness. The
 * online set is exactly the set of awareness entries; a participant who
 * appears in `participants` with no awareness entry is offline.
 *
 * Future fields (typing indicators, "currently editing round title",
 * cursor positions) will be added here, not in the doc, to avoid bloating
 * CRDT history.
 */
export interface AwarenessPayload {
  /** Maps an awareness entry back to a `participants` entry. */
  participantId: string
}

// ---------------------------------------------------------------------------
// Builtin scales
// ---------------------------------------------------------------------------

/**
 * Modified-Fibonacci with `?` (unsure) and `☕` (coffee break) sentinels.
 * Same sequence used by most planning-poker tools.
 */
export const FIBONACCI_SCALE: Scale = {
  id: 'fibonacci',
  cards: ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'],
}

/**
 * T-shirt sizes for teams that prefer relative-size estimation over
 * numeric points.
 */
export const TSHIRT_SCALE: Scale = {
  id: 't-shirt',
  cards: ['XS', 'S', 'M', 'L', 'XL', '?', '☕'],
}

/**
 * Convenience lookup for the v1 builtin scales. Custom scales created by
 * users at runtime are not registered here — they live inline in the
 * `Scale` values stored on `settings` and individual rounds.
 */
export const BUILTIN_SCALES: Readonly<Record<string, Scale>> = {
  [FIBONACCI_SCALE.id]: FIBONACCI_SCALE,
  [TSHIRT_SCALE.id]: TSHIRT_SCALE,
}
