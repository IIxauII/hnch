/**
 * Tests for SegmentedCodeInputComponent.
 *
 * Exercises the multi-char onInput path (SMS autofill / IME distribute)
 * directly on the component class instance — no TestBed template rendering
 * required because the logic under test lives entirely in the class body
 * and signal accessors work without Angular DI.
 */

import { QueryList, ElementRef } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedCodeInputComponent } from './segmented-code-input.component';

function buildComponent(): SegmentedCodeInputComponent {
  const cmp = new SegmentedCodeInputComponent();

  // Stub ViewChildren QueryList so focusTile() doesn't throw
  const makeFakeInput = () => new ElementRef<HTMLInputElement>(document.createElement('input'));

  const queryList = new QueryList<ElementRef<HTMLInputElement>>();
  // QueryList._results is the backing array
  (queryList as unknown as { _results: ElementRef<HTMLInputElement>[] })._results = Array.from(
    { length: 6 },
    makeFakeInput,
  );

  cmp.tileInputs = queryList;
  return cmp;
}

describe('SegmentedCodeInputComponent', () => {
  describe('onInput — multi-char distribute (SMS autofill / IME)', () => {
    it('distributes 6 chars across all tiles when input.value is "ABCDEF" on tile 0', () => {
      const cmp = buildComponent();

      const onChange = vi.fn<[string], void>();
      cmp.registerOnChange(onChange);

      const inputEl = document.createElement('input');
      inputEl.value = 'ABCDEF';
      const event = new Event('input', { bubbles: true });
      Object.defineProperty(event, 'target', { value: inputEl, writable: false });

      // Access protected method via cast
      (cmp as unknown as { onInput(e: Event, i: number): void }).onInput(event, 0);

      expect(cmp['tiles']()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
      expect(onChange).toHaveBeenCalledWith('ABCDEF');
    });

    it('distributes lowercase chars, uppercasing them', () => {
      const cmp = buildComponent();

      const onChange = vi.fn<[string], void>();
      cmp.registerOnChange(onChange);

      const inputEl = document.createElement('input');
      inputEl.value = 'abcdef';
      const event = new Event('input', { bubbles: true });
      Object.defineProperty(event, 'target', { value: inputEl, writable: false });

      (cmp as unknown as { onInput(e: Event, i: number): void }).onInput(event, 0);

      expect(cmp['tiles']()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
      expect(onChange).toHaveBeenCalledWith('ABCDEF');
    });

    it('distributes starting from the focused tile index', () => {
      const cmp = buildComponent();

      const onChange = vi.fn<[string], void>();
      cmp.registerOnChange(onChange);

      const inputEl = document.createElement('input');
      inputEl.value = 'XYZ';
      const event = new Event('input', { bubbles: true });
      Object.defineProperty(event, 'target', { value: inputEl, writable: false });

      (cmp as unknown as { onInput(e: Event, i: number): void }).onInput(event, 3);

      const tiles = cmp['tiles']();
      // Tiles 0-2 untouched (empty), tiles 3-5 filled with X, Y, Z
      expect(tiles).toEqual(['', '', '', 'X', 'Y', 'Z']);
      // emitChange joins all tiles — empty tiles contribute '' so value is '   XYZ' without spaces = 'XYZ'
      // but empty string + empty string + ... + 'X' + 'Y' + 'Z' = 'XYZ'
      expect(onChange).toHaveBeenCalledWith('XYZ');
    });
  });

  // A tile holds one character, and the browser lets no second one in. A
  // wrong character used to be corrected with Backspace or not at all.
  describe('typing into a tile that holds a character', () => {
    type Internals = {
      onKeyDown(e: KeyboardEvent, i: number): void;
      onFocus(i: number, e?: Event): void;
      selectTile(e: Event): void;
    };

    function filled(code = 'A2B3C4') {
      const cmp = buildComponent();
      cmp.writeValue(code);
      const onChange = vi.fn<[string], void>();
      cmp.registerOnChange(onChange);
      return { cmp, onChange, internals: cmp as unknown as Internals };
    }

    function key(init: KeyboardEventInit): KeyboardEvent {
      return new KeyboardEvent('keydown', { cancelable: true, ...init });
    }

    it('replaces it', () => {
      const { cmp, onChange, internals } = filled();
      const event = key({ key: 'k' });

      internals.onKeyDown(event, 0);

      expect(cmp['tiles']()).toEqual(['K', '2', 'B', '3', 'C', '4']);
      expect(onChange).toHaveBeenCalledExactlyOnceWith('K2B3C4');
      expect(event.defaultPrevented).toBe(true);
    });

    it('moves on to the next tile, so that a whole code can be typed over', () => {
      const { cmp, internals } = filled();

      [...'k7p9mr'].forEach((char, index) => internals.onKeyDown(key({ key: char }), index));

      expect(cmp['tiles']().join('')).toBe('K7P9MR');
    });

    it('leaves an empty tile to the browser, which has the character to put in', () => {
      const cmp = buildComponent();
      const event = key({ key: 'k' });

      (cmp as unknown as Internals).onKeyDown(event, 0);

      expect(event.defaultPrevented).toBe(false);
      expect(cmp['tiles']()).toEqual(['', '', '', '', '', '']);
    });

    it('takes nothing that is not a character of a code', () => {
      const { cmp, onChange, internals } = filled();

      for (const init of [
        { key: '-' },
        { key: ' ' },
        { key: 'Tab' },
        { key: 'Enter' },
        { key: 'é' },
      ]) {
        const event = key(init);
        internals.onKeyDown(event, 0);
        expect(event.defaultPrevented, init.key).toBe(false);
      }

      expect(cmp['tiles']().join('')).toBe('A2B3C4');
      expect(onChange).not.toHaveBeenCalled();
    });

    // Paste, select all, reload.
    it('leaves a shortcut alone that happens to use a letter', () => {
      const { cmp, internals } = filled();

      for (const init of [
        { key: 'v', ctrlKey: true },
        { key: 'v', metaKey: true },
        { key: 'a', altKey: true },
      ]) {
        const event = key(init);
        internals.onKeyDown(event, 0);
        expect(event.defaultPrevented).toBe(false);
      }

      expect(cmp['tiles']().join('')).toBe('A2B3C4');
    });

    // A keyboard on screen sends no keys to go by. What it enters replaces
    // what is selected.
    it('selects the character of the tile that takes the focus', () => {
      const { internals } = filled();
      const tile = document.createElement('input');
      tile.value = 'A';
      document.body.append(tile);
      const event = new Event('focus');
      Object.defineProperty(event, 'target', { value: tile });

      internals.onFocus(0, event);

      expect([tile.selectionStart, tile.selectionEnd]).toEqual([0, 1]);
      tile.remove();
    });

    it('selects it again on a click, which puts the cursor down', () => {
      const { internals } = filled();
      const tile = document.createElement('input');
      tile.value = 'A';
      document.body.append(tile);
      tile.setSelectionRange(1, 1);
      const event = new Event('click');
      Object.defineProperty(event, 'target', { value: tile });

      internals.selectTile(event);

      expect([tile.selectionStart, tile.selectionEnd]).toEqual([0, 1]);
      tile.remove();
    });
  });
});
