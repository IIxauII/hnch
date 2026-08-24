/**
 * Agenda commands (writer side) — the single seam both client and CLI call to
 * add, edit, skip, cancel or reorder a pre-session agenda item (ADR-0042).
 *
 * Built exactly like `round-commands` and `vote-commands`: take the doc, apply
 * the gate, stamp the injectable clock (default `Date.now`), delegate to the
 * low-level `doc-projection` writer, and return a typed result. Illegal states
 * **no-op with a reason** instead of throwing — a host editing an item a peer
 * cancelled a moment earlier has lost a race, not written a bug, and the raw
 * writers' `throw` treated those two as the same thing (#507).
 *
 * The commands are deliberately short-named (`addItem`, not
 * `addAgendaItem`): the module is the noun. Skip and cancel stay distinct
 * rather than collapsing into one state setter — under ADR-0042 they are
 * different user acts with different meanings, and a single `setState(item,
 * state)` would put the writer's shape back on the public surface.
 *
 * **No authority gate.** No host rule exists on agenda edits today, in either
 * surface; the Lobby gates its affordances on `isHost()` and that is where the
 * rule lives. Inventing a shared gate here would be a behaviour change, not a
 * relocation.
 *
 * **Consumption is not here.** An item becomes `consumed` inside
 * `maybeConsumeLinkedAgendaItem`, in the same transaction as the round's
 * terminal write (ADR-0045). There is no `consumeItem` command because there
 * is no caller-driven consume act to gate.
 */

import type * as Y from 'yjs';

import type { AgendaItem } from './doc.js';
import {
  appendAgendaItem,
  hasAgendaItemIdentity,
  projectDoc,
  reorderAgendaItem,
  setAgendaItemState,
  updateAgendaItemFields,
} from './doc-projection.js';

/**
 * The outcome of an agenda command. `applied: true` always carries the `id`
 * of the item acted on — for `addItem` that is the newly minted id, for the
 * rest it is the id the caller passed back unchanged, so one branch reads the
 * same either way.
 *
 * `at` is optional because only `addItem` writes a timestamp: skip, cancel
 * and reorder persist none, and stamping a clock whose value never reaches
 * the doc would be dishonest.
 *
 * Refusal reasons, and which commands can return them:
 *  - `'not-found'`      — no item with that id (`editItem`, `skipItem`,
 *                         `cancelItem`, `moveItem`).
 *  - `'not-pending'`    — the item is no longer eligible: `skipped` or
 *                         `cancelled` for `editItem` (those two states are
 *                         frozen; a `consumed` item stays editable so a
 *                         typo in an estimated story can still be fixed),
 *                         anything but `pending` for `skipItem`,
 *                         `cancelItem` and `moveItem`.
 *  - `'invalid-fields'` — the item would be left with neither a `title` nor
 *                         a `ticketId` (`addItem`, `editItem`).
 */
export type AgendaResult =
  | { applied: true; id: string; at?: number }
  | { applied: false; reason: 'not-found' | 'not-pending' | 'invalid-fields' };

/** Injectable clock — defaults to `Date.now`; tests pass a deterministic stub. */
type Clock = () => number;

/**
 * What a caller supplies to create an agenda item. Deliberately *not*
 * `AppendAgendaItemInit` minus a field: `createdAt` is the command's to
 * stamp, so the caller's type never mentions it and nobody has to work out
 * which field they are subtracting and why.
 */
export interface AddItemInit {
  /** Story title. At least one of `{title, ticketId}` must be non-empty. */
  readonly title?: string;
  /** Longer story context. */
  readonly description?: string;
  /** Issue tracker reference. At least one of `{title, ticketId}` must be non-empty. */
  readonly ticketId?: string;
  /** Import source. Defaults to `'manual'`. */
  readonly source?: string;
  /** External system identifier for future importers. */
  readonly externalId?: string;
}

/** The fields an agenda item edit may touch. */
export interface EditItemPatch {
  readonly title?: string;
  readonly ticketId?: string;
  readonly description?: string;
}

/** Select an agenda item from the projection, or the refusal to return. */
function itemOrRefusal(doc: Y.Doc, id: string): AgendaItem | AgendaResult {
  const item = projectDoc(doc).agenda.find((i) => i.id === id);
  if (!item) return { applied: false, reason: 'not-found' };
  return item;
}

/**
 * Select an item that must still be `pending` — the shared precondition of
 * skip, cancel and reorder. Returns the item, or the refusal to hand back
 * unchanged (`'not-found'` when it is gone, `'not-pending'` when a peer
 * already skipped, cancelled or estimated it).
 */
function pendingItemOrRefusal(doc: Y.Doc, id: string): AgendaItem | AgendaResult {
  const sel = itemOrRefusal(doc, id);
  if (isRefusal(sel)) return sel;
  if (sel.state !== 'pending') return { applied: false, reason: 'not-pending' };
  return sel;
}

/**
 * `true` when an item's fields are frozen. Deliberately *not* the complement
 * of `state === 'pending'`: a `consumed` item stays editable, so a typo in a
 * story that has already been estimated can still be fixed. Only the two
 * states that end an item's life without estimating it freeze its text.
 */
function isFrozen(item: AgendaItem): boolean {
  return item.state === 'skipped' || item.state === 'cancelled';
}

/** Narrow the selector unions without repeating the discriminant. */
function isRefusal(sel: AgendaItem | AgendaResult): sel is AgendaResult {
  return 'applied' in sel;
}

/**
 * Append a new agenda item, stamping `createdAt` from the injectable clock.
 * Refuses with `'invalid-fields'` when neither `title` nor `ticketId` carries
 * text. Returns the new item's id and the stamped clock value.
 */
export function addItem(doc: Y.Doc, init: AddItemInit, clock: Clock = Date.now): AgendaResult {
  if (!hasAgendaItemIdentity(init.title, init.ticketId)) {
    return { applied: false, reason: 'invalid-fields' };
  }
  const at = clock();
  const id = appendAgendaItem(doc, { ...init, createdAt: at });
  return { applied: true, id, at };
}

/**
 * Patch `title`, `ticketId` and/or `description` on an existing item.
 *
 * Refuses with `'not-found'` when the item is gone, `'not-pending'` when it
 * is frozen (see `isFrozen` — `'not-pending'` is the union's nearest member,
 * and edit's eligibility rule is *wider* than skip/cancel/reorder's: a
 * `consumed` item still edits), and `'invalid-fields'` when the patch would
 * leave both identifying fields empty. The first two are the lost-race cases
 * the raw writer used to throw on: a peer skipped or cancelled the item while
 * the host had the edit form open.
 */
export function editItem(doc: Y.Doc, id: string, patch: EditItemPatch): AgendaResult {
  const sel = itemOrRefusal(doc, id);
  if (isRefusal(sel)) return sel;
  if (isFrozen(sel)) return { applied: false, reason: 'not-pending' };

  const nextTitle = patch.title !== undefined ? patch.title : sel.title;
  const nextTicketId = patch.ticketId !== undefined ? patch.ticketId : sel.ticketId;
  if (!hasAgendaItemIdentity(nextTitle, nextTicketId)) {
    return { applied: false, reason: 'invalid-fields' };
  }

  updateAgendaItemFields(doc, id, patch);
  return { applied: true, id };
}

/**
 * Move a pending item past without estimating it (state → `'skipped'`).
 * Refuses with `'not-found'`, or `'not-pending'` when the item has already
 * been consumed, skipped or cancelled. Persists no timestamp.
 */
export function skipItem(doc: Y.Doc, id: string): AgendaResult {
  const sel = pendingItemOrRefusal(doc, id);
  if (isRefusal(sel)) return sel;

  setAgendaItemState(doc, id, 'skipped');
  return { applied: true, id };
}

/**
 * Soft-delete a pending item (state → `'cancelled'`), so it leaves the list
 * without pretending it was estimated. Refuses exactly as `skipItem` does.
 * Persists no timestamp.
 */
export function cancelItem(doc: Y.Doc, id: string): AgendaResult {
  const sel = pendingItemOrRefusal(doc, id);
  if (isRefusal(sel)) return sel;

  setAgendaItemState(doc, id, 'cancelled');
  return { applied: true, id };
}

/**
 * Reorder a pending item by rewriting its fractional-index `sortKey`.
 * `before` / `after` are the sortKeys of the items that should end up either
 * side of it; `null` / `undefined` mean "the list boundary".
 *
 * Refuses quietly with `'not-pending'` when a peer's concurrent skip, cancel
 * or round-start moved the item out of `pending` — a reorder is not worth a
 * crash. Persists no timestamp.
 */
export function moveItem(
  doc: Y.Doc,
  id: string,
  before?: string | null,
  after?: string | null,
): AgendaResult {
  const sel = pendingItemOrRefusal(doc, id);
  if (isRefusal(sel)) return sel;

  reorderAgendaItem(doc, id, before, after);
  return { applied: true, id };
}
