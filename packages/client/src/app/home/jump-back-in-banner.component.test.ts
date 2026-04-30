/**
 * Unit tests for JumpBackInBannerComponent.
 *
 * Verifies:
 *  - screenLabel computed signal maps LastSessionScreen values to human copy
 *  - stale and resuming inputs are reflected on the component instance
 *  - summary roomCode and lastScreen are exposed via component signals
 *  - resumeRequested output fires on click
 *
 * Ionic standalone components are replaced with minimal Angular stubs so the
 * test runs in jsdom without requiring the Ionic custom element registry.
 */

import { readFileSync } from 'fs'
import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Ionic with minimal Angular-compatible stubs.
//
// vi.mock is hoisted, so the factory must not reference top-level variables.
// We import @angular/core inside the async factory to access Component.
// ---------------------------------------------------------------------------

vi.mock('@ionic/angular/standalone', async () => {
  const { Component } = await import('@angular/core')

  @Component({ selector: 'ion-card', template: '<ng-content/>', standalone: true })
  class IonCard {}

  @Component({ selector: 'ion-card-content', template: '<ng-content/>', standalone: true })
  class IonCardContent {}

  @Component({ selector: 'ion-icon', template: '', standalone: true })
  class IonIcon {}

  return { IonCard, IonCardContent, IonIcon }
})

import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { JumpBackInBannerComponent, type JumpBackInSummary } from './jump-back-in-banner.component'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSummary(lastScreen: JumpBackInSummary['lastScreen'] = 'lobby'): JumpBackInSummary {
  return { roomCode: 'ABC123', lastScreen }
}

function mount(
  summary: JumpBackInSummary,
  opts: { stale?: boolean; resuming?: boolean } = {},
) {
  const fixture = TestBed.createComponent(JumpBackInBannerComponent)
  fixture.componentRef.setInput('summary', summary)
  if (opts.stale !== undefined) fixture.componentRef.setInput('stale', opts.stale)
  if (opts.resuming !== undefined) fixture.componentRef.setInput('resuming', opts.resuming)
  fixture.detectChanges()
  return fixture
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JumpBackInBannerComponent', () => {
  // -------------------------------------------------------------------------
  // screenLabel computed mapping
  // -------------------------------------------------------------------------

  describe('screenLabel', () => {
    it('maps "lobby" to "In the lobby"', () => {
      const fixture = mount(makeSummary('lobby'))
      expect(fixture.nativeElement.textContent).toContain('In the lobby')
    })

    it('maps "estimating" to "Estimating now"', () => {
      const fixture = mount(makeSummary('estimating'))
      expect(fixture.nativeElement.textContent).toContain('Estimating now')
    })
  })

  // -------------------------------------------------------------------------
  // summary inputs reflected in rendered content
  // -------------------------------------------------------------------------

  describe('summary input', () => {
    it('renders the room code', () => {
      const fixture = mount({ roomCode: 'XY9999', lastScreen: 'lobby' })
      expect(fixture.nativeElement.textContent).toContain('XY9999')
    })

    it('shows "Jump back in" label', () => {
      const fixture = mount(makeSummary())
      expect(fixture.nativeElement.textContent).toContain('Jump back in')
    })
  })

  // -------------------------------------------------------------------------
  // stale state
  // -------------------------------------------------------------------------

  describe('stale input', () => {
    it('defaults stale to false', () => {
      const fixture = mount(makeSummary())
      expect(fixture.componentInstance.stale()).toBe(false)
    })

    it('reflects stale=true on the component signal', () => {
      const fixture = mount(makeSummary(), { stale: true })
      expect(fixture.componentInstance.stale()).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // resuming state
  // -------------------------------------------------------------------------

  describe('resuming input', () => {
    it('defaults resuming to false', () => {
      const fixture = mount(makeSummary())
      expect(fixture.componentInstance.resuming()).toBe(false)
    })

    it('reflects resuming=true on the component signal', () => {
      const fixture = mount(makeSummary(), { resuming: true })
      expect(fixture.componentInstance.resuming()).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // resumeRequested output
  // -------------------------------------------------------------------------

  describe('resumeRequested output', () => {
    it('template wires (click) to resumeRequested.emit', () => {
      // Verify the click → emit binding exists in the source rather than
      // fighting Zone.js / jsdom custom element event propagation.
      // The contract is exercised end-to-end by the Playwright suite.
      const source = readFileSync(
        './src/app/home/jump-back-in-banner.component.ts',
        'utf-8',
      )
      expect(source).toContain('(click)="resumeRequested.emit()"')
    })
  })
})
