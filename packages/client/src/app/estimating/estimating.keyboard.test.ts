import { describe, expect, it } from 'vitest';

import {
  isEditableElement,
  resolveKeyboardCardAction,
  shouldHandleKeyEvent,
  type KeyEventLike,
} from './estimating.keyboard';

const FIB = ['0', '1', '2', '3', '5', '8', '13', '21'] as const;
const LINEAR = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
const TSHIRT = ['XS', 'S', 'M', 'L', 'XL'] as const;

function ev(partial: Partial<KeyEventLike> & { key?: string; code?: string }): KeyEventLike {
  return {
    key: partial.key ?? partial.code ?? '',
    code: partial.code ?? '',
    ctrlKey: partial.ctrlKey ?? false,
    metaKey: partial.metaKey ?? false,
    altKey: partial.altKey ?? false,
  };
}

// Exercises: estimating.keyboard:resolveKeyboardCardAction
describe('resolveKeyboardCardAction', () => {
  describe('digits', () => {
    it('Digit1 → cast index 0 when nothing voted', () => {
      const r = resolveKeyboardCardAction(
        ev({ code: 'Digit1', key: '1' }),
        FIB,
        undefined,
        undefined,
        false,
      );
      expect(r).toEqual({ kind: 'cast', card: '0', index: 0 });
    });

    it('Digit2..Digit9 → cast indices 1..8', () => {
      for (let d = 2; d <= 9; d++) {
        const r = resolveKeyboardCardAction(
          ev({ code: `Digit${d}`, key: String(d) }),
          LINEAR,
          undefined,
          undefined,
          false,
        );
        expect(r).toEqual({ kind: 'cast', card: LINEAR[d - 1], index: d - 1 });
      }
    });

    it('Digit0 → cast index 9 (10th card) on 10-card scale', () => {
      const r = resolveKeyboardCardAction(
        ev({ code: 'Digit0', key: '0' }),
        LINEAR,
        undefined,
        undefined,
        false,
      );
      expect(r).toEqual({ kind: 'cast', card: '10', index: 9 });
    });

    it('Digit0 → noop when scale has < 10 cards', () => {
      const r = resolveKeyboardCardAction(
        ev({ code: 'Digit0', key: '0' }),
        FIB,
        undefined,
        undefined,
        false,
      );
      expect(r).toEqual({ kind: 'noop' });
    });

    it('Digit out-of-range → noop on short scale (T-shirt, 5 cards)', () => {
      const r = resolveKeyboardCardAction(
        ev({ code: 'Digit6', key: '6' }),
        TSHIRT,
        undefined,
        undefined,
        false,
      );
      expect(r).toEqual({ kind: 'noop' });
    });

    it('re-pressing digit bound to current vote → cast the same card (toggle rule lives in @hnch/shared)', () => {
      const r = resolveKeyboardCardAction(
        ev({ code: 'Digit4', key: '4' }),
        FIB,
        '3',
        undefined,
        false,
      );
      expect(r).toEqual({ kind: 'cast', card: '3', index: 3 });
    });

    it('pressing a different digit while voted → cast new card', () => {
      const r = resolveKeyboardCardAction(
        ev({ code: 'Digit5', key: '5' }),
        FIB,
        '3',
        undefined,
        false,
      );
      expect(r).toEqual({ kind: 'cast', card: '5', index: 4 });
    });
  });

  describe('modifiers', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      it(`Digit1 with ${mod} → noop (defer to browser/OS)`, () => {
        const r = resolveKeyboardCardAction(
          ev({ code: 'Digit1', key: '1', [mod]: true }),
          FIB,
          undefined,
          undefined,
          false,
        );
        expect(r).toEqual({ kind: 'noop' });
      });
    }
  });

  describe('arrow keys (focus only, wrap)', () => {
    it('ArrowRight from undefined focus → focus index 0', () => {
      const r = resolveKeyboardCardAction(
        ev({ key: 'ArrowRight' }),
        FIB,
        undefined,
        undefined,
        false,
      );
      expect(r).toEqual({ kind: 'focus', index: 0 });
    });

    it('ArrowLeft from undefined focus → focus last index', () => {
      const r = resolveKeyboardCardAction(
        ev({ key: 'ArrowLeft' }),
        FIB,
        undefined,
        undefined,
        false,
      );
      // start = 0, step = -1, ((0-1)%8+8)%8 = 7
      expect(r).toEqual({ kind: 'focus', index: 7 });
    });

    it('ArrowRight from focus N → focus N+1', () => {
      const r = resolveKeyboardCardAction(ev({ key: 'ArrowRight' }), FIB, undefined, 3, false);
      expect(r).toEqual({ kind: 'focus', index: 4 });
    });

    it('ArrowRight wraps from last → 0', () => {
      const r = resolveKeyboardCardAction(ev({ key: 'ArrowRight' }), FIB, undefined, 7, false);
      expect(r).toEqual({ kind: 'focus', index: 0 });
    });

    it('ArrowLeft wraps from 0 → last', () => {
      const r = resolveKeyboardCardAction(ev({ key: 'ArrowLeft' }), FIB, undefined, 0, false);
      expect(r).toEqual({ kind: 'focus', index: 7 });
    });

    it('ArrowRight uses myVote index when focus unset', () => {
      const r = resolveKeyboardCardAction(ev({ key: 'ArrowRight' }), FIB, '3', undefined, false);
      // myVote '3' is index 3 → next is 4
      expect(r).toEqual({ kind: 'focus', index: 4 });
    });

    it('ArrowLeft uses myVote index when focus unset', () => {
      const r = resolveKeyboardCardAction(ev({ key: 'ArrowLeft' }), FIB, '5', undefined, false);
      // myVote '5' is index 4 → prev is 3
      expect(r).toEqual({ kind: 'focus', index: 3 });
    });
  });

  describe('Enter / Space commit', () => {
    it('Enter on focused card → cast at focusedIndex', () => {
      const r = resolveKeyboardCardAction(ev({ key: 'Enter' }), FIB, undefined, 2, true);
      expect(r).toEqual({ kind: 'cast', card: '2', index: 2 });
    });

    it('Space on focused card → cast at focusedIndex', () => {
      const r = resolveKeyboardCardAction(ev({ key: ' ', code: 'Space' }), FIB, undefined, 2, true);
      expect(r).toEqual({ kind: 'cast', card: '2', index: 2 });
    });

    it('Enter on focused card matching myVote → cast the same card (toggle rule lives in @hnch/shared)', () => {
      const r = resolveKeyboardCardAction(ev({ key: 'Enter' }), FIB, '2', 2, true);
      expect(r).toEqual({ kind: 'cast', card: '2', index: 2 });
    });

    it('Enter when activeElement is NOT a card → noop', () => {
      const r = resolveKeyboardCardAction(ev({ key: 'Enter' }), FIB, undefined, 2, false);
      expect(r).toEqual({ kind: 'noop' });
    });

    it('Enter on card, focus unset, but myVote set → cast at vote index', () => {
      const r = resolveKeyboardCardAction(ev({ key: 'Enter' }), FIB, '3', undefined, true);
      // Re-pressing the already-voted card still resolves to 'cast' — the
      // toggle rule (clears when it matches the vote on record) now lives
      // in @hnch/shared's vote-commands.toggleCurrentVote.
      expect(r).toEqual({ kind: 'cast', card: '3', index: 3 });
    });

    it('Enter on card, focus unset and no vote → noop (ambiguous target)', () => {
      const r = resolveKeyboardCardAction(ev({ key: 'Enter' }), FIB, undefined, undefined, true);
      expect(r).toEqual({ kind: 'noop' });
    });
  });

  describe('other keys', () => {
    it('Tab → noop', () => {
      const r = resolveKeyboardCardAction(ev({ key: 'Tab' }), FIB, undefined, undefined, false);
      expect(r).toEqual({ kind: 'noop' });
    });

    it('letter key → noop', () => {
      const r = resolveKeyboardCardAction(
        ev({ key: 'a', code: 'KeyA' }),
        FIB,
        undefined,
        undefined,
        false,
      );
      expect(r).toEqual({ kind: 'noop' });
    });

    it('empty cards array → noop on any key', () => {
      const r = resolveKeyboardCardAction(
        ev({ code: 'Digit1', key: '1' }),
        [],
        undefined,
        undefined,
        false,
      );
      expect(r).toEqual({ kind: 'noop' });
    });

    it('Arrow on empty cards → noop', () => {
      const r = resolveKeyboardCardAction(
        ev({ key: 'ArrowRight' }),
        [],
        undefined,
        undefined,
        false,
      );
      expect(r).toEqual({ kind: 'noop' });
    });
  });
});

// isEditableElement

function makeEl(tag: string, opts: { isContentEditable?: boolean } = {}): Element {
  return {
    tagName: tag.toUpperCase(),
    isContentEditable: opts.isContentEditable ?? false,
  } as unknown as Element;
}

// Exercises: estimating.keyboard:isEditableElement
describe('isEditableElement', () => {
  it('returns false for null', () => {
    expect(isEditableElement(null)).toBe(false);
  });

  it('returns true for INPUT, TEXTAREA, SELECT', () => {
    expect(isEditableElement(makeEl('input'))).toBe(true);
    expect(isEditableElement(makeEl('textarea'))).toBe(true);
    expect(isEditableElement(makeEl('select'))).toBe(true);
  });

  it('returns true for Ionic input variants', () => {
    expect(isEditableElement(makeEl('ion-input'))).toBe(true);
    expect(isEditableElement(makeEl('ion-textarea'))).toBe(true);
    expect(isEditableElement(makeEl('ion-searchbar'))).toBe(true);
  });

  it('returns true for contentEditable elements', () => {
    expect(isEditableElement(makeEl('div', { isContentEditable: true }))).toBe(true);
  });

  it('returns false for ordinary non-editable elements', () => {
    expect(isEditableElement(makeEl('div'))).toBe(false);
    expect(isEditableElement(makeEl('ion-card'))).toBe(false);
    expect(isEditableElement(makeEl('button'))).toBe(false);
  });
});

// shouldHandleKeyEvent

// Exercises: estimating.keyboard:shouldHandleKeyEvent
describe('shouldHandleKeyEvent', () => {
  const baseCtx = {
    defaultPrevented: false,
    activeElement: null as Element | null,
    overlayPresent: false,
    roundActive: true,
    isViewer: false,
  };

  it('returns true under the happy path', () => {
    expect(shouldHandleKeyEvent(baseCtx)).toBe(true);
  });

  it('returns false when event.defaultPrevented', () => {
    expect(shouldHandleKeyEvent({ ...baseCtx, defaultPrevented: true })).toBe(false);
  });

  it('returns false when activeElement is editable', () => {
    expect(shouldHandleKeyEvent({ ...baseCtx, activeElement: makeEl('input') })).toBe(false);
    expect(shouldHandleKeyEvent({ ...baseCtx, activeElement: makeEl('ion-input') })).toBe(false);
  });

  it('returns false when an Ionic overlay is open', () => {
    expect(shouldHandleKeyEvent({ ...baseCtx, overlayPresent: true })).toBe(false);
  });

  it('returns false when no round is active', () => {
    expect(shouldHandleKeyEvent({ ...baseCtx, roundActive: false })).toBe(false);
  });

  it('returns false when the local user is a viewer', () => {
    expect(shouldHandleKeyEvent({ ...baseCtx, isViewer: true })).toBe(false);
  });
});
