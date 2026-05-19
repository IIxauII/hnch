// Exercises: menu-popover/menu-popover.component:MenuPopoverComponent

import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

// ---------------------------------------------------------------------------
// Ionic stubs — hoisted before the component import.
// PopoverController must be @Injectable so DI can provide it.
// ---------------------------------------------------------------------------

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Injectable } = await import('@angular/core');
  const stub = (sel: string) =>
    Comp({ selector: sel, template: '<ng-content/>', standalone: true })(class {});

  @Injectable()
  class PopoverController {
    dismiss = vi.fn().mockResolvedValue(true);
  }

  return {
    IonList: stub('ion-list'),
    IonListHeader: stub('ion-list-header'),
    IonItem: stub('ion-item'),
    IonLabel: stub('ion-label'),
    IonIcon: stub('ion-icon'),
    PopoverController,
  };
});

// ---------------------------------------------------------------------------
// visibleItems — cancel-role filtering
// ---------------------------------------------------------------------------

describe('MenuPopoverComponent — visibleItems', () => {
  it('cancel-role items are excluded', async () => {
    const { MenuPopoverComponent } = await import('./menu-popover.component');
    const { PopoverController } = await import('@ionic/angular/standalone');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MenuPopoverComponent],
      providers: [PopoverController],
    });
    const fixture = TestBed.createComponent(MenuPopoverComponent);
    fixture.componentRef.setInput('items', [
      { text: 'Make host', icon: 'star-outline' },
      { text: 'Remove', role: 'destructive', icon: 'person-remove-outline' },
      { text: 'Cancel', role: 'cancel' },
    ]);
    fixture.detectChanges();

    const visible = fixture.componentInstance.visibleItems();
    expect(visible).toHaveLength(2);
    expect(visible.map((i) => i.text)).toEqual(['Make host', 'Remove']);
    expect(visible.find((i) => i.role === 'cancel')).toBeUndefined();
  });

  it('items without role are all visible', async () => {
    const { MenuPopoverComponent } = await import('./menu-popover.component');
    const { PopoverController } = await import('@ionic/angular/standalone');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MenuPopoverComponent],
      providers: [PopoverController],
    });
    const fixture = TestBed.createComponent(MenuPopoverComponent);
    fixture.componentRef.setInput('items', [
      { text: 'Option A' },
      { text: 'Option B', role: 'destructive' },
    ]);
    fixture.detectChanges();

    expect(fixture.componentInstance.visibleItems()).toHaveLength(2);
  });

  it('empty items list produces empty visibleItems', async () => {
    const { MenuPopoverComponent } = await import('./menu-popover.component');
    const { PopoverController } = await import('@ionic/angular/standalone');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MenuPopoverComponent],
      providers: [PopoverController],
    });
    const fixture = TestBed.createComponent(MenuPopoverComponent);
    fixture.componentRef.setInput('items', []);
    fixture.detectChanges();

    expect(fixture.componentInstance.visibleItems()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// onItemClick — dismiss-then-handler sequencing
// ---------------------------------------------------------------------------

describe('MenuPopoverComponent — onItemClick', () => {
  it('calls popoverCtrl.dismiss then item handler', async () => {
    const { MenuPopoverComponent } = await import('./menu-popover.component');
    const { PopoverController } = await import('@ionic/angular/standalone');
    TestBed.resetTestingModule();
    const popoverDismiss = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      imports: [MenuPopoverComponent],
      providers: [{ provide: PopoverController, useValue: { dismiss: popoverDismiss } }],
    });
    const fixture = TestBed.createComponent(MenuPopoverComponent);
    const handler = vi.fn().mockResolvedValue(undefined);

    await fixture.componentInstance.onItemClick({ text: 'Make host', handler });

    expect(popoverDismiss).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('calls dismiss even when handler is absent', async () => {
    const { MenuPopoverComponent } = await import('./menu-popover.component');
    const { PopoverController } = await import('@ionic/angular/standalone');
    TestBed.resetTestingModule();
    const popoverDismiss = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      imports: [MenuPopoverComponent],
      providers: [{ provide: PopoverController, useValue: { dismiss: popoverDismiss } }],
    });
    const fixture = TestBed.createComponent(MenuPopoverComponent);

    await fixture.componentInstance.onItemClick({ text: 'No handler' });

    expect(popoverDismiss).toHaveBeenCalledOnce();
  });
});
