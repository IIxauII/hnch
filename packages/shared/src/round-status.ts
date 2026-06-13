/**
 * Internal terminal-state resolver — NOT part of the public barrel (`index.ts`).
 *
 * `terminalState` is the choke point that resolves a `StoredRound`'s three raw
 * terminal timestamps into one winner. Its sole production caller is
 * `projectRound` (in `doc-projection.ts`), which materializes the result as the
 * `status` / `terminalAt` fields on the projection `Round`. Readers branch on
 * those resolved fields and never see this helper or the raw timestamps.
 *
 * Kept in a dedicated module (rather than re-exported from `doc.js`) so the
 * package barrel does not leak it to consumers (client, CLI), while shared's
 * own tests can still exercise the tie-break directly.
 */

import type { StoredRound, TerminalRoundStatus } from './doc.js';

/**
 * Resolves the terminal state of a round. Returns `'revealed'`, `'skipped'`,
 * or `'discarded'` when the corresponding timestamp is set, or `null` if the
 * round is still in progress. When multiple terminal timestamps coexist after
 * a concurrent CRDT merge, the earliest wins (ADR-0040 tie-break extended
 * uniformly to all three terminal fields). On a literal tie the resolution
 * order is reveal → skip → discard so that revealed rounds win against
 * 1ms-late discards (matching the reveal-vs-skip precedent).
 */
export function terminalState(
  r: Pick<StoredRound, 'revealedAt' | 'skippedAt' | 'discardedAt'>,
): TerminalRoundStatus | null {
  const { revealedAt, skippedAt, discardedAt } = r;
  if (revealedAt === undefined && skippedAt === undefined && discardedAt === undefined) {
    return null;
  }
  const candidates: { kind: TerminalRoundStatus; at: number }[] = [];
  if (revealedAt !== undefined) candidates.push({ kind: 'revealed', at: revealedAt });
  if (skippedAt !== undefined) candidates.push({ kind: 'skipped', at: skippedAt });
  if (discardedAt !== undefined) candidates.push({ kind: 'discarded', at: discardedAt });
  // Stable preference on literal tie: revealed > skipped > discarded.
  const rank = { revealed: 0, skipped: 1, discarded: 2 } as const;
  candidates.sort((a, b) => a.at - b.at || rank[a.kind] - rank[b.kind]);
  return candidates[0]!.kind;
}
