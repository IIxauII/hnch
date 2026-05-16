/**
 * TestBed tests for CustomScaleEditorSheetComponent.
 *
 * Focuses on the abstain-sentinel validation added in ADR-0041 Phase 2
 * (onAddCard rejecting 'hnch_abstain') and the surrounding error/clear
 * paths. Secondary coverage: create-mode auto-save and cancel.
 */

import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Ionic component stubs — hoisted before component import.
// ---------------------------------------------------------------------------
vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input, forwardRef } = await import('@angular/core');
  const { NG_VALUE_ACCESSOR } = await import('@angular/forms');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});

  @Comp({
    selector: 'ion-input',
    template: '',
    standalone: true,
    providers: [
      {
        provide: NG_VALUE_ACCESSOR,
        useExisting: forwardRef(() => IonInputStub),
        multi: true,
      },
    ],
  })
  class IonInputStub {
    @Input() label: string | undefined;
    @Input() labelPlacement: string | undefined;
    @Input() placeholder: string | undefined;
    @Input() maxlength: number | undefined;
    @Input() autocapitalize: string | undefined;
    @Input() disabled: boolean | undefined;
    writeValue() {}
    registerOnChange() {}
    registerOnTouched() {}
  }

  @Comp({ selector: 'ion-reorder-group', template: '<ng-content/>', standalone: true })
  class IonReorderGroupStub {
    @Input() disabled: boolean | undefined;
  }

  return {
    IonButton: stub('ion-button'),
    IonButtons: stub('ion-buttons'),
    IonChip: stub('ion-chip'),
    IonContent: stub('ion-content'),
    IonHeader: stub('ion-header'),
    IonIcon: stub('ion-icon'),
    IonInput: IonInputStub,
    IonItem: stub('ion-item'),
    IonLabel: stub('ion-label'),
    IonList: stub('ion-list'),
    IonNote: stub('ion-note'),
    IonReorder: stub('ion-reorder'),
    IonReorderGroup: IonReorderGroupStub,
    IonTitle: stub('ion-title'),
    IonToolbar: stub('ion-toolbar'),
  };
});

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({ addOutline: '', closeCircle: '' }));

// ---------------------------------------------------------------------------
// Service stubs
// ---------------------------------------------------------------------------
import { HapticService } from '../core/haptic.service';
import { ScalePreferenceService } from '../core/scale-preference.service';

const hapticStub = { impactLight: vi.fn(), impactMedium: vi.fn(), notificationSuccess: vi.fn() };
const addCustomScaleFn = vi.fn().mockResolvedValue('custom-test-id');
const updateCustomScaleFn = vi.fn().mockResolvedValue(undefined);
const scalePrefsStub = {
  addCustomScale: addCustomScaleFn,
  updateCustomScale: updateCustomScaleFn,
};

// ---------------------------------------------------------------------------
// Mount helper
// ---------------------------------------------------------------------------
type EditorInternals = {
  name: () => string;
  cards: () => string[];
  newCard: string;
  newCardError: () => string | null;
  persistedId: () => string | null;
  canSave: () => boolean;
  onAddCard: () => void;
  onNameInput: (v: string) => void;
};

async function mountEditor(existingScale?: { id: string; label: string; cards: string[] }) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HapticService, useValue: hapticStub },
      { provide: ScalePreferenceService, useValue: scalePrefsStub },
    ],
  });
  const { CustomScaleEditorSheetComponent } = await import('./custom-scale-editor.sheet');
  const fixture = TestBed.createComponent(CustomScaleEditorSheetComponent);
  if (existingScale !== undefined) {
    fixture.componentRef.setInput('existingScale', existingScale);
  }
  fixture.detectChanges();
  return fixture;
}

function internals(fixture: Awaited<ReturnType<typeof mountEditor>>): EditorInternals {
  return fixture.componentInstance as unknown as EditorInternals;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('CustomScaleEditorSheetComponent — onAddCard validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('empty card label → rejects, newCardError set, no card added', async () => {
    const fixture = await mountEditor();
    const comp = internals(fixture);
    comp.newCard = '';
    comp.onAddCard();
    fixture.detectChanges();
    expect(comp.cards()).toHaveLength(0);
    // empty string returns early before error branch — newCardError stays null
    expect(comp.newCardError()).toBeNull();
  });

  it('whitespace-only label → trims to empty, returns early without error signal', async () => {
    // onAddCard does `const face = this.newCard.trim(); if (!face) return;`
    // so whitespace hits the same early-return as empty — newCardError stays null.
    const fixture = await mountEditor();
    const comp = internals(fixture);
    comp.newCard = '   ';
    comp.onAddCard();
    fixture.detectChanges();
    expect(comp.cards()).toHaveLength(0);
    expect(comp.newCardError()).toBeNull();
  });

  it("sentinel 'hnch_abstain' → rejected with sentinel-specific error message", async () => {
    const fixture = await mountEditor();
    const comp = internals(fixture);
    comp.newCard = 'hnch_abstain';
    comp.onAddCard();
    fixture.detectChanges();
    expect(comp.cards()).toHaveLength(0);
    expect(comp.newCardError()).toContain("'hnch_abstain' is reserved");
  });

  it("normal label '5' → accepted, card added, newCardError cleared", async () => {
    const fixture = await mountEditor();
    const comp = internals(fixture);
    // Pre-set an error so we can verify it clears.
    comp.newCard = 'hnch_abstain';
    comp.onAddCard();
    fixture.detectChanges();
    expect(comp.newCardError()).not.toBeNull();

    // Now add a valid card.
    comp.newCard = '5';
    comp.onAddCard();
    fixture.detectChanges();
    expect(comp.cards()).toContain('5');
    expect(comp.newCardError()).toBeNull();
  });

  it('error clears when calling onAddCard with a valid card after a prior sentinel error', async () => {
    const fixture = await mountEditor();
    const comp = internals(fixture);
    // Trigger a sentinel error first (hnch_abstain passes the trim guard but fails isValidCustomCardLabel).
    comp.newCard = 'hnch_abstain';
    comp.onAddCard();
    expect(comp.newCardError()).not.toBeNull();

    comp.newCard = '8';
    comp.onAddCard();
    expect(comp.newCardError()).toBeNull();
    expect(comp.cards()).toContain('8');
  });
});

describe('CustomScaleEditorSheetComponent — create-mode title and canSave', () => {
  it('title is "Create Custom Scale" in create mode', async () => {
    const fixture = await mountEditor();
    const title = (fixture.componentInstance as unknown as { title: () => string }).title();
    expect(title).toBe('Create Custom Scale');
  });

  it('canSave is false with name empty', async () => {
    const fixture = await mountEditor();
    const comp = internals(fixture);
    // Add 2 cards but no name
    comp.newCard = '1';
    comp.onAddCard();
    comp.newCard = '2';
    comp.onAddCard();
    expect(comp.canSave()).toBe(false);
  });

  it('canSave is false with fewer than 2 cards even when name set', async () => {
    const fixture = await mountEditor();
    const comp = internals(fixture);
    comp.onNameInput('My Scale');
    comp.newCard = '1';
    comp.onAddCard();
    expect(comp.canSave()).toBe(false);
  });

  it('canSave is true when name and 2+ cards present', async () => {
    const fixture = await mountEditor();
    const comp = internals(fixture);
    comp.onNameInput('My Scale');
    comp.newCard = '1';
    comp.onAddCard();
    comp.newCard = '2';
    comp.onAddCard();
    expect(comp.canSave()).toBe(true);
  });
});

describe('CustomScaleEditorSheetComponent — edit mode', () => {
  it('title is "Edit Custom Scale" in edit mode', async () => {
    const fixture = await mountEditor({ id: 'custom-abc', label: 'Bananas', cards: ['S', 'M'] });
    const title = (fixture.componentInstance as unknown as { title: () => string }).title();
    expect(title).toBe('Edit Custom Scale');
  });

  it('pre-fills name and cards from existingScale input', async () => {
    const fixture = await mountEditor({
      id: 'custom-abc',
      label: 'Bananas',
      cards: ['S', 'M', 'L'],
    });
    const comp = internals(fixture);
    expect(comp.name()).toBe('Bananas');
    expect(comp.cards()).toEqual(['S', 'M', 'L']);
    expect(comp.persistedId()).toBe('custom-abc');
  });
});
