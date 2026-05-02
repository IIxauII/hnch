/**
 * Tests for SegmentedCodeInputComponent.
 *
 * Exercises the multi-char onInput path (SMS autofill / IME distribute)
 * directly on the component class instance — no TestBed template rendering
 * required because the logic under test lives entirely in the class body
 * and signal accessors work without Angular DI.
 */

import { QueryList, ElementRef } from '@angular/core'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedCodeInputComponent } from './segmented-code-input.component'

function buildComponent(): SegmentedCodeInputComponent {
  const cmp = new SegmentedCodeInputComponent()

  // Stub ViewChildren QueryList so focusTile() doesn't throw
  const makeFakeInput = () =>
    new ElementRef<HTMLInputElement>(document.createElement('input'))

  const queryList = new QueryList<ElementRef<HTMLInputElement>>()
  // QueryList._results is the backing array
  ;(queryList as unknown as { _results: ElementRef<HTMLInputElement>[] })._results =
    Array.from({ length: 6 }, makeFakeInput)

  cmp.tileInputs = queryList
  return cmp
}

describe('SegmentedCodeInputComponent', () => {
  describe('onInput — multi-char distribute (SMS autofill / IME)', () => {
    it('distributes 6 chars across all tiles when input.value is "ABCDEF" on tile 0', () => {
      const cmp = buildComponent()

      const onChange = vi.fn<[string], void>()
      cmp.registerOnChange(onChange)

      const inputEl = document.createElement('input')
      inputEl.value = 'ABCDEF'
      const event = new Event('input', { bubbles: true })
      Object.defineProperty(event, 'target', { value: inputEl, writable: false })

      // Access protected method via cast
      ;(cmp as unknown as { onInput(e: Event, i: number): void }).onInput(event, 0)

      expect(cmp['tiles']()).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
      expect(onChange).toHaveBeenCalledWith('ABCDEF')
    })

    it('distributes lowercase chars, uppercasing them', () => {
      const cmp = buildComponent()

      const onChange = vi.fn<[string], void>()
      cmp.registerOnChange(onChange)

      const inputEl = document.createElement('input')
      inputEl.value = 'abcdef'
      const event = new Event('input', { bubbles: true })
      Object.defineProperty(event, 'target', { value: inputEl, writable: false })

      ;(cmp as unknown as { onInput(e: Event, i: number): void }).onInput(event, 0)

      expect(cmp['tiles']()).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
      expect(onChange).toHaveBeenCalledWith('ABCDEF')
    })

    it('distributes starting from the focused tile index', () => {
      const cmp = buildComponent()

      const onChange = vi.fn<[string], void>()
      cmp.registerOnChange(onChange)

      const inputEl = document.createElement('input')
      inputEl.value = 'XYZ'
      const event = new Event('input', { bubbles: true })
      Object.defineProperty(event, 'target', { value: inputEl, writable: false })

      ;(cmp as unknown as { onInput(e: Event, i: number): void }).onInput(event, 3)

      const tiles = cmp['tiles']()
      // Tiles 0-2 untouched (empty), tiles 3-5 filled with X, Y, Z
      expect(tiles).toEqual(['', '', '', 'X', 'Y', 'Z'])
      // emitChange joins all tiles — empty tiles contribute '' so value is '   XYZ' without spaces = 'XYZ'
      // but empty string + empty string + ... + 'X' + 'Y' + 'Z' = 'XYZ'
      expect(onChange).toHaveBeenCalledWith('XYZ')
    })
  })
})
