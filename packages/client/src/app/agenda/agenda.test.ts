/**
 * Tests for agenda Phase 2 components:
 * - AgendaItemFormSheetComponent: validator, pre-fill in edit mode
 * - AgendaPanelComponent: renders pending items, hides cancelled by default,
 *   shows cancelled on toggle, host-only controls
 * - RoundHistoryComponent: agenda backref label fallback
 */

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { AgendaItem, Round } from '@hnch/shared';

// ---------------------------------------------------------------------------
// Ionic stubs
// ---------------------------------------------------------------------------

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp } = await import('@angular/core');

  // Factory to avoid repeated decorator boilerplate.
  function makeComp(selector: string) {
    @Comp({ selector, template: '<ng-content></ng-content>', standalone: true })
    class Stub {}
    return Stub;
  }

  return {
    IonButton: makeComp('ion-button'),
    IonButtons: makeComp('ion-buttons'),
    IonBadge: makeComp('ion-badge'),
    IonChip: makeComp('ion-chip'),
    IonContent: makeComp('ion-content'),
    IonFooter: makeComp('ion-footer'),
    IonHeader: makeComp('ion-header'),
    IonIcon: makeComp('ion-icon'),
    IonInput: makeComp('ion-input'),
    IonItem: makeComp('ion-item'),
    IonLabel: makeComp('ion-label'),
    IonList: makeComp('ion-list'),
    IonListHeader: makeComp('ion-list-header'),
    IonNote: makeComp('ion-note'),
    IonTextarea: makeComp('ion-textarea'),
    IonTitle: makeComp('ion-title'),
    IonToolbar: makeComp('ion-toolbar'),
  };
});

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({
  addOutline: '',
  arrowDownOutline: '',
  arrowUpOutline: '',
  banOutline: '',
  checkmarkCircleOutline: '',
  chevronForwardOutline: '',
  createOutline: '',
  ellipsisHorizontalOutline: '',
  pencilOutline: '',
  playSkipForwardOutline: '',
}));

// ---------------------------------------------------------------------------
// DocService + SurfaceService stubs (injected via TestBed providers)
// ---------------------------------------------------------------------------

const mockAgendaSignal = signal<readonly AgendaItem[]>([]);

class MockDocService {
  readonly agenda = mockAgendaSignal.asReadonly();
}

class MockSurfaceService {
  readonly mode = signal<'mobile' | 'desktop'>('desktop').asReadonly();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgendaItem(overrides: Partial<AgendaItem> & { id: string }): AgendaItem {
  return {
    state: 'pending',
    source: 'manual',
    sortKey: 'a0',
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeRound(overrides: Partial<Round> & Pick<Round, 'id' | 'scale' | 'votes'>): Round {
  return {
    createdAt: Date.now(),
    createdBy: 'p1',
    ...overrides,
  };
}

function makeScale(cards: string[]) {
  return { id: 'fibonacci', cards };
}

// ---------------------------------------------------------------------------
// AgendaItemFormSheetComponent
// ---------------------------------------------------------------------------

type FormAccess = {
  form: {
    valid: boolean;
    errors: Record<string, unknown> | null;
    controls: {
      title: { setValue: (v: string) => void; errors: Record<string, unknown> | null };
      ticketId: { setValue: (v: string) => void };
      description: {
        setValue: (v: string) => void;
        errors: Record<string, unknown> | null;
      };
    };
    getRawValue: () => { title: string; ticketId: string; description: string };
  };
};

describe('AgendaItemFormSheetComponent', () => {
  it('rejects submit when both title and ticketId are empty', async () => {
    const { AgendaItemFormSheetComponent } = await import('./agenda-item-form.sheet');
    const fixture = TestBed.createComponent(AgendaItemFormSheetComponent);
    fixture.componentRef.setInput('mode', 'add');
    // Do NOT call detectChanges — template has formControlName on IonInput stubs (no CVA).
    // ngOnInit runs but form group is accessible without rendering.
    fixture.componentInstance.ngOnInit();

    const comp = fixture.componentInstance as unknown as FormAccess;
    expect(comp.form.valid).toBe(false);
    expect(comp.form.errors?.['atLeastOneRequired']).toBe(true);
  });

  it('accepts submit with title only', async () => {
    const { AgendaItemFormSheetComponent } = await import('./agenda-item-form.sheet');
    const fixture = TestBed.createComponent(AgendaItemFormSheetComponent);
    fixture.componentRef.setInput('mode', 'add');
    fixture.componentInstance.ngOnInit();

    const comp = fixture.componentInstance as unknown as FormAccess;
    comp.form.controls.title.setValue('My story');

    expect(comp.form.valid).toBe(true);
  });

  it('accepts submit with ticketId only', async () => {
    const { AgendaItemFormSheetComponent } = await import('./agenda-item-form.sheet');
    const fixture = TestBed.createComponent(AgendaItemFormSheetComponent);
    fixture.componentRef.setInput('mode', 'add');
    fixture.componentInstance.ngOnInit();

    const comp = fixture.componentInstance as unknown as FormAccess;
    comp.form.controls.ticketId.setValue('PROJ-1234');

    expect(comp.form.valid).toBe(true);
  });

  it('pre-fills from initialItem in edit mode', async () => {
    const { AgendaItemFormSheetComponent } = await import('./agenda-item-form.sheet');
    const fixture = TestBed.createComponent(AgendaItemFormSheetComponent);
    const item = makeAgendaItem({
      id: 'item-1',
      title: 'Pre-filled title',
      ticketId: 'PROJ-999',
      description: 'Some context',
    });
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('initialItem', item);
    fixture.componentInstance.ngOnInit();

    const comp = fixture.componentInstance as unknown as FormAccess;
    const val = comp.form.getRawValue();
    expect(val.title).toBe('Pre-filled title');
    expect(val.ticketId).toBe('PROJ-999');
    expect(val.description).toBe('Some context');
  });

  it('description max 500 chars validator', async () => {
    const { AgendaItemFormSheetComponent } = await import('./agenda-item-form.sheet');
    const fixture = TestBed.createComponent(AgendaItemFormSheetComponent);
    fixture.componentRef.setInput('mode', 'add');
    fixture.componentInstance.ngOnInit();

    const comp = fixture.componentInstance as unknown as FormAccess;
    comp.form.controls.title.setValue('Title');
    comp.form.controls.description.setValue('x'.repeat(501));

    expect(comp.form.valid).toBe(false);
    expect(comp.form.controls.description.errors?.['maxlength']).toBeDefined();
  });

  it('emits submitted with trimmed values on valid form', async () => {
    const { AgendaItemFormSheetComponent } = await import('./agenda-item-form.sheet');
    const fixture = TestBed.createComponent(AgendaItemFormSheetComponent);
    fixture.componentRef.setInput('mode', 'add');
    fixture.componentInstance.ngOnInit();

    const comp = fixture.componentInstance as unknown as FormAccess;
    const submitted: unknown[] = [];
    fixture.componentInstance.submitted.subscribe((v) => submitted.push(v));

    comp.form.controls.title.setValue('  My story  ');
    fixture.componentInstance['submit']();

    expect(submitted).toHaveLength(1);
    expect((submitted[0] as { title: string }).title).toBe('My story');
  });
});

// ---------------------------------------------------------------------------
// AgendaPanelComponent
// ---------------------------------------------------------------------------

type PanelAccess = {
  visibleItems: () => AgendaItem[];
  nextItem: () => AgendaItem | null;
  hasCancelled: () => boolean;
  showCancelled: { set: (v: boolean) => void };
  pendingCount: () => number;
};

async function mountPanel(items: AgendaItem[], isHost = false) {
  const { AgendaPanelComponent } = await import('./agenda-panel.component');
  const { SurfaceService } = await import('../core/surface.service');
  TestBed.configureTestingModule({
    providers: [{ provide: SurfaceService, useValue: new MockSurfaceService() }],
  });
  const fixture = TestBed.createComponent(AgendaPanelComponent);
  fixture.componentRef.setInput('items', items);
  fixture.componentRef.setInput('isHost', isHost);
  fixture.detectChanges();
  return fixture.componentInstance as unknown as PanelAccess;
}

describe('AgendaPanelComponent', () => {
  it('renders pending items in visibleItems', async () => {
    const items: AgendaItem[] = [
      makeAgendaItem({ id: 'b', sortKey: 'b0', title: 'B story' }),
      makeAgendaItem({ id: 'a', sortKey: 'a0', title: 'A story' }),
    ];
    const comp = await mountPanel(items);
    const visible = comp.visibleItems();
    expect(visible).toHaveLength(2);
    expect(visible.map((i) => i.id)).toContain('a');
    expect(visible.map((i) => i.id)).toContain('b');
  });

  it('hides cancelled items by default', async () => {
    const items: AgendaItem[] = [
      makeAgendaItem({ id: 'p1', sortKey: 'a0', title: 'Pending' }),
      makeAgendaItem({ id: 'c1', sortKey: 'b0', title: 'Cancelled', state: 'cancelled' }),
    ];
    const comp = await mountPanel(items);
    const visible = comp.visibleItems();
    expect(visible).toHaveLength(1);
    expect(visible[0]!.id).toBe('p1');
  });

  it('reveals cancelled items when showCancelled toggled', async () => {
    const items: AgendaItem[] = [
      makeAgendaItem({ id: 'p1', sortKey: 'a0', title: 'Pending' }),
      makeAgendaItem({ id: 'c1', sortKey: 'b0', title: 'Cancelled', state: 'cancelled' }),
    ];
    const comp = await mountPanel(items);
    comp.showCancelled.set(true);
    expect(comp.visibleItems()).toHaveLength(2);
  });

  it('hasCancelled is true when cancelled items exist', async () => {
    const items: AgendaItem[] = [
      makeAgendaItem({ id: 'c1', sortKey: 'a0', title: 'Cancelled', state: 'cancelled' }),
    ];
    const comp = await mountPanel(items);
    expect(comp.hasCancelled()).toBe(true);
  });

  it('hasCancelled is false when no cancelled items', async () => {
    const items: AgendaItem[] = [makeAgendaItem({ id: 'p1', sortKey: 'a0', title: 'Pending' })];
    const comp = await mountPanel(items);
    expect(comp.hasCancelled()).toBe(false);
  });

  it('nextItem returns first pending item', async () => {
    const items: AgendaItem[] = [
      makeAgendaItem({ id: 'p1', sortKey: 'a0', title: 'First' }),
      makeAgendaItem({ id: 'p2', sortKey: 'b0', title: 'Second' }),
    ];
    const comp = await mountPanel(items);
    expect(comp.nextItem()?.id).toBe('p1');
  });

  it('nextItem is null when no pending items', async () => {
    const items: AgendaItem[] = [
      makeAgendaItem({ id: 'c1', sortKey: 'a0', title: 'Consumed', state: 'consumed' }),
    ];
    const comp = await mountPanel(items);
    expect(comp.nextItem()).toBeNull();
  });

  it('pendingCount reflects only pending items', async () => {
    const items: AgendaItem[] = [
      makeAgendaItem({ id: 'p1', sortKey: 'a0', title: 'Pending 1' }),
      makeAgendaItem({ id: 'p2', sortKey: 'b0', title: 'Pending 2' }),
      makeAgendaItem({ id: 'c1', sortKey: 'c0', title: 'Consumed', state: 'consumed' }),
    ];
    const comp = await mountPanel(items);
    expect(comp.pendingCount()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// RoundHistoryComponent — agenda backref fallback
// ---------------------------------------------------------------------------

describe('RoundHistoryComponent — agenda backref label fallback', () => {
  it('uses agenda item title when round has no title and agendaItemId set', async () => {
    const agendaItem = makeAgendaItem({
      id: 'agenda-1',
      title: 'Auth redesign',
      sortKey: 'a0',
    });
    mockAgendaSignal.set([agendaItem]);

    const { RoundHistoryComponent } = await import('../shared/round-history.component');
    const { DocService } = await import('../core/doc/doc.service');
    TestBed.configureTestingModule({
      providers: [{ provide: DocService, useValue: new MockDocService() }],
    });
    const fixture = TestBed.createComponent(RoundHistoryComponent);
    const scale = makeScale(['1', '2', '3']);
    const round = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '3' },
      revealedAt: 2000,
      timerStartedAt: 1000,
      agendaItemId: 'agenda-1',
    });
    fixture.componentRef.setInput('rounds', [round]);
    fixture.detectChanges();

    const entries = fixture.componentInstance.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.label).toContain('Auth redesign');

    mockAgendaSignal.set([]);
  });

  it('shows null label when round has no title and no matching agenda item', async () => {
    mockAgendaSignal.set([]);

    const { RoundHistoryComponent } = await import('../shared/round-history.component');
    const { DocService } = await import('../core/doc/doc.service');
    TestBed.configureTestingModule({
      providers: [{ provide: DocService, useValue: new MockDocService() }],
    });
    const fixture = TestBed.createComponent(RoundHistoryComponent);
    const scale = makeScale(['1', '2', '3']);
    const round = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '3' },
      revealedAt: 2000,
      timerStartedAt: 1000,
    });
    fixture.componentRef.setInput('rounds', [round]);
    fixture.detectChanges();

    const entries = fixture.componentInstance.entries();
    expect(entries[0]!.label).toBeNull();
  });

  it('prefers round title over agenda item title', async () => {
    const agendaItem = makeAgendaItem({
      id: 'agenda-2',
      title: 'Agenda title',
      sortKey: 'a0',
    });
    mockAgendaSignal.set([agendaItem]);

    const { RoundHistoryComponent } = await import('../shared/round-history.component');
    const { DocService } = await import('../core/doc/doc.service');
    TestBed.configureTestingModule({
      providers: [{ provide: DocService, useValue: new MockDocService() }],
    });
    const fixture = TestBed.createComponent(RoundHistoryComponent);
    const scale = makeScale(['1', '2', '3']);
    const round = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '3' },
      revealedAt: 2000,
      timerStartedAt: 1000,
      title: 'Round title takes priority',
      agendaItemId: 'agenda-2',
    });
    fixture.componentRef.setInput('rounds', [round]);
    fixture.detectChanges();

    const entries = fixture.componentInstance.entries();
    expect(entries[0]!.label).toContain('Round title takes priority');

    mockAgendaSignal.set([]);
  });

  it('uses agenda item ticketId when round has no ticketId and agendaItemId set', async () => {
    const agendaItem = makeAgendaItem({
      id: 'agenda-3',
      ticketId: 'PROJ-777',
      sortKey: 'a0',
    });
    mockAgendaSignal.set([agendaItem]);

    const { RoundHistoryComponent } = await import('../shared/round-history.component');
    const { DocService } = await import('../core/doc/doc.service');
    TestBed.configureTestingModule({
      providers: [{ provide: DocService, useValue: new MockDocService() }],
    });
    const fixture = TestBed.createComponent(RoundHistoryComponent);
    const scale = makeScale(['1', '2', '3']);
    const round = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '3' },
      revealedAt: 2000,
      timerStartedAt: 1000,
      agendaItemId: 'agenda-3',
    });
    fixture.componentRef.setInput('rounds', [round]);
    fixture.detectChanges();

    const entries = fixture.componentInstance.entries();
    expect(entries[0]!.label).toContain('PROJ-777');

    mockAgendaSignal.set([]);
  });
});
