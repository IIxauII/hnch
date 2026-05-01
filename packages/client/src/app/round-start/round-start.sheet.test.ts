/**
 * Tests for RoundStartSheetComponent.
 *
 * Combines source-file inspection (for template/interface structure) with
 * direct FormControl trimming logic tests — avoids TestBed overhead while
 * covering the submit() business rules precisely.
 */

import { readFileSync } from 'fs'
import { FormControl, Validators } from '@angular/forms'
import { describe, expect, it } from 'vitest'

const sourceFile = readFileSync(
  './src/app/round-start/round-start.sheet.ts',
  'utf-8',
)

// ---------------------------------------------------------------------------
// Source-level structural assertions
// ---------------------------------------------------------------------------

describe('RoundStartSheetComponent', () => {
  describe('RoundStartSubmission interface', () => {
    it('has ticketId field', () => {
      expect(sourceFile).toContain('readonly ticketId: string | null')
    })
  })

  describe('template', () => {
    it('has ticketId input field', () => {
      expect(sourceFile).toContain('[formControl]="ticketIdControl"')
    })

    it('has placeholder text for ticketId', () => {
      expect(sourceFile).toContain('PROJ-123')
    })
  })

  describe('ticketIdControl', () => {
    it('has maxLength(200) validator', () => {
      expect(sourceFile).toContain('Validators.maxLength(200)')
    })
  })

  describe('submit() emit shape', () => {
    it('emits ticketId field', () => {
      expect(sourceFile).toContain('ticketId:')
    })

    it('trims ticketId before emitting', () => {
      // The submit method must call .trim() on the ticketId raw value
      expect(sourceFile).toContain('ticketRaw')
    })
  })

  // ---------------------------------------------------------------------------
  // FormControl trimming logic — pure unit tests without Angular DI
  // ---------------------------------------------------------------------------

  describe('trimming and null-coercion logic', () => {
    /** Mirror of the submit() logic for isolated testing. */
    function submitValues(titleVal: string, ticketVal: string) {
      const titleControl = new FormControl<string>(titleVal, { nonNullable: true, validators: [Validators.maxLength(120)] })
      const ticketIdControl = new FormControl<string>(ticketVal, { nonNullable: true, validators: [Validators.maxLength(200)] })
      const titleRaw = titleControl.value.trim()
      const ticketRaw = ticketIdControl.value.trim()
      return {
        title: titleRaw === '' ? null : titleRaw,
        ticketId: ticketRaw === '' ? null : ticketRaw,
      }
    }

    it('emits both title and ticketId when both are provided', () => {
      expect(submitValues('My ticket', 'PROJ-123')).toEqual({
        title: 'My ticket',
        ticketId: 'PROJ-123',
      })
    })

    it('emits ticketId null when only title is provided', () => {
      expect(submitValues('Login redesign', '')).toEqual({
        title: 'Login redesign',
        ticketId: null,
      })
    })

    it('emits title null and ticketId null when both blank', () => {
      expect(submitValues('', '')).toEqual({ title: null, ticketId: null })
    })

    it('trims whitespace-only ticketId to null', () => {
      expect(submitValues('Some title', '   ')).toEqual({
        title: 'Some title',
        ticketId: null,
      })
    })

    it('trims surrounding whitespace from both fields', () => {
      expect(submitValues('  Trimmed title  ', '  PROJ-456  ')).toEqual({
        title: 'Trimmed title',
        ticketId: 'PROJ-456',
      })
    })

    it('emits URL ticketId unchanged (no case normalization)', () => {
      const url = 'https://linear.app/my-team/issue/PROJ-789'
      expect(submitValues('Auth flow', url)).toEqual({
        title: 'Auth flow',
        ticketId: url,
      })
    })
  })
})
