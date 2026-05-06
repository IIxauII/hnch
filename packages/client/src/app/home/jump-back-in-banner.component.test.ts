/**
 * Unit tests for JumpBackInBannerComponent.
 *
 * Covers:
 *  - screenLabel computed: maps LastSessionScreen values to copy strings.
 *  - onTap: emits resumeRequested when idle; suppressed when resuming
 *    and not stale; always emitted when stale (so user can clear stale entry).
 *
 * Ionic components are stubbed via proper @Component decorators so
 * Angular's JIT compiler accepts them as standalone imports.
 */

import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { JumpBackInBannerComponent, type JumpBackInSummary } from './jump-back-in-banner.component'

// ---------------------------------------------------------------------------
// Ionic stubs — must be proper @Component classes, not plain objects.
// ---------------------------------------------------------------------------

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core')

  @Comp({ selector: 'ion-icon', template: '', standalone: true })
  class IonIcon {}

  @Comp({ selector: 'ion-item', template: '<ng-content></ng-content>', standalone: true })
  class IonItem {
    @Input() disabled = false
  }

  @Comp({ selector: 'ion-label', template: '<ng-content></ng-content>', standalone: true })
  class IonLabel {}

  return { IonIcon, IonItem, IonLabel }
})

vi.mock('ionicons', () => ({ addIcons: vi.fn() }))
vi.mock('ionicons/icons', () => ({ returnUpBackOutline: 'stub' }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSummary(lastScreen: JumpBackInSummary['lastScreen'] = 'lobby'): JumpBackInSummary {
  return { roomCode: 'ABC123', lastScreen }
}

async function mount(
  summary: JumpBackInSummary,
  opts: { stale?: boolean; resuming?: boolean } = {},
) {
  const { JumpBackInBannerComponent: Comp } = await import('./jump-back-in-banner.component')
  const fixture = TestBed.createComponent(Comp)
  fixture.componentRef.setInput('summary', summary)
  if (opts.stale !== undefined) fixture.componentRef.setInput('stale', opts.stale)
  if (opts.resuming !== undefined) fixture.componentRef.setInput('resuming', opts.resuming)
  fixture.detectChanges()
  return fixture
}

// ---------------------------------------------------------------------------
// screenLabel
// ---------------------------------------------------------------------------

describe('JumpBackInBannerComponent.screenLabel', () => {
  it('renders "In the lobby" for lastScreen=lobby', async () => {
    const fixture = await mount(makeSummary('lobby'))
    expect(fixture.nativeElement.textContent).toContain('In the lobby')
  })

  it('renders "Estimating now" for lastScreen=estimating', async () => {
    const fixture = await mount(makeSummary('estimating'))
    expect(fixture.nativeElement.textContent).toContain('Estimating now')
  })

  it('renders the room code in the subtitle', async () => {
    const fixture = await mount(makeSummary('lobby'))
    expect(fixture.nativeElement.textContent).toContain('ABC123')
  })
})

// ---------------------------------------------------------------------------
// onTap / resumeRequested
// ---------------------------------------------------------------------------

describe('JumpBackInBannerComponent.onTap', () => {
  it('emits resumeRequested when not resuming and not stale', async () => {
    const fixture = await mount(makeSummary(), { resuming: false, stale: false })
    const spy = vi.spyOn(fixture.componentInstance.resumeRequested, 'emit')
    fixture.componentInstance['onTap']()
    expect(spy).toHaveBeenCalledOnce()
  })

  it('suppresses resumeRequested when resuming and not stale', async () => {
    const fixture = await mount(makeSummary(), { resuming: true, stale: false })
    const spy = vi.spyOn(fixture.componentInstance.resumeRequested, 'emit')
    fixture.componentInstance['onTap']()
    expect(spy).not.toHaveBeenCalled()
  })

  it('emits resumeRequested when stale even if resuming=true', async () => {
    const fixture = await mount(makeSummary(), { resuming: true, stale: true })
    const spy = vi.spyOn(fixture.componentInstance.resumeRequested, 'emit')
    fixture.componentInstance['onTap']()
    expect(spy).toHaveBeenCalledOnce()
  })

  it('emits resumeRequested when stale and not resuming', async () => {
    const fixture = await mount(makeSummary(), { resuming: false, stale: true })
    const spy = vi.spyOn(fixture.componentInstance.resumeRequested, 'emit')
    fixture.componentInstance['onTap']()
    expect(spy).toHaveBeenCalledOnce()
  })
})
