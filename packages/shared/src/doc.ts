/**
 * TypeScript mirror of the Yjs doc in `docs/schema.md`, which is authoritative for what each
 * field means: change schema.md first (with an ADR for a shape change), then this file. Times
 * are Unix milliseconds. No runtime Yjs import, so the relay can use these types without Yjs.
 */

/**
 * Inlined into each round at creation, so custom scales need no shared registry and a round's
 * scale is frozen against later edits to `settings.defaultScale`.
 */
export interface Scale {
  /** A builtin id (see `BUILTIN_SCALES`) or `custom-<uuid>`. */
  id: string;
  /** Card faces, in display order. */
  cards: string[];
}

// meta — set once at creation; only `sessionEndedAt` is written later

export interface Meta {
  /** Room codes (ADR-0008) are a relay-side lookup to this UUID. */
  roomUuid: string;
  createdAt: number;
  /** `participantId` of the creator, who is also the initial host (ADR-0010). */
  createdBy: string;
  /** When the host ended the session for everyone; absent while it is active. */
  sessionEndedAt?: number;
}

// settings — host-editable

export interface Settings {
  name?: string;
  /** Snapshotted into each round at creation. */
  defaultScale: Scale;
  /** The current host (ADR-0010). */
  hostParticipantId: string;
}

// participants — cumulative for the session; online status lives in awareness

export interface Participant {
  displayName: string;
  joinedAt: number;
  /** Absent means `'voter'` (ADR-0020). Viewers are left out of auto-reveal (ADR-0018). */
  role?: 'voter' | 'viewer';
  /** Set by a leave or a host kick, never by a disconnect (ADR-0036); absent means active. */
  leftAt?: number;
  /** Who wrote `leftAt` (own id: leave, host's id: kick). Set exactly when `leftAt` is set. */
  removedBy?: string;
  /**
   * An `AccentKey` or `#rrggbb` (ADR-0043). Absent means `deterministicAvatarColor(participantId)`.
   * Read it through `resolveAvatarColor`, which tolerates malformed values from old or future clients.
   */
  avatarColor?: string;
}

/** Sessions from before roles existed carry no `role`; that reads as `'voter'`. */
export function participantRole(p: Pick<Participant, 'role'>): 'voter' | 'viewer' {
  return p.role ?? 'voter';
}

// agenda — pre-session story queue (ADR-0042)

/** An open enum on the wire: callers must tolerate values from future clients. */
export const AGENDA_ITEM_STATES = ['pending', 'consumed', 'skipped', 'cancelled'] as const;

/**
 * `consumed`: a round was created for the item. `skipped`: dropped without a round.
 * `cancelled`: soft-deleted. Treat an unknown value as `pending` or handle it explicitly.
 */
export type AgendaItemState = (typeof AGENDA_ITEM_STATES)[number];

export interface AgendaItem {
  id: string;
  /** At least one of `title` and `ticketId` is set. */
  title?: string;
  description?: string;
  ticketId?: string;
  state: AgendaItemState;
  /** Open enum: `'manual'` today, importers such as `'jira'` later. */
  source: string;
  /** The importer's id for the item, paired with `source`. Nothing writes it yet. */
  externalId?: string;
  /** Base-62 fractional-index key, sorted lexicographically. Frozen once the item leaves `pending`. */
  sortKey: string;
  createdAt: number;
  /** Written together with `consumedByRoundId`. */
  consumedAt?: number;
  consumedByRoundId?: string;
}

/**
 * The one test for "is this participant in the session now?" (ADR-0036). Round history reads
 * the unfiltered `participants` map instead, so departed names still resolve on past rounds.
 */
export function isActiveParticipant(p: Pick<Participant, 'leftAt'>): boolean {
  return p.leftAt === undefined;
}

// rounds — flat list, re-votes linked by `parentRoundId` (ADR-0013)

/**
 * Resolved for the projection, never stored. `pending` is effectively unreachable, since
 * `appendRound` always stamps `timerStartedAt`, but is kept for totality.
 */
export type RoundStatus = 'pending' | 'voting' | 'revealed' | 'skipped' | 'discarded';

export type TerminalRoundStatus = 'revealed' | 'skipped' | 'discarded';

/**
 * A round as written to the doc; internal to the shared writer and projection, readers get
 * `Round`. The writer keeps the three terminal timestamps exclusive, but a concurrent merge
 * can leave several set: `terminalState()` picks the earliest, then reveal → skip → discard.
 */
export interface StoredRound {
  id: string;
  /** `title`, `description` and `ticketId` are inherited from the parent on re-vote. */
  title?: string;
  description?: string;
  ticketId?: string;
  parentRoundId?: string;
  /** Copied from `settings.defaultScale` at creation; independent after that. */
  scale: Scale;
  /** The stopwatch origin for elapsed voting time (ADR-0018). */
  timerStartedAt?: number;
  /** Written by the host, or by any client on unanimous auto-reveal (ADR-0018). */
  revealedAt?: number;
  /** Host skip (ADR-0040). */
  skippedAt?: number;
  /** Host discard (ADR-0046): the agenda item stays `pending` and no history entry is left. */
  discardedAt?: number;
  /** Written with `discardedAt`, for attribution; nothing reads it yet. */
  discardedBy?: string;
  createdBy: string;
  createdAt: number;
  /** Card face keyed by `participantId`; a vote change overwrites the key (ADR-0013). */
  votes: Record<string, string>;
  /** The agenda item the round started from (ADR-0042); a re-vote passes the parent's on. */
  agendaItemId?: string;
}

/**
 * A round as readers see it: the raw terminal timestamps are replaced by `status` and
 * `terminalAt`, so no reader re-derives terminal state.
 */
export interface Round extends Omit<StoredRound, 'revealedAt' | 'skippedAt' | 'discardedAt'> {
  status: RoundStatus;
  /** The winning terminal timestamp; set only when `status` is terminal. */
  terminalAt?: number;
}

// Presence (awareness) is not in the doc: its shape is `live-session`'s.

export const FIBONACCI_SCALE: Scale = {
  id: 'fibonacci',
  cards: ['0', '1', '2', '3', '5', '8', '13', '21'],
};

export const TSHIRT_SCALE: Scale = {
  id: 't-shirt',
  cards: ['XS', 'S', 'M', 'L', 'XL'],
};

export const POWERS_OF_2_SCALE: Scale = {
  id: 'powers-of-2',
  cards: ['1', '2', '4', '8', '16', '32', '64'],
};

export const LINEAR_SCALE: Scale = {
  id: 'linear',
  cards: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
};

export const RISK_SCALE: Scale = {
  id: 'risk',
  cards: ['Low', 'Medium', 'High', 'Critical'],
};

/** Custom scales are not registered here: they live inline on `settings` and each round. */
export const BUILTIN_SCALES: Readonly<Record<string, Scale>> = {
  [FIBONACCI_SCALE.id]: FIBONACCI_SCALE,
  [TSHIRT_SCALE.id]: TSHIRT_SCALE,
  [POWERS_OF_2_SCALE.id]: POWERS_OF_2_SCALE,
  [LINEAR_SCALE.id]: LINEAR_SCALE,
  [RISK_SCALE.id]: RISK_SCALE,
};

export const SCALE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  fibonacci: 'Fibonacci',
  't-shirt': 'T-shirt',
  'powers-of-2': 'Powers of 2',
  linear: 'Linear (1–10)',
  risk: 'Risk',
};

/** What a custom scale is called where its own name is not known. */
const CUSTOM_SCALE_FALLBACK_LABEL = 'Custom scale';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * The builtin name, else the id without its `custom-` prefix, title-cased word by word. A
 * `custom-<uuid>` id reads {@link CUSTOM_SCALE_FALLBACK_LABEL}: the scale's name lives only on
 * the device that made it (ADR-0019), and nobody should see the UUID.
 */
export function formatScaleId(id: string): string {
  if (id in SCALE_DISPLAY_NAMES) return SCALE_DISPLAY_NAMES[id]!;
  if (id.length === 0) return id;
  const stripped = id.startsWith('custom-') ? id.slice('custom-'.length) : id;
  if (stripped !== id && UUID_PATTERN.test(stripped)) return CUSTOM_SCALE_FALLBACK_LABEL;
  return stripped
    .split('-')
    .map((word) => (word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}
