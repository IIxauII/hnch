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
 *  - Re-pressing the digit bound to the current vote still clears it, as
 *    observed behaviour (mirrors tap-to-deselect, AC4) — but the toggle
 *    rule itself no longer lives here. This resolver only reports intent
 *    (`'cast'`); `@hnch/shared`'s `vote-commands.toggleCurrentVote` is the
 *    single place that decides cast vs. clear by comparing against the
 *    vote already on record.
 *  - Arrow keys shift a transient focus cursor only; Enter/Space on a
 *    focused card commits.
 *  - Any modifier (Ctrl/Meta/Alt) is treated as a browser/OS shortcut
 *    and skipped.
 */
export type KeyAction =
  | { kind: 'cast'; card: string; index: number }
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
    return { kind: 'cast', card, index: idx };
  }

  return { kind: 'noop' };
}

function indexOfVote(cards: readonly string[], vote: string | undefined): number | undefined {
  if (vote === undefined) return undefined;
  const i = cards.indexOf(vote);
  return i >= 0 ? i : undefined;
}

/**
 * True when the given DOM element is one in which the user is typing
 * (input, textarea, contenteditable, Ionic input variants). The
 * Estimating keyboard handler must yield to typing on those elements
 * so digits don't double as both card-vote and text input.
 */
export function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'ION-INPUT' || tag === 'ION-TEXTAREA' || tag === 'ION-SEARCHBAR') return true;
  return (el as HTMLElement).isContentEditable === true;
}

export interface KeyboardGateContext {
  readonly defaultPrevented: boolean;
  readonly activeElement: Element | null;
  readonly overlayPresent: boolean;
  readonly roundActive: boolean;
  readonly isViewer: boolean;
}

/**
 * Returns true iff the Estimating page's keydown handler should process
 * this event. Bails on: already-handled events, focus inside an editable
 * element, any Ionic overlay above the page, no active votable round, or
 * the local user being a viewer.
 */
export function shouldHandleKeyEvent(ctx: KeyboardGateContext): boolean {
  if (ctx.defaultPrevented) return false;
  if (isEditableElement(ctx.activeElement)) return false;
  if (ctx.overlayPresent) return false;
  if (!ctx.roundActive) return false;
  if (ctx.isViewer) return false;
  return true;
}
