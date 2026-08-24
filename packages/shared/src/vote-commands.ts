/**
 * Vote commands (writer side) — the single seam both client and CLI call to
 * cast, change, clear, or abstain a vote on the *active* round.
 *
 * Both commands select `activeRound(projectDoc(doc))` rather than
 * `currentRound()`: a terminated round (revealed, skipped, *or* discarded)
 * must refuse writes, and `currentRound()`'s anchor fallback would hand back
 * exactly the round that just went terminal — the window this module closes.
 * The low-level `castVote` / `clearVote` writers in `doc-projection.ts` only
 * ever guarded on `revealedAt`; a vote arriving after a skip or discard was
 * silently recorded. Both writers keep that narrower contract unchanged —
 * this module is the place that widens the gate, not the writers.
 *
 * `toggleCurrentVote` is also the single home of the toggle rule — tapping
 * the card you already voted for clears it — previously re-spelled in four
 * places across the two clients. It additionally gates on standing: only an
 * *active* `'voter'` may cast, via `isActiveParticipant` — the same
 * choke-point `shouldAutoReveal` and `DocService.activeParticipants` use
 * (`doc.ts`). A `participantId` absent from the projection (never joined),
 * departed (`leftAt` set — left or removed, ADR-0036), or a `'viewer'` all
 * resolve to the same "not a voter" refusal — there is no role to read for
 * the first two, and no value in splitting departure into a distinct
 * failure mode.
 *
 * `clearCurrentVote` gates on the active round only, deliberately *not* on
 * standing: a participant who flips voter → viewer, or who leaves or is
 * removed, mid-round must still be able to withdraw a vote already sitting
 * in the tally, or it is stranded there with no way to remove it. Clearing a
 * vote that was never cast is a harmless no-op — there is no third refusal
 * reason for it.
 *
 * `VoteResult`'s refusal vocabulary is intentionally *not* `TerminalResult`'s
 * (`round-commands.ts`): that type splits "no round" from "already terminal"
 * because its callers act on the distinction; here a caller only ever needs
 * "there was nothing to vote on" vs. "you can't vote", so the two collapse
 * into `'no-active-round'`. Same seam, different shape — an accepted
 * divergence, not an inconsistency to reconcile.
 */

import type * as Y from 'yjs';

import { isActiveParticipant, participantRole } from './doc.js';
import { activeRound, castVote, clearVote, projectDoc } from './doc-projection.js';

/**
 * The outcome of a vote command. `effect` distinguishes a fresh cast from a
 * toggle-off so a caller can suppress a "voted" affordance on clear without
 * re-deriving it from the prior vote.
 */
export type VoteResult =
  | { applied: true; effect: 'cast' | 'cleared' }
  | { applied: false; reason: 'no-active-round' | 'not-a-voter' };

/**
 * Cast, change, or clear `participantId`'s vote on the active round,
 * applying the toggle rule: re-selecting the card already on record clears
 * it instead of re-casting it. This covers the abstain sentinel with no
 * special-casing — `ABSTAIN_SENTINEL` is just another card value. Refuses
 * with `'no-active-round'` when every round is terminal or none exists, and
 * with `'not-a-voter'` when `participantId` does not resolve to an *active*
 * `'voter'` (absent from the projection, departed per `isActiveParticipant`,
 * or a `'viewer'`).
 */
export function toggleCurrentVote(doc: Y.Doc, participantId: string, card: string): VoteResult {
  const projection = projectDoc(doc);
  const round = activeRound(projection);
  if (!round) return { applied: false, reason: 'no-active-round' };

  const participant = projection.participants.find((p) => p.id === participantId);
  if (
    !participant ||
    !isActiveParticipant(participant) ||
    participantRole(participant) !== 'voter'
  ) {
    return { applied: false, reason: 'not-a-voter' };
  }

  if (round.votes[participantId] === card) {
    clearVote(doc, round.id, participantId);
    return { applied: true, effect: 'cleared' };
  }
  castVote(doc, round.id, participantId, card);
  return { applied: true, effect: 'cast' };
}

/**
 * Clear `participantId`'s vote on the active round. Gated on the active
 * round only — not on role or standing — so a participant who becomes a
 * viewer, or who leaves or is removed, mid-round can still withdraw a vote
 * already in the tally. Always clears (a no-op vote is harmless) when a
 * round is active; refuses with `'no-active-round'` otherwise.
 */
export function clearCurrentVote(doc: Y.Doc, participantId: string): VoteResult {
  const projection = projectDoc(doc);
  const round = activeRound(projection);
  if (!round) return { applied: false, reason: 'no-active-round' };

  clearVote(doc, round.id, participantId);
  return { applied: true, effect: 'cleared' };
}
