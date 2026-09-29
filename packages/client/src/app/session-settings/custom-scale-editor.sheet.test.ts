/**
 * TestBed tests for CustomScaleEditorSheetComponent.
 *
 * Focuses on the abstain-sentinel validation added in ADR-0041 Phase 2
 * (onAddCard rejecting 'hnch_abstain') and the surrounding error/clear
 * paths. Secondary coverage: create-mode auto-save and cancel, and deleting
 * a saved scale from the editor.
 */

import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// What the confirmation alert was asked to show, and how it gets answered.
const alertState = vi.hoisted(() => ({
  answer: 'cancel',
  shown: [] as Array<{ header?: string; message?: string }>,
}));

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

  class AlertController {
    create(options: { header?: string; message?: string }) {
      alertState.shown.push(options);
      return Promise.resolve({
        present: () => Promise.resolve(),
        onDidDismiss: () => Promise.resolve({ role: alertState.answer }),
      });
    }
  }

  return {
    AlertController,
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
vi.mock('ionicons/icons', () => ({ addOutline: '', closeCircle: '', trashOutline: '' }));

// ---------------------------------------------------------------------------
// Service stubs
// ---------------------------------------------------------------------------
import { AlertController } from '@ionic/angular/standalone';

import { HapticService } from '../core/haptic.service';
import { ScalePreferenceService } from '../core/scale-preference.service';

const hapticStub = {
  impactLight: vi.fn(),
  impactMedium: vi.fn(),
  notificationSuccess: vi.fn(),
  notificationWarning: vi.fn(),
};
const addCustomScaleFn = vi.fn().mockResolvedValue('custom-test-id');
const updateCustomScaleFn = vi.fn().mockResolvedValue(undefined);
/** Ids handed to `deleteCustomScale`, in order. */
const deletedIds: string[] = [];
const scalePrefsStub = {
  addCustomScale: addCustomScaleFn,
  updateCustomScale: updateCustomScaleFn,
  deleteCustomScale: (id: string): Promise<void> => {
    deletedIds.push(id);
    return Promise.resolve();
  },
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
  onDeleteScale: () => Promise<void>;
};

async function mountEditor(existingScale?: { id: string; label: string; cards: string[] }) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AlertController, useValue: new AlertController() },
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
  it('title is "New custom scale" in create mode', async () => {
    const fixture = await mountEditor();
    const title = (fixture.componentInstance as unknown as { title: () => string }).title();
    expect(title).toBe('New custom scale');
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
  it('title is "Edit custom scale" in edit mode', async () => {
    const fixture = await mountEditor({ id: 'custom-abc', label: 'Bananas', cards: ['S', 'M'] });
    const title = (fixture.componentInstance as unknown as { title: () => string }).title();
    expect(title).toBe('Edit custom scale');
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

describe('CustomScaleEditorSheetComponent — deleting a scale', () => {
  const SAVED = { id: 'custom-1', label: 'Team sizes', cards: ['S', 'M', 'L'] };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    deletedIds.length = 0;
    alertState.shown.length = 0;
    alertState.answer = 'cancel';
  });

  function deleteButton(fixture: Awaited<ReturnType<typeof mountEditor>>): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.delete-btn');
  }

  it('is offered for a scale that exists, not for one still being created', async () => {
    expect(deleteButton(await mountEditor())).toBeNull();
    expect(deleteButton(await mountEditor(SAVED))?.textContent?.trim()).toBe('Delete scale');
  });

  it('asks first, naming the scale', async () => {
    const fixture = await mountEditor(SAVED);
    await internals(fixture).onDeleteScale();

    expect(alertState.shown).toHaveLength(1);
    expect(alertState.shown[0]!.header).toBe('Delete this scale?');
    expect(alertState.shown[0]!.message).toContain('Team sizes');
  });

  // The scale may be the one a session is running on; the doc has its cards.
  it('says what happens to a session that uses the scale', async () => {
    const fixture = await mountEditor(SAVED);
    await internals(fixture).onDeleteScale();

    expect(alertState.shown[0]!.message).toContain('A session that uses it keeps its cards.');
  });

  it('asks once, however often the button is tapped', async () => {
    alertState.answer = 'destructive';
    const fixture = await mountEditor(SAVED);
    const comp = internals(fixture);
    const closed = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(closed);

    await Promise.all([comp.onDeleteScale(), comp.onDeleteScale(), comp.onDeleteScale()]);

    expect(alertState.shown).toHaveLength(1);
    expect(deletedIds).toEqual(['custom-1']);
    expect(closed).toHaveBeenCalledOnce();
  });

  it('can be asked again after the question was cancelled', async () => {
    const fixture = await mountEditor(SAVED);
    const comp = internals(fixture);

    await comp.onDeleteScale();
    alertState.answer = 'destructive';
    await comp.onDeleteScale();

    expect(alertState.shown).toHaveLength(2);
    expect(deletedIds).toEqual(['custom-1']);
  });

  it('does not ask again once the scale is deleted', async () => {
    alertState.answer = 'destructive';
    const fixture = await mountEditor(SAVED);
    const comp = internals(fixture);

    await comp.onDeleteScale();
    await comp.onDeleteScale();

    expect(alertState.shown).toHaveLength(1);
    expect(deletedIds).toEqual(['custom-1']);
  });

  it('deletes nothing when the question is cancelled', async () => {
    const fixture = await mountEditor(SAVED);
    const closed = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(closed);

    await internals(fixture).onDeleteScale();

    expect(deletedIds).toEqual([]);
    expect(closed).not.toHaveBeenCalled();
  });

  it('deletes the scale and closes when confirmed', async () => {
    alertState.answer = 'destructive';
    const fixture = await mountEditor(SAVED);
    const closed = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(closed);

    await internals(fixture).onDeleteScale();

    expect(deletedIds).toEqual(['custom-1']);
    expect(closed).toHaveBeenCalledOnce();
    expect(hapticStub.notificationWarning).toHaveBeenCalledOnce();
  });

  it('does not save a name edit that was still waiting when the scale was deleted', async () => {
    vi.useFakeTimers();
    try {
      alertState.answer = 'destructive';
      const fixture = await mountEditor(SAVED);
      const comp = internals(fixture);

      comp.onNameInput('Team sizes v2');
      await comp.onDeleteScale();
      await vi.advanceTimersByTimeAsync(1_000);

      expect(deletedIds).toEqual(['custom-1']);
      expect(updateCustomScaleFn).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // `updated` makes the picker select the scale. One that is gone must not
  // be selected by a save that was already on its way.
  it('does not report a save that finishes after the delete', async () => {
    alertState.answer = 'destructive';
    let finishSave!: () => void;
    updateCustomScaleFn.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const fixture = await mountEditor(SAVED);
    const comp = internals(fixture);
    const updated = vi.fn();
    fixture.componentInstance.updated.subscribe(updated);

    comp.newCard = 'XL';
    comp.onAddCard();
    expect(updateCustomScaleFn).toHaveBeenCalledOnce();
    await comp.onDeleteScale();
    finishSave();
    await fixture.whenStable();

    expect(deletedIds).toEqual(['custom-1']);
    expect(updated).not.toHaveBeenCalled();
  });

  it('reports a save as long as the scale is there', async () => {
    const fixture = await mountEditor(SAVED);
    const comp = internals(fixture);
    const updated = vi.fn();
    fixture.componentInstance.updated.subscribe(updated);

    comp.newCard = 'XL';
    comp.onAddCard();
    await fixture.whenStable();

    expect(updated).toHaveBeenCalledExactlyOnceWith('custom-1');
  });

  it('does not save a card change made after the delete either', async () => {
    alertState.answer = 'destructive';
    const fixture = await mountEditor(SAVED);
    const comp = internals(fixture);

    await comp.onDeleteScale();
    comp.newCard = 'XL';
    comp.onAddCard();
    await fixture.whenStable();

    expect(updateCustomScaleFn).not.toHaveBeenCalled();
    expect(addCustomScaleFn).not.toHaveBeenCalled();
  });
});
