import { resolveRoundLineage } from '@hnch/shared';
import type { Round } from '@hnch/shared';

/**
 * Badge for a round that re-votes an earlier one (ADR-0013, #111):
 * `"Re-vote"`, or `null` for a round that is not a re-vote and for one whose
 * parent chain cannot be resolved.
 *
 * A round keeps one number — its place in the session. The chain position
 * used to be folded into the heading as "Round 2 of 3", which named two
 * different rounds "Round 2" on the same screen. The rounds it re-votes are
 * listed right below it, so the badge does not count them.
 */
export function revoteLabel(roundId: string, allRounds: readonly Round[]): string | null {
  return resolveRoundLineage(roundId, allRounds) === null ? null : 'Re-vote';
}
