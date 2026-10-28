/**
 * Pure Yjs ↔ plain-JS projection + mutation helpers.
 *
 * These functions are the single place where the Yjs runtime types
 * (`Y.Doc`, `Y.Map`, `Y.Array`) are read from or written to. They're
 * deliberately framework-free — no Angular, no RxJS — so the client's
 * `DocService` can wrap them with signals while keeping every line
 * of CRDT-shape logic unit-testable against a headless `Y.Doc`.
 *
 * Design contract:
 *  - `projectDoc(doc)` returns an immutable plain-JS snapshot of the
 *    entire session state. Callers compare snapshots by identity; any
 *    mutation through the helpers below produces a new snapshot value.
 *  - `initDoc(doc, init)` seeds a fresh session.
 *  - Every mutation runs inside a `Y.transact` so observers fire once
 *    per logical change, matching the Phase 2 plan's stated doc-service
 *    rebuild-on-event approach.
 *
 * When `schema.md` evolves, update the types in `doc.ts` AND this
 * file in the same commit — the pairing is load-bearing for the
 * round-trip property tests below.
 */

import * as Y from 'yjs';

import type {
  AgendaItem,
  AgendaItemState,
  Meta,
  Participant,
  Round,
  RoundStatus,
  Scale,
  Settings,
  StoredRound,
  TerminalRoundStatus,
} from './doc.js';
import { keyBetween } from './fractional-index.js';
import { terminalState } from './round-status.js';
import { canEnterTerminal } from './round-transitions.js';

// ---------------------------------------------------------------------------
// Snapshot shape
// ---------------------------------------------------------------------------

/**
 * A participant projection. Keyed by `participantId` (the `Y.Map`
 * key, which is not itself a field of `Participant`).
 */
export interface ParticipantSnapshot extends Participant {
  readonly id: string;
}

/**
 * Immutable plain-JS snapshot of the Yjs doc. The shape is stable
 * across the wire (Phase 3+) and across client versions — treat
 * changes to this shape as you would a schema change.
 */
export interface DocProjection {
  readonly meta: Meta;
  readonly settings: Settings;
  readonly participants: readonly ParticipantSnapshot[];
  readonly rounds: readonly Round[];
  /**
   * Pre-session agenda items, sorted by `sortKey` (ascending lex order).
   * All states included — callers filter by state as needed.
   * See ADR-0042.
   */
  readonly agenda: readonly AgendaItem[];
}

// ---------------------------------------------------------------------------
// Top-level container keys
// ---------------------------------------------------------------------------
//
// Centralized so the projection + mutation paths, and (in Phase 3) the
// relay's snapshot diffing, all reach for the same string.
//

export const DOC_META_KEY = 'meta';
export const DOC_SETTINGS_KEY = 'settings';
export const DOC_PARTICIPANTS_KEY = 'participants';
export const DOC_ROUNDS_KEY = 'rounds';
export const DOC_AGENDA_KEY = 'agenda';

const META_FIELDS = ['roomUuid', 'createdAt', 'createdBy', 'sessionEndedAt'] as const;
const SETTINGS_FIELDS = ['name', 'defaultScale', 'hostParticipantId'] as const;
const PARTICIPANT_FIELDS = [
  'displayName',
  'joinedAt',
  'role',
  'leftAt',
  'removedBy',
  'avatarColor',
] as const;
const AGENDA_ITEM_FIELDS = [
  'id',
  'title',
  'description',
  'ticketId',
  'state',
  'source',
  'externalId',
  'sortKey',
  'createdAt',
  'consumedAt',
  'consumedByRoundId',
] as const;

const ROUND_FIELDS = [
  'id',
  'title',
  'description',
  'ticketId',
  'parentRoundId',
  'scale',
  'timerStartedAt',
  'revealedAt',
  'skippedAt',
  'discardedAt',
  'discardedBy',
  'createdBy',
  'createdAt',
  'agendaItemId',
] as const;

// ---------------------------------------------------------------------------
// Typed accessors for the top-level containers
// ---------------------------------------------------------------------------
//
// Using `getMap` / `getArray` with consistent key names and casting to
// `Y.Map<unknown>` / `Y.Array<Y.Map<unknown>>` keeps the Yjs generic
// noise out of every call site below.
//

type UnknownMap = Y.Map<unknown>;
type RoundsArray = Y.Array<UnknownMap>;

function metaMap(doc: Y.Doc): UnknownMap {
  return doc.getMap(DOC_META_KEY);
}

function settingsMap(doc: Y.Doc): UnknownMap {
  return doc.getMap(DOC_SETTINGS_KEY);
}

function participantsMap(doc: Y.Doc): Y.Map<UnknownMap> {
  return doc.getMap(DOC_PARTICIPANTS_KEY) as Y.Map<UnknownMap>;
}

function roundsArray(doc: Y.Doc): RoundsArray {
  return doc.getArray(DOC_ROUNDS_KEY) as RoundsArray;
}

export function agendaArray(doc: Y.Doc): RoundsArray {
  return doc.getArray(DOC_AGENDA_KEY) as RoundsArray;
}

// ---------------------------------------------------------------------------
// Projection (Y -> plain JS)
// ---------------------------------------------------------------------------

function projectFields<T>(map: UnknownMap, fields: readonly (keyof T & string)[]): T {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = map.get(f);
    if (v !== undefined) {
      out[f] = v;
    }
  }
  return out as T;
}

function projectMeta(doc: Y.Doc): Meta {
  return projectFields<Meta>(metaMap(doc), META_FIELDS);
}

function projectSettings(doc: Y.Doc): Settings {
  return projectFields<Settings>(settingsMap(doc), SETTINGS_FIELDS);
}

function projectParticipants(doc: Y.Doc): readonly ParticipantSnapshot[] {
  const map = participantsMap(doc);
  const out: ParticipantSnapshot[] = [];
  map.forEach((pMap, id) => {
    const base = projectFields<Participant>(pMap, PARTICIPANT_FIELDS);
    out.push({ id, ...base });
  });
  // Stable order by joinedAt then id — matches the "cumulative list" reading
  // of participants in schema.md and makes snapshot equality predictable.
  out.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  return out;
}

function projectVotes(votesMap: Y.Map<string>): Record<string, string> {
  const out: Record<string, string> = {};
  votesMap.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function projectRound(roundMap: UnknownMap): Round {
  const raw = projectFields<Omit<StoredRound, 'votes'>>(roundMap, ROUND_FIELDS);
  const votesY = roundMap.get('votes') as Y.Map<string> | undefined;
  const votes = votesY ? projectVotes(votesY) : {};

  // Resolve the raw terminal timestamps into a single status + winning
  // timestamp here, once — readers branch on `status` / `terminalAt` and the
  // raw fields never reach the projection `Round` (see ADR-0040 tie-break).
  const terminal = terminalState(raw);
  const { revealedAt, skippedAt, discardedAt, ...rest } = raw;
  const status: RoundStatus = terminal ?? (raw.timerStartedAt !== undefined ? 'voting' : 'pending');
  const terminalAt =
    terminal === 'revealed'
      ? revealedAt
      : terminal === 'skipped'
        ? skippedAt
        : terminal === 'discarded'
          ? discardedAt
          : undefined;

  return terminalAt === undefined
    ? { ...rest, votes, status }
    : { ...rest, votes, status, terminalAt };
}

function projectRounds(doc: Y.Doc): readonly Round[] {
  const arr = roundsArray(doc);
  const out: Round[] = [];
  arr.forEach((roundMap) => {
    out.push(projectRound(roundMap));
  });
  return out;
}

function projectAgendaItem(itemMap: UnknownMap): AgendaItem {
  return projectFields<AgendaItem>(itemMap, AGENDA_ITEM_FIELDS);
}

function projectAgenda(doc: Y.Doc): readonly AgendaItem[] {
  const arr = agendaArray(doc);
  const out: AgendaItem[] = [];
  arr.forEach((itemMap) => {
    out.push(projectAgendaItem(itemMap));
  });
  // Sort by sortKey ascending (lex order).
  out.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return out;
}

/**
 * Build a plain-JS immutable snapshot of the doc. Cheap enough to call
 * on every Yjs event at Phase 2 scale (<10 participants, <50 rounds);
 * fine-grained projections are a noted risk in the Phase 2 plan.
 */
export function projectDoc(doc: Y.Doc): DocProjection {
  return {
    meta: projectMeta(doc),
    settings: projectSettings(doc),
    participants: projectParticipants(doc),
    rounds: projectRounds(doc),
    agenda: projectAgenda(doc),
  };
}

// ---------------------------------------------------------------------------
// Initial seeding (Create Room)
// ---------------------------------------------------------------------------

/**
 * Arguments required to seed a fresh session into an empty `Y.Doc`.
 * `displayName` is this client's name for the seeded participant
 * record; `participantId` doubles as the initial `hostParticipantId`
 * and the key in `participants` (ADR-0005, ADR-0010).
 */
export interface InitDocInit {
  readonly roomUuid: string;
  readonly createdAt: number;
  readonly participantId: string;
  readonly displayName: string;
  readonly defaultScale: Scale;
  readonly sessionName?: string;
  /**
   * Optional avatar color wire value (ADR-0043). Pre-validated by the
   * caller via `parseAvatarColor`; written verbatim to the seeded
   * participant record so the room creator's color is visible from
   * the first relay snapshot onward.
   */
  readonly avatarColor?: string;
}

/**
 * Seed `meta`, `settings`, and a single-entry `participants` map on
 * an empty `Y.Doc`. Throws if the doc already has a seeded `meta`
 * (idempotency is not part of this helper's contract — the live session
 * seeds a fresh doc of its own for every session it opens).
 */
export function initDoc(doc: Y.Doc, init: InitDocInit): void {
  if (metaMap(doc).has('roomUuid')) {
    throw new Error('initDoc: doc already seeded');
  }

  doc.transact(() => {
    const meta = metaMap(doc);
    meta.set('roomUuid', init.roomUuid);
    meta.set('createdAt', init.createdAt);
    meta.set('createdBy', init.participantId);

    const settings = settingsMap(doc);
    if (init.sessionName !== undefined) {
      settings.set('name', init.sessionName);
    }
    settings.set('defaultScale', init.defaultScale);
    settings.set('hostParticipantId', init.participantId);

    const pMap = new Y.Map<unknown>();
    pMap.set('displayName', init.displayName);
    pMap.set('joinedAt', init.createdAt);
    if (init.avatarColor !== undefined) {
      pMap.set('avatarColor', init.avatarColor);
    }
    participantsMap(doc).set(init.participantId, pMap);
  });
}

/**
 * Arguments for joining an existing session — only the participant's
 * own entry is written. Settings, meta, and `hostParticipantId` are
 * received from the relay via Yjs sync rather than locally seeded,
 * avoiding CRDT-merge conflicts with the creator's initial writes.
 */
export interface JoinDocInit {
  readonly participantId: string;
  readonly displayName: string;
  /**
   * Unix milliseconds stamped as `joinedAt` when the participant record is
   * created. Required: no writer in this package reaches for the ambient
   * clock, so every timestamp in the doc is traceable to a caller (#507).
   * Ignored on re-join — an existing record keeps its original `joinedAt`.
   */
  readonly joinedAt: number;
  /**
   * Optional avatar color wire value (ADR-0043). When provided, written
   * on join so peers see this user's color immediately. Pre-validated
   * by the caller via `parseAvatarColor`.
   */
  readonly avatarColor?: string;
}

/**
 * Add this client's participant entry to the doc without touching
 * `meta` or `settings`. Used when joining an existing room — the
 * authoritative state arrives via the relay's Yjs snapshot.
 *
 * When the participant record already exists (re-join after leave or kick),
 * the existing record is reused and `leftAt` / `removedBy` are cleared so
 * the participant re-enters the active roster (ADR-0036). `joinedAt` is
 * preserved on re-join.
 */
export function joinDoc(doc: Y.Doc, init: JoinDocInit): void {
  doc.transact(() => {
    const pMap = participantsMap(doc);
    const existing = pMap.get(init.participantId);
    const target = existing ?? new Y.Map<unknown>();
    target.set('displayName', init.displayName);
    if (existing === undefined) {
      target.set('joinedAt', init.joinedAt);
    }
    if (init.avatarColor !== undefined) {
      target.set('avatarColor', init.avatarColor);
    }
    // Clear removal state so a re-joining participant becomes active again.
    target.delete('leftAt');
    target.delete('removedBy');
    if (existing === undefined) {
      pMap.set(init.participantId, target);
    }
  });
}

// ---------------------------------------------------------------------------
// Mutations (plain JS -> Y)
// ---------------------------------------------------------------------------

/**
 * The settings a caller outside this package may patch. Excludes
 * `hostParticipantId`: host changes are a *roster* act with rules attached
 * (handoff needs authority + an online target; election needs neither), so
 * they can only be expressed through `roster-commands` (#507). Narrowing the
 * public parameter type turns that routing from a convention into a
 * guarantee — a stray `patchSettings(doc, { hostParticipantId })` no longer
 * typechecks.
 */
export type PublicSettingsPatch = Partial<Omit<Settings, 'hostParticipantId'>>;

/**
 * Shallow-merge patch into `settings`. `undefined` values explicitly
 * delete the key.
 *
 * Full-width (host field included) and therefore **package-internal** — the
 * roster commands are its only privileged caller. Everyone else goes through
 * `patchSettings`.
 */
export function patchSettingsInternal(doc: Y.Doc, patch: Partial<Settings>): void {
  doc.transact(() => {
    const s = settingsMap(doc);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) {
        s.delete(k);
      } else {
        s.set(k, v);
      }
    }
  });
}

/**
 * Public settings writer. Shallow-merges `patch` into `settings`;
 * `undefined` values explicitly delete the key. Cannot express a host
 * change — see `PublicSettingsPatch`.
 */
export function patchSettings(doc: Y.Doc, patch: PublicSettingsPatch): void {
  patchSettingsInternal(doc, patch);
}

/**
 * Upsert a participant record by id.
 */
export function upsertParticipant(doc: Y.Doc, id: string, value: Participant): void {
  doc.transact(() => {
    const map = participantsMap(doc);
    const existing = map.get(id);
    const target = existing ?? new Y.Map<unknown>();
    target.set('displayName', value.displayName);
    target.set('joinedAt', value.joinedAt);
    // role is a partial-update field: omitting it (undefined) preserves the
    // existing value. Callers that update displayName without touching role
    // must not silently revert a viewer back to voter.
    if (value.role !== undefined) {
      target.set('role', value.role);
    }
    // avatarColor is a partial-update field (same semantics as role):
    // omitting it preserves the existing value so callers that only
    // update displayName / role don't silently wipe color.
    if (value.avatarColor !== undefined) {
      target.set('avatarColor', value.avatarColor);
    }
    if (existing === undefined) {
      map.set(id, target);
    }
  });
}

/**
 * Set the caller's `avatarColor` on their participant record (ADR-0043).
 * Writes the validated wire value (`AccentKey` or `#rrggbb`) directly;
 * caller is responsible for sanitization via `parseAvatarColor` first.
 *
 * Idempotent: writing the same value is a no-op for observers
 * (Yjs only fires when the underlying value changes).
 */
export function setAvatarColor(doc: Y.Doc, participantId: string, color: string): void {
  doc.transact(() => {
    const map = participantsMap(doc);
    const record = map.get(participantId);
    if (!record) return;
    record.set('avatarColor', color);
  });
}

/**
 * Append a new round to `rounds`. Returns the round id. `scale` is
 * inherited from `settings.defaultScale` at call time and snapshotted
 * into the round per schema.md / ADR-0013.
 */
export interface AppendRoundInit {
  readonly id: string;
  readonly createdAt: number;
  readonly createdBy: string;
  readonly title?: string;
  readonly description?: string;
  readonly ticketId?: string;
  readonly parentRoundId?: string;
  /** Override the inherited scale. Rare; usually omitted. */
  readonly scale?: Scale;
  /**
   * ID of the agenda item this round was started from (ADR-0042).
   * On re-vote, callers pass the parent round's `agendaItemId` unchanged.
   */
  readonly agendaItemId?: string;
}

export function appendRound(doc: Y.Doc, init: AppendRoundInit): string {
  const scale = init.scale ?? (settingsMap(doc).get('defaultScale') as Scale);
  if (!scale) {
    throw new Error('appendRound: no scale (settings.defaultScale missing)');
  }

  // Re-vote guard: parent round must not be discarded. Discarded rounds are
  // tombstones and may not anchor lineage chains.
  if (init.parentRoundId !== undefined) {
    const parent = findRoundMap(doc, init.parentRoundId);
    if (parent !== undefined && parent.get('discardedAt') !== undefined) {
      throw new Error(
        `appendRound: parentRoundId ${init.parentRoundId} points at a discarded round`,
      );
    }
  }

  doc.transact(() => {
    const round = new Y.Map<unknown>();
    round.set('id', init.id);
    round.set('createdAt', init.createdAt);
    round.set('createdBy', init.createdBy);
    round.set('scale', scale);
    if (init.title !== undefined) round.set('title', init.title);
    if (init.description !== undefined) round.set('description', init.description);
    if (init.ticketId !== undefined) round.set('ticketId', init.ticketId);
    if (init.parentRoundId !== undefined) {
      round.set('parentRoundId', init.parentRoundId);
    }
    if (init.agendaItemId !== undefined) {
      round.set('agendaItemId', init.agendaItemId);
    }
    round.set('timerStartedAt', init.createdAt);
    round.set('votes', new Y.Map<string>());
    roundsArray(doc).push([round]);
  });

  return init.id;
}

/**
 * Partially update `title` and/or `description` on an existing round.
 * Allowed pre- and post-reveal — editorial corrections are not phase-gated
 * (the UI separately decides when to expose the affordance).
 */
export interface PatchRoundDescriptorInit {
  readonly title?: string;
  readonly description?: string;
}

export function patchRoundDescriptor(
  doc: Y.Doc,
  roundId: string,
  init: PatchRoundDescriptorInit,
): void {
  const round = findRoundMap(doc, roundId);
  if (!round) throw new Error(`patchRoundDescriptor: round ${roundId} not found`);
  doc.transact(() => {
    if (init.title !== undefined) round.set('title', init.title);
    if (init.description !== undefined) round.set('description', init.description);
  });
}

function findRoundMap(doc: Y.Doc, roundId: string): UnknownMap | undefined {
  const arr = roundsArray(doc);
  for (let i = 0; i < arr.length; i += 1) {
    const r = arr.get(i);
    if (r.get('id') === roundId) return r;
  }
  return undefined;
}

/**
 * Writer-side terminal-mutex check: resolves a round map's three raw terminal
 * timestamps through the same `terminalState()` choke point readers use, so
 * reveal / skip / discard share one uniform guard. Returns the winning
 * terminal state, or `null` when the round is still active.
 */
function roundTerminalState(round: UnknownMap): TerminalRoundStatus | null {
  return terminalState({
    revealedAt: round.get('revealedAt') as number | undefined,
    skippedAt: round.get('skippedAt') as number | undefined,
    discardedAt: round.get('discardedAt') as number | undefined,
  });
}

/**
 * Set or change a vote for a participant in a round. Overwriting a
 * prior value is the supported vote-change path (ADR-0013).
 * No-ops if the round is already revealed — reveals are immutable.
 */
export function castVote(doc: Y.Doc, roundId: string, participantId: string, card: string): void {
  const round = findRoundMap(doc, roundId);
  if (!round) throw new Error(`castVote: round ${roundId} not found`);
  if (round.get('revealedAt') !== undefined) return;
  doc.transact(() => {
    const votes = round.get('votes') as Y.Map<string>;
    votes.set(participantId, card);
  });
}

/**
 * Clear a participant's vote in a round. Used when the user taps
 * their already-selected card to unvote (ADR-0013).
 */
export function clearVote(doc: Y.Doc, roundId: string, participantId: string): void {
  const round = findRoundMap(doc, roundId);
  if (!round) throw new Error(`clearVote: round ${roundId} not found`);
  if (round.get('revealedAt') !== undefined) return;
  doc.transact(() => {
    const votes = round.get('votes') as Y.Map<string>;
    votes.delete(participantId);
  });
}

/**
 * Internal: if the round has a linked agenda item that is currently in the
 * `pending` state, transition it to `consumed` inside the same transaction.
 * Idempotent no-op when there is no linked item or the item is already in a
 * terminal state — supports re-vote reveals where the parent round already
 * consumed the item.
 *
 * Must be called from inside a `doc.transact()`.
 */
function maybeConsumeLinkedAgendaItem(
  doc: Y.Doc,
  round: UnknownMap,
  roundId: string,
  timestamp: number,
): void {
  const agendaItemId = round.get('agendaItemId') as string | undefined;
  if (agendaItemId === undefined) return;
  const item = findAgendaItemMap(doc, agendaItemId);
  if (item === undefined) return;
  if (item.get('state') !== 'pending') return;
  item.set('state', 'consumed');
  item.set('consumedAt', timestamp);
  item.set('consumedByRoundId', roundId);
}

/**
 * Mark a round as revealed at the given timestamp.
 *
 * Atomically consumes the linked agenda item (if any, and if currently
 * `pending`) inside the same transaction — single chokepoint for the
 * consume-at-terminal lifecycle so CLI and client share identical behavior.
 *
 * Throws if the round is already terminal on the local read (reveal / skip /
 * discard) — the uniform terminal mutex shared by all three writers, so a
 * re-reveal is rejected rather than silently overwriting. Concurrent reveals
 * from multiple clients (unanimous auto-reveal) each pass their own local
 * guard and merge harmlessly; CRDT merges can still produce multiple terminal
 * fields, so readers funnel through `terminalState()` to pick a winner.
 */
export function revealRound(doc: Y.Doc, roundId: string, revealedAt: number): void {
  const round = findRoundMap(doc, roundId);
  if (!round) throw new Error(`revealRound: round ${roundId} not found`);
  const terminal = roundTerminalState(round);
  if (terminal !== null) {
    throw new Error(`revealRound: round ${roundId} already terminal (${terminal})`);
  }
  doc.transact(() => {
    round.set('revealedAt', revealedAt);
    maybeConsumeLinkedAgendaItem(doc, round, roundId, revealedAt);
  });
}

/**
 * Mark a round as skipped at the given timestamp (ADR-0040). Throws if the
 * round is missing, already revealed, already skipped, or already discarded.
 *
 * Atomically consumes the linked agenda item (if any, and if currently
 * `pending`) inside the same transaction. Skip is still a terminal outcome
 * for the agenda item; only discard leaves it `pending`.
 *
 * Concurrent merges can produce multiple terminal fields on the same round;
 * readers must funnel through `terminalState()` to render deterministically.
 */
export function skipRound(doc: Y.Doc, roundId: string, skippedAt: number): void {
  const round = findRoundMap(doc, roundId);
  if (!round) throw new Error(`skipRound: round ${roundId} not found`);
  const terminal = roundTerminalState(round);
  if (terminal !== null) {
    throw new Error(`skipRound: round ${roundId} already terminal (${terminal})`);
  }
  doc.transact(() => {
    round.set('skippedAt', skippedAt);
    maybeConsumeLinkedAgendaItem(doc, round, roundId, skippedAt);
  });
}

/**
 * Mark a round as discarded at the given timestamp. Distinct from skip:
 * the linked agenda item (if any) stays `pending` and the round is excluded
 * from `currentRound()` and history projections. Audit fields `discardedAt`
 * and `discardedBy` are written together; readers must funnel through
 * `terminalState()` to resolve CRDT-merged multi-terminal rounds.
 *
 * Throws on missing round or when any terminal field is already set on the
 * local read. Late CRDT-merged terminal writes from peers are tolerated as
 * no-ops at the projection layer (`terminalState()` picks a winner).
 */
export function discardRound(
  doc: Y.Doc,
  roundId: string,
  discardedAt: number,
  discardedBy: string,
): void {
  const round = findRoundMap(doc, roundId);
  if (!round) throw new Error(`discardRound: round ${roundId} not found`);
  const terminal = roundTerminalState(round);
  if (terminal !== null) {
    throw new Error(`discardRound: round ${roundId} already terminal (${terminal})`);
  }
  doc.transact(() => {
    round.set('discardedAt', discardedAt);
    round.set('discardedBy', discardedBy);
  });
}

/**
 * Mark the session as ended by writing `sessionEndedAt` to meta. Idempotent —
 * concurrent writes merge harmlessly (last-write-wins on a Y.Map key is fine
 * for a monotonic timestamp).
 *
 * Ungated: the host rule lives in `roster-commands`' `endSession`, which is
 * this writer's only caller.
 */
export function endSessionForEveryone(doc: Y.Doc, endedAt: number): void {
  doc.transact(() => {
    metaMap(doc).set('sessionEndedAt', endedAt);
  });
}

/**
 * Mark the caller as having voluntarily left the session. Sets `leftAt` and
 * `removedBy` (equal to `selfId`) on the participant's record (ADR-0036).
 * No-op if the participant record is missing — defensive, but expected to
 * always exist.
 *
 * Tab-close / network drop do NOT call this — they are handled by Yjs
 * awareness. Only intentional "Leave Session" actions route here.
 */
export function leaveSession(doc: Y.Doc, selfId: string, leftAt: number): void {
  const pMap = participantsMap(doc);
  const record = pMap.get(selfId);
  if (!record) return;
  doc.transact(() => {
    record.set('leftAt', leftAt);
    record.set('removedBy', selfId);
  });
}

/**
 * Clear `leftAt` and `removedBy` on the caller's own record — the inverse of
 * {@link leaveSession} (ADR-0036 §6). No-op if the record is missing or the
 * participant is already active.
 *
 * Deleting rather than overwriting is deliberate: absence is what the
 * projection reads as "active", and a delete applied *after* the relay
 * snapshot carries a higher Lamport clock than the snapshot's
 * `set('leftAt', …)`, so it wins the LWW merge. Both surfaces call this from
 * their first-sync hook, which is the only moment that ordering is
 * guaranteed.
 */
export function clearLeftStatus(doc: Y.Doc, selfId: string): void {
  const pMap = participantsMap(doc);
  const record = pMap.get(selfId);
  if (!record || !record.has('leftAt')) return;
  doc.transact(() => {
    record.delete('leftAt');
    record.delete('removedBy');
  });
}

/**
 * Remove a participant by host action (kick). Sets `leftAt` and `removedBy`
 * (equal to `hostId`) on the target's record (ADR-0036).
 *
 * No-op when `targetId === hostId` — the host kicking themselves must route
 * through `leaveSession` instead. No-op if the target record is missing.
 *
 * No host-validity check is performed here: the authority gate lives in
 * `roster-commands`' `kick`, which is this writer's only caller, and which
 * turns both no-ops above into typed refusals.
 */
export function removeParticipant(
  doc: Y.Doc,
  hostId: string,
  targetId: string,
  leftAt: number,
): void {
  if (targetId === hostId) return;
  const pMap = participantsMap(doc);
  const record = pMap.get(targetId);
  if (!record) return;
  doc.transact(() => {
    record.set('leftAt', leftAt);
    record.set('removedBy', hostId);
  });
}

// ---------------------------------------------------------------------------
// Derived state helpers
// ---------------------------------------------------------------------------

/**
 * Current round = last round whose `status` is non-terminal (`'pending'` or
 * `'voting'`); if all are terminal, the last NON-DISCARDED round overall —
 * discarded rounds are tombstones and never surface as the active or last
 * anchor. Returns `null` when no such round exists (empty array, or every
 * round is discarded).
 */
export function currentRound(projection: DocProjection): Round | null {
  const { rounds } = projection;
  if (rounds.length === 0) return null;
  for (let i = rounds.length - 1; i >= 0; i -= 1) {
    const r = rounds[i]!;
    if (r.status === 'pending' || r.status === 'voting') return r;
  }
  for (let i = rounds.length - 1; i >= 0; i -= 1) {
    const r = rounds[i]!;
    if (r.status !== 'discarded') return r;
  }
  return null;
}

/**
 * Active round = last round whose resolved `status` is non-terminal
 * (`'pending'` or `'voting'`). Unlike `currentRound()`, there is **no anchor
 * fallback**: once every round is terminal this returns `null`, full stop.
 * `currentRound()` answers "what should the Lobby results view show";
 * `activeRound()` answers "is there a round open to vote on right now" —
 * effectively `currentRound()`'s first loop without its fallback loop.
 */
export function activeRound(projection: DocProjection): Round | null {
  const { rounds } = projection;
  for (let i = rounds.length - 1; i >= 0; i -= 1) {
    const r = rounds[i]!;
    if (canEnterTerminal(r.status)) return r;
  }
  return null;
}

/**
 * Check if all votes in a round are identical. Returns `false` if fewer
 * than 2 votes exist (consensus requires agreement; single or zero votes
 * is not consensus).
 */
export function isConsensus(round: Round): boolean {
  const values = Object.values(round.votes);
  if (values.length < 2) return false;
  return values.every((v) => v === values[0]);
}

// ---------------------------------------------------------------------------
// Agenda mutations (ADR-0042)
// ---------------------------------------------------------------------------

/**
 * Find an agenda item's Y.Map by id. Returns undefined when not found.
 */
function findAgendaItemMap(doc: Y.Doc, id: string): UnknownMap | undefined {
  const arr = agendaArray(doc);
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i);
    if (m.get('id') === id) return m;
  }
  return undefined;
}

/**
 * Init options for a new agenda item.
 */
export interface AppendAgendaItemInit {
  /** Story title. At least one of `{title, ticketId}` required. */
  readonly title?: string;
  /** Story description. */
  readonly description?: string;
  /** Issue tracker reference. At least one of `{title, ticketId}` required. */
  readonly ticketId?: string;
  /** Import source. Defaults to `'manual'`. */
  readonly source?: string;
  /** External system identifier for future importers. */
  readonly externalId?: string;
  /** Unix milliseconds when the item was created. */
  readonly createdAt: number;
}

/**
 * An agenda item must carry at least one of `{title, ticketId}` with text in
 * it — the ADR-0042 rule that stops an item from becoming an unidentifiable
 * blank row. Exported by path (not on the barrel) so `agenda-commands` can
 * apply it as a *refusal* while the two writers below keep applying it as a
 * defensive `throw`: one spelling of the rule, two enforcement styles.
 */
export function hasAgendaItemIdentity(
  title: string | undefined,
  ticketId: string | undefined,
): boolean {
  return Boolean(title?.trim()) || Boolean(ticketId?.trim());
}

/**
 * Append a new agenda item to the doc. Validates that at least one of
 * `{title, ticketId}` is non-empty. Generates a UUID, assigns a `sortKey`
 * after the last pending item, sets state to `'pending'` and source to
 * `'manual'` (unless overridden). Returns the new item's id.
 */
export function appendAgendaItem(doc: Y.Doc, init: AppendAgendaItemInit): string {
  if (!hasAgendaItemIdentity(init.title, init.ticketId)) {
    throw new Error('appendAgendaItem: at least one of {title, ticketId} is required');
  }

  const id = crypto.randomUUID();

  // Find the sortKey of the last pending item.
  const arr = agendaArray(doc);
  let lastPendingSortKey: string | null = null;
  arr.forEach((m) => {
    if (m.get('state') === 'pending') {
      const sk = m.get('sortKey') as string | undefined;
      if (sk !== undefined) {
        if (lastPendingSortKey === null || sk > lastPendingSortKey) {
          lastPendingSortKey = sk;
        }
      }
    }
  });

  const sortKey = keyBetween(lastPendingSortKey, null);

  doc.transact(() => {
    const item = new Y.Map<unknown>();
    item.set('id', id);
    item.set('state', 'pending');
    item.set('source', init.source ?? 'manual');
    item.set('sortKey', sortKey);
    item.set('createdAt', init.createdAt);
    if (init.title !== undefined) item.set('title', init.title);
    if (init.description !== undefined) item.set('description', init.description);
    if (init.ticketId !== undefined) item.set('ticketId', init.ticketId);
    if (init.externalId !== undefined) item.set('externalId', init.externalId);
    agendaArray(doc).push([item]);
  });

  return id;
}

/**
 * Patch fields on an existing agenda item. Only `title`, `ticketId`, and
 * `description` are mutable. Rejected when:
 * - Item is not found.
 * - Item state is `'skipped'` or `'cancelled'` (frozen).
 * - The patch would leave both `title` and `ticketId` empty.
 */
export interface UpdateAgendaItemFieldsInit {
  readonly title?: string;
  readonly ticketId?: string;
  readonly description?: string;
}

export function updateAgendaItemFields(
  doc: Y.Doc,
  id: string,
  patch: UpdateAgendaItemFieldsInit,
): void {
  const item = findAgendaItemMap(doc, id);
  if (!item) throw new Error(`updateAgendaItemFields: item ${id} not found`);

  const state = item.get('state') as string;
  if (state === 'skipped' || state === 'cancelled') {
    throw new Error(`updateAgendaItemFields: item ${id} is ${state} and cannot be edited`);
  }

  // Compute resulting title/ticketId after patch.
  const newTitle =
    patch.title !== undefined ? patch.title : (item.get('title') as string | undefined);
  const newTicketId =
    patch.ticketId !== undefined ? patch.ticketId : (item.get('ticketId') as string | undefined);

  if (!hasAgendaItemIdentity(newTitle, newTicketId)) {
    throw new Error(
      'updateAgendaItemFields: at least one of {title, ticketId} must remain non-empty',
    );
  }

  doc.transact(() => {
    if (patch.title !== undefined) item.set('title', patch.title);
    if (patch.ticketId !== undefined) item.set('ticketId', patch.ticketId);
    if (patch.description !== undefined) item.set('description', patch.description);
  });
}

/**
 * Options for `setAgendaItemState`.
 */
export interface SetAgendaItemStateOpts {
  readonly consumedByRoundId?: string;
  /**
   * Unix milliseconds written to `consumedAt`. Required when `state` is
   * `'consumed'` and ignored otherwise — `'skipped'` and `'cancelled'`
   * persist no timestamp. There is no ambient-clock fallback (#507).
   */
  readonly timestamp?: number;
}

/**
 * Transition an agenda item to a new state.
 *
 * Valid transitions (at the writer):
 * - `pending`  → `consumed` | `skipped` | `cancelled`
 * - `consumed` → `consumed` (idempotent)
 * - All other transitions are rejected.
 *
 * When transitioning to `consumed`, writes `consumedAt` from
 * `opts.timestamp` — required for that state, and throws when absent rather
 * than reaching for the ambient clock — plus `consumedByRoundId` (when
 * provided). `'skipped'` and `'cancelled'` persist no timestamp.
 *
 * Note that consumption in production does *not* run through here: it happens
 * inside `maybeConsumeLinkedAgendaItem` at round terminal, in the same
 * transaction as the reveal/skip write (ADR-0045). The `'consumed'` branch
 * below is the writer's transition table staying complete, not a live path.
 */
export function setAgendaItemState(
  doc: Y.Doc,
  id: string,
  state: AgendaItemState,
  opts: SetAgendaItemStateOpts = {},
): void {
  const item = findAgendaItemMap(doc, id);
  if (!item) throw new Error(`setAgendaItemState: item ${id} not found`);

  const current = item.get('state') as string;

  // Validate transition.
  if (current === state && state === 'consumed') {
    // Idempotent — already consumed.
    return;
  }

  if (current !== 'pending') {
    throw new Error(
      `setAgendaItemState: invalid transition '${current}' → '${state}' for item ${id}`,
    );
  }

  if (state === 'consumed' && opts.timestamp === undefined) {
    throw new Error(`setAgendaItemState: timestamp is required when consuming item ${id}`);
  }

  doc.transact(() => {
    item.set('state', state);
    if (state === 'consumed') {
      item.set('consumedAt', opts.timestamp);
      if (opts.consumedByRoundId !== undefined) {
        item.set('consumedByRoundId', opts.consumedByRoundId);
      }
    }
  });
}

/**
 * Reorder a pending agenda item by rewriting its `sortKey`.
 *
 * `before` = sortKey of the item that should come before the reordered item
 * (or `null` / `undefined` if the item should become the first).
 * `after`  = sortKey of the item that should come after the reordered item
 * (or `null` / `undefined` if the item should become the last).
 *
 * Throws if the item is not found or not in `pending` state.
 */
export function reorderAgendaItem(
  doc: Y.Doc,
  id: string,
  before?: string | null,
  after?: string | null,
): void {
  const item = findAgendaItemMap(doc, id);
  if (!item) throw new Error(`reorderAgendaItem: item ${id} not found`);

  const state = item.get('state') as string;
  if (state !== 'pending') {
    throw new Error(
      `reorderAgendaItem: item ${id} is ${state}; only pending items may be reordered`,
    );
  }

  const newSortKey = keyBetween(before ?? null, after ?? null);

  doc.transact(() => {
    item.set('sortKey', newSortKey);
  });
}

// ---------------------------------------------------------------------------
// Agenda selectors (derived state)
// ---------------------------------------------------------------------------

/**
 * Return the first `pending` item in the sorted agenda projection, or `null`
 * if there are no pending items. Used by callers to determine what to pre-fill
 * in the "Next Round" flow.
 */
export function nextPendingAgendaItem(projection: DocProjection): AgendaItem | null {
  for (const item of projection.agenda) {
    if (item.state === 'pending') return item;
  }
  return null;
}
