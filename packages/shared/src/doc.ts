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
 * `cards` entries are arbitrary strings — numbers, t-shirt sizes, risk
 * labels, or any other values a custom scale defines.
 */
export interface Scale {
  /** Builtin IDs: `'fibonacci'`, `'t-shirt'`, `'powers-of-2'`, `'linear'`, `'risk'`. Custom scales use a `custom-` prefix. */
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
  /** Unix milliseconds when the host ended the session for everyone. Optional. Absent means session is still active. */
  sessionEndedAt?: number
}

// ---------------------------------------------------------------------------
// settings — host-editable session config
// ---------------------------------------------------------------------------

export interface Settings {
  /** Human-readable session name, e.g. `"Sprint 42 planning"`. Optional. */
  name?: string
  /** Scale inherited by newly-created rounds. Snapshotted into each round at creation. */
  defaultScale: Scale
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
  /**
   * Participant role in the session (ADR-0020). Absent means `'voter'`.
   * Voters cast estimates; viewers observe without voting and are excluded
   * from unanimous auto-reveal (ADR-0018).
   */
  role?: 'voter' | 'viewer'
}

/**
 * Returns the effective role for a participant. Absent field → `'voter'`
 * (backward-compatible default — existing sessions have no role field).
 */
export function participantRole(p: Pick<Participant, 'role'>): 'voter' | 'viewer' {
  return p.role ?? 'voter'
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
   * Unix milliseconds when voting started (written at round creation).
   * Used as a stopwatch origin to show elapsed voting time (ADR-0018).
   */
  timerStartedAt?: number
  /**
   * Unix milliseconds when the round was revealed. Written by the host
   * (manual reveal) or by any client when all online participants have
   * voted (unanimous auto-reveal, ADR-0018). Absent means not yet revealed.
   */
  revealedAt?: number
  /** `participantId` of whoever created the round. */
  createdBy: string
  /** Unix milliseconds when the round was created. */
  createdAt: number
  /**
   * Votes keyed by `participantId`. Value is the card face string (e.g.
   * `"5"`, `"M"`, `"High"`). Vote-change-before-reveal is just overwriting
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
 * Modified-Fibonacci sequence. Same sequence used by most planning-poker tools.
 */
export const FIBONACCI_SCALE: Scale = {
  id: 'fibonacci',
  cards: ['0', '1', '2', '3', '5', '8', '13', '21'],
}

/**
 * T-shirt sizes for teams that prefer relative-size estimation over
 * numeric points.
 */
export const TSHIRT_SCALE: Scale = {
  id: 't-shirt',
  cards: ['XS', 'S', 'M', 'L', 'XL'],
}

/**
 * Powers-of-two sequence. Common in engineering sub-teams that think in
 * binary multiples.
 */
export const POWERS_OF_2_SCALE: Scale = {
  id: 'powers-of-2',
  cards: ['1', '2', '4', '8', '16', '32', '64'],
}

/**
 * Simple linear 1–10 scale for teams unfamiliar with Fibonacci.
 */
export const LINEAR_SCALE: Scale = {
  id: 'linear',
  cards: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
}

/**
 * Risk assessment scale for risk-estimation ceremonies.
 */
export const RISK_SCALE: Scale = {
  id: 'risk',
  cards: ['Low', 'Medium', 'High', 'Critical'],
}

/**
 * Convenience lookup for the builtin scales. Custom scales created by
 * users at runtime are not registered here — they live inline in the
 * `Scale` values stored on `settings` and individual rounds.
 */
export const BUILTIN_SCALES: Readonly<Record<string, Scale>> = {
  [FIBONACCI_SCALE.id]: FIBONACCI_SCALE,
  [TSHIRT_SCALE.id]: TSHIRT_SCALE,
  [POWERS_OF_2_SCALE.id]: POWERS_OF_2_SCALE,
  [LINEAR_SCALE.id]: LINEAR_SCALE,
  [RISK_SCALE.id]: RISK_SCALE,
}

/**
 * Human-readable display names for the builtin scale IDs.
 */
export const SCALE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  fibonacci: 'Fibonacci',
  't-shirt': 'T-shirt',
  'powers-of-2': 'Powers of 2',
  linear: 'Linear (1–10)',
  risk: 'Risk',
}

/**
 * Returns a human-readable label for a scale ID. For builtin scales this is
 * the value from SCALE_DISPLAY_NAMES. For custom IDs (prefixed `custom-`) the
 * prefix is stripped and each hyphen-separated word is title-cased. Any other
 * unknown ID is title-cased word-by-word as a best-effort fallback.
 */
export function formatScaleId(id: string): string {
  if (id in SCALE_DISPLAY_NAMES) return SCALE_DISPLAY_NAMES[id]!
  if (id.length === 0) return id
  const stripped = id.startsWith('custom-') ? id.slice('custom-'.length) : id
  return stripped
    .split('-')
    .map((word) => (word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}
