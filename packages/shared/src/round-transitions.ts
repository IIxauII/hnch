/**
 * Round-transition legality — the single home for the "is this round still
 * open?" rule that both domains branch on.
 *
 * A round is **active** while its resolved `status` is non-terminal
 * (`pending | voting`): still open to votes and to a terminal transition.
 * From an active round all three terminals (reveal / skip / discard) are
 * legal, so legality *is* the active/terminal split — there is no per-target
 * arg. Readers and callers branch on the resolved `status` via these
 * predicates instead of re-spelling `status === 'pending' || 'voting'`.
 *
 * Writers guard on raw timestamps via the deep `terminalState()` helper (see
 * `round-status.ts`); they do not use these status predicates, which operate
 * on the already-resolved projection `status`.
 */

import type { RoundStatus, TerminalRoundStatus } from './doc.js';

/** A terminal state that leaves something to show: a result, or a skip. */
export type RecordedRoundStatus = Exclude<TerminalRoundStatus, 'discarded'>;

/**
 * Type guard: the round has reached a terminal state (`revealed` / `skipped`
 * / `discarded`) and can no longer transition or accept votes.
 */
export function isTerminalStatus(s: RoundStatus): s is TerminalRoundStatus {
  return s === 'revealed' || s === 'skipped' || s === 'discarded';
}

/**
 * Type guard: the round ended with something to show for it — `revealed` or
 * `skipped`.
 *
 * A `discarded` round is terminal too, but it is a tombstone (ADR-0046): it
 * appears in no list, under no heading and in no export, and it takes no
 * round number. Anything that *lists* finished rounds filters on this, not on
 * {@link isTerminalStatus}.
 */
export function isRecordedStatus(s: RoundStatus): s is RecordedRoundStatus {
  return s === 'revealed' || s === 'skipped';
}

/**
 * True when the round is **active** (`pending | voting`) — i.e. a terminal
 * transition is still legal. The exact complement of `isTerminalStatus`.
 */
export function canEnterTerminal(s: RoundStatus): boolean {
  return !isTerminalStatus(s);
}
