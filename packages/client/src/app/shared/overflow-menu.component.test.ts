/**
 * Unit tests for OverflowMenuComponent.
 *
 * Coverage:
 *  (a) renders one row per item
 *  (b) clicking a row emits itemSelected with the right id
 *  (c) destructive items get color="danger" on ion-item
 *  (d) disabled items do not emit on click
 */

import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { describe, expect, it, vi } from 'vitest'
import type { OverflowMenuItem } from './overflow-menu.component'

// ---------------------------------------------------------------------------
// Ionic stubs — replace entire module before any component import
// ---------------------------------------------------------------------------

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core')

  @Comp({
    selector: 'ion-list',
    template: '<ng-content></ng-content>',
    standalone: true,
  })
  class IonList {
    @Input() inset = false
  }

  @Comp({
    selector: 'ion-item',
    template: '<ng-content></ng-content>',
    standalone: true,
  })
  class IonItem {
    @Input() button = false
    @Input() color: string | undefined = undefined
    @Input() disabled = false
  }

  @Comp({
    selector: 'ion-label',
    template: '<ng-content></ng-content>',
    standalone: true,
  })
  class IonLabel {}

  // PopoverController must be an injectable token (class) for Angular DI.
  // The mock module exports it as an empty class — tests override it via
  // TestBed providers so `dismiss` is spied upon without real Ionic runtime.
  class PopoverController {}

  return { IonList, IonItem, IonLabel, PopoverController }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockDismiss = vi.fn().mockResolvedValue(undefined)

async function createComponent(items: OverflowMenuItem[]) {
  const { OverflowMenuComponent } = await import('./overflow-menu.component')
  const { PopoverController } = await import('@ionic/angular/standalone')

  TestBed.configureTestingModule({
    providers: [
      { provide: PopoverController, useValue: { dismiss: mockDismiss } },
    ],
  })

  const fixture = TestBed.createComponent(OverflowMenuComponent)
  fixture.componentRef.setInput('items', items)
  fixture.detectChanges()
  return fixture
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OverflowMenuComponent', () => {
  it('(a) renders one ion-item per provided item', async () => {
    const items: OverflowMenuItem[] = [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ]
    const fixture = await createComponent(items)
    const rows = fixture.nativeElement.querySelectorAll('ion-item')
    expect(rows).toHaveLength(3)
  })

  it('(b) clicking a row emits itemSelected with the item id', async () => {
    const items: OverflowMenuItem[] = [{ id: 'settings', label: 'Settings' }]
    const fixture = await createComponent(items)
    const emitted: string[] = []
    fixture.componentInstance.itemSelected.subscribe((id: string) => emitted.push(id))

    const row = fixture.nativeElement.querySelector('ion-item') as HTMLElement
    row.click()
    expect(emitted).toEqual(['settings'])
    expect(mockDismiss).toHaveBeenCalledWith('settings')
  })

  it('(c) destructive items get color="danger" on ion-item', async () => {
    // Import the IonItem stub to use as the By.directive selector.
    const { IonItem } = await import('@ionic/angular/standalone')
    const items: OverflowMenuItem[] = [
      { id: 'leave', label: 'Leave session', role: 'destructive' },
      { id: 'settings', label: 'Settings' },
    ]
    const fixture = await createComponent(items)
    const itemDebugEls = fixture.debugElement.queryAll(By.directive(IonItem))
    // Angular sets @Input() property, not the HTML attribute — check the component instance.
    expect(itemDebugEls[0]!.componentInstance.color).toBe('danger')
    expect(itemDebugEls[1]!.componentInstance.color).toBeUndefined()
  })

  it('(d) disabled items do not emit itemSelected on click', async () => {
    const items: OverflowMenuItem[] = [{ id: 'copy', label: 'Copy results', disabled: true }]
    const fixture = await createComponent(items)
    const emitted: string[] = []
    fixture.componentInstance.itemSelected.subscribe((id: string) => emitted.push(id))

    const row = fixture.nativeElement.querySelector('ion-item') as HTMLElement
    row.click()
    expect(emitted).toHaveLength(0)
  })
})
