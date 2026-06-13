/**
 * Unanimous auto-reveal predicate (ADR-0018) — the single, deep owner of the
 * "who counts toward the unanimous denominator?" decision.
 *
 * Both the Angular client and the CLI call this with raw, unfiltered inputs;
 * the predicate itself applies every filter the rule depends on:
 *
 *  - active roster (`isActiveParticipant`, ADR-0036) — a kicked-but-still-
 *    connected (`leftAt`) participant is excluded from the denominator;
 *  - online (awareness) ∩ role ≠ `viewer` (ADR-0020) — viewers never count;
 *  - abstainers (`ABSTAIN_SENTINEL`, ADR-0041) — excluded from *both*
 *    numerator and denominator, so an all-abstain round does NOT auto-reveal
 *    (the host must reveal manually);
 *  - terminal guard — a round already revealed / skipped / discarded never
 *    re-reveals.
 *
 * Callers supply `(round, projection.participants, onlineIds)` and nothing
 * else — there is no caller-side filtering to drift.
 */

import { isAbstainVote } from './abstain.js';
import { isActiveParticipant, participantRole, terminalState, type Round } from './doc.js';
import type { ParticipantSnapshot } from './doc-projection.js';

/**
 * Returns `true` when the current round should auto-reveal: at least one
 * online, active, non-viewer, non-abstaining voter exists and every such
 * voter has cast a numeric (non-abstain) vote.
 *
 * @param round         The active round, or `null`/`undefined` when none.
 * @param participants  Raw, unfiltered participant snapshots (the predicate
 *                      applies the active + online + role filters itself).
 * @param onlineIds     Participant ids currently present in awareness.
 */
export function shouldAutoReveal(
  round: Pick<Round, 'revealedAt' | 'skippedAt' | 'discardedAt' | 'votes'> | null | undefined,
  participants: readonly ParticipantSnapshot[],
  onlineIds: ReadonlySet<string>,
): boolean {
  if (!round || terminalState(round) !== null) return false;

  const onlineVoterIds = new Set(
    participants
      .filter(
        (p) => isActiveParticipant(p) && onlineIds.has(p.id) && participantRole(p) !== 'viewer',
      )
      .map((p) => p.id),
  );
  if (onlineVoterIds.size === 0) return false;

  const onlineEntries = Object.entries(round.votes).filter(([id]) => onlineVoterIds.has(id));
  const abstainCount = onlineEntries.filter(([, v]) => isAbstainVote(v)).length;
  const numericCount = onlineEntries.length - abstainCount;
  const denominator = onlineVoterIds.size - abstainCount;
  if (denominator <= 0) return false; // all online voters abstained — host must reveal manually
  return numericCount >= denominator;
}
