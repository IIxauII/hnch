/**
 * Pure key→action resolver for the Estimating card grid (issue #154).
 *
 * The HostListener on EstimatingPage is a thin shell: it gathers the
 * relevant context (active element, scale cards, current vote, focus
 * cursor) and forwards to this function, then dispatches the result.
 * Keeping it pure makes the digit/arrow/Enter matrix exhaustively
 * unit-testable without TestBed.
 *
 * Decisions (per plan):
 *  - Digits 1–9 map to card index 0–8; Digit0 maps to index 9. No-op when
 *    the index is out of range for short scales.
 *  - Re-pressing the digit bound to the current vote clears it (mirrors
 *    tap-to-deselect, AC4).
 *  - Arrow keys shift a transient focus cursor only; Enter/Space on a
 *    focused card commits.
 *  - Any modifier (Ctrl/Meta/Alt) is treated as a browser/OS shortcut
 *    and skipped.
 */
export type KeyAction =
  | { kind: 'cast'; card: string; index: number }
  | { kind: 'clear' }
  | { kind: 'focus'; index: number }
  | { kind: 'noop' };

export interface KeyEventLike {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

const DIGIT_CODE_RE = /^Digit(\d)$/;

/**
 * Resolve a keyboard event into a card-grid action.
 *
 * @param event              Subset of KeyboardEvent fields we read.
 * @param cards              Current scale cards, in display order.
 * @param myVote             Current user's vote (or undefined).
 * @param focusedIndex       Transient focus cursor maintained by the
 *                           component. `undefined` when arrow nav has
 *                           not yet been used this round.
 * @param activeElementIsCard True when document.activeElement is one of
 *                            the card refs (gates Enter/Space).
 */
export function resolveKeyboardCardAction(
  event: KeyEventLike,
  cards: readonly string[],
  myVote: string | undefined,
  focusedIndex: number | undefined,
  activeElementIsCard: boolean,
): KeyAction {
  if (event.ctrlKey || event.metaKey || event.altKey) return { kind: 'noop' };
  if (cards.length === 0) return { kind: 'noop' };

  const digitMatch = DIGIT_CODE_RE.exec(event.code);
  if (digitMatch) {
    const digit = Number(digitMatch[1]);
    const index = digit === 0 ? 9 : digit - 1;
    if (index >= cards.length) return { kind: 'noop' };
    const card = cards[index]!;
    if (myVote === card) return { kind: 'clear' };
    return { kind: 'cast', card, index };
  }

  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    const len = cards.length;
    const start =
      focusedIndex ?? indexOfVote(cards, myVote) ?? (event.key === 'ArrowRight' ? -1 : 0);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = (((start + step) % len) + len) % len;
    return { kind: 'focus', index: next };
  }

  if (
    (event.key === 'Enter' || event.key === ' ' || event.code === 'Space') &&
    activeElementIsCard
  ) {
    // Source-of-truth for "which card is focused" is the caller's
    // focusedIndex (set when ArrowLeft/Right ran). If unset — Enter
    // pressed on a card tab-walked into via Tab — fall back to vote
    // index. If neither is available there is no unambiguous target.
    const idx = focusedIndex ?? indexOfVote(cards, myVote);
    if (idx === undefined) return { kind: 'noop' };
    if (idx < 0 || idx >= cards.length) return { kind: 'noop' };
    const card = cards[idx]!;
    if (myVote === card) return { kind: 'clear' };
    return { kind: 'cast', card, index: idx };
  }

  return { kind: 'noop' };
}

function indexOfVote(cards: readonly string[], vote: string | undefined): number | undefined {
  if (vote === undefined) return undefined;
  const i = cards.indexOf(vote);
  return i >= 0 ? i : undefined;
}
