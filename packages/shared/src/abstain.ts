/**
 * Abstain sentinel and type guard (ADR-0041).
 *
 * A participant who abstains from a round writes this sentinel as their vote
 * value. It is distinct from "no vote" (absent key) and from any valid card
 * face. The relay and peers treat it as an opaque string — only clients need
 * to recognize it.
 */

/** Sentinel vote value written to the Yjs doc when a participant abstains. */
export const ABSTAIN_SENTINEL = 'hnch_abstain';

/**
 * Returns `true` if `card` is the abstain sentinel (exact match, no trimming).
 * Use this guard instead of comparing against the literal string directly.
 */
export function isAbstainVote(card: string): boolean {
  return card === ABSTAIN_SENTINEL;
}
