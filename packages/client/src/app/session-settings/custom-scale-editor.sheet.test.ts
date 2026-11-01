/**
 * TestBed tests for CustomScaleEditorSheetComponent.
 *
 * Focuses on the abstain-sentinel validation added in ADR-0041
 * (onAddCard rejecting 'hnch_abstain') and the surrounding error/clear
 * paths. Secondary coverage: create-mode auto-save and cancel, the header's
 * one button, the card rows, the note about what is not saved, and deleting
 * a saved scale from the editor.
 */

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// What the confirmation alert was asked to show, and how it gets answered.
const alertState = vi.hoisted(() => ({
  answer: 'cancel',
  shown: [] as Array<{ header?: string; message?: string }>,
}));

const focusFieldMock = vi.hoisted(() => vi.fn<(field: unknown) => Promise<void>>());
const surface = vi.hoisted(() => ({ mode: 'mobile' as 'mobile' | 'desktop' }));

vi.mock('../core/surface.service', () => ({ SurfaceService: class SurfaceService {} }));
vi.mock('../services/toast.service', () => ({ ToastService: class ToastService {} }));
vi.mock('../utils/focus-field', () => ({ focusField: focusFieldMock }));

// Ionic component stubs — hoisted before component import.
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

  @Comp({ selector: 'ion-button', template: '<ng-content/>', standalone: true })
  class IonButtonStub {
    @Input() color: string | undefined;
    @Input() disabled: boolean | undefined;
    @Input() strong: boolean | undefined;
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
    IonButton: IonButtonStub,
    IonButtons: stub('ion-buttons'),
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

// Service stubs
import { AlertController } from '@ionic/angular/standalone';

import { HapticService } from '../core/haptic.service';
import { ScalePreferenceService } from '../core/scale-preference.service';
import { SurfaceService } from '../core/surface.service';
import { ToastService } from '../services/toast.service';

const toastStub = { error: vi.fn().mockResolvedValue(undefined), info: vi.fn() };
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
/** How many of the next deletes fail. */
const deleting = { failures: 0 };
const scalePrefsStub = {
  addCustomScale: addCustomScaleFn,
  updateCustomScale: updateCustomScaleFn,
  deleteCustomScale: async (id: string): Promise<void> => {
    if (deleting.failures > 0) {
      deleting.failures -= 1;
      throw new Error('storage is full');
    }
    deletedIds.push(id);
  },
};

// Mount helper
type EditorInternals = {
  name: () => string;
  cards: () => string[];
  newCard: string;
  newCardError: () => string | null;
  persistedId: () => string | null;
  canSave: () => boolean;
  onAddCard: () => void;
  onAddCardKey: (e: Event) => void;
  onDeleteCard: (index: number, e: Event) => void;
  onNameInput: (v: string) => void;
  onClose: () => Promise<void>;
  onDeleteScale: () => Promise<void>;
  hint: () => string | null;
};

async function mountEditor(existingScale?: { id: string; label: string; cards: string[] }) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AlertController, useValue: new AlertController() },
      { provide: HapticService, useValue: hapticStub },
      { provide: ScalePreferenceService, useValue: scalePrefsStub },
      { provide: SurfaceService, useValue: { mode: () => surface.mode } },
      { provide: ToastService, useValue: toastStub },
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

// Tests
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

describe('CustomScaleEditorSheetComponent — the button in the header', () => {
  const SAVED = { id: 'custom-1', label: 'Team sizes', cards: ['S', 'M', 'L'] };
  type Fixture = Awaited<ReturnType<typeof mountEditor>>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    addCustomScaleFn.mockResolvedValue('custom-test-id');
  });

  function closeButton(fixture: Fixture): HTMLElement {
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      'ion-toolbar ion-button',
    );
    // One button, whatever it says.
    expect(buttons).toHaveLength(1);
    return buttons[0]!;
  }

  async function createScale(fixture: Fixture): Promise<void> {
    const comp = internals(fixture);
    comp.onNameInput('Team sizes');
    for (const card of ['S', 'M']) {
      comp.newCard = card;
      comp.onAddCard();
    }
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('is Cancel until the scale exists', async () => {
    const fixture = await mountEditor();

    expect(closeButton(fixture).textContent?.trim()).toBe('Cancel');
  });

  it('is Done for a scale that exists', async () => {
    const fixture = await mountEditor(SAVED);

    expect(closeButton(fixture).textContent?.trim()).toBe('Done');
  });

  it('turns into Done with the first save', async () => {
    const fixture = await mountEditor();

    await createScale(fixture);

    expect(addCustomScaleFn).toHaveBeenCalledOnce();
    expect(closeButton(fixture).textContent?.trim()).toBe('Done');
  });

  // A button that moves is a button that is missed — and in md the title
  // moves with a button that leaves the start of the toolbar.
  it('stays where it is', async () => {
    const fixture = await mountEditor();
    const slotOf = (): string | null | undefined =>
      closeButton(fixture).closest('ion-buttons')?.getAttribute('slot');
    expect(slotOf()).toBe('end');

    await createScale(fixture);

    expect(slotOf()).toBe('end');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('ion-buttons')).toHaveLength(1);
  });

  it('closes the sheet, whatever it says', async () => {
    for (const scale of [undefined, SAVED]) {
      const fixture = await mountEditor(scale);
      const closed = vi.fn();
      fixture.componentInstance.closeRequested.subscribe(closed);

      closeButton(fixture).click();
      await fixture.whenStable();

      expect(closed).toHaveBeenCalledOnce();
    }
  });

  // The name is saved a moment after the last key. Done within that moment
  // used to drop it.
  it('saves a name that was still waiting, and closes after that', async () => {
    vi.useFakeTimers();
    try {
      const fixture = await mountEditor(SAVED);
      const comp = internals(fixture);
      const order: string[] = [];
      updateCustomScaleFn.mockImplementationOnce(async () => {
        order.push('saved');
      });
      fixture.componentInstance.closeRequested.subscribe(() => order.push('closed'));

      comp.onNameInput('Team sizes v2');
      await comp.onClose();

      expect(updateCustomScaleFn).toHaveBeenCalledExactlyOnceWith('custom-1', 'Team sizes v2', [
        'S',
        'M',
        'L',
      ]);
      expect(order).toEqual(['saved', 'closed']);

      // And not a second time, once the moment has passed.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(updateCustomScaleFn).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('saves a name that was still waiting when the sheet is swiped away', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fixture = await mountEditor(SAVED);
      const emit = vi.spyOn(fixture.componentInstance.updated, 'emit');

      internals(fixture).onNameInput('Team sizes v2');
      fixture.destroy();
      await vi.advanceTimersByTimeAsync(1_000);

      expect(updateCustomScaleFn).toHaveBeenCalledExactlyOnceWith('custom-1', 'Team sizes v2', [
        'S',
        'M',
        'L',
      ]);
      // The sheet is gone, and its outputs with it: nothing is sent through
      // them (Angular would only warn about it).
      expect(emit).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  // Storage that does not answer. The sheet closes all the same.
  it('does not wait for ever for a save that hangs', async () => {
    vi.useFakeTimers();
    try {
      const fixture = await mountEditor(SAVED);
      const closed = vi.fn();
      fixture.componentInstance.closeRequested.subscribe(closed);
      updateCustomScaleFn.mockImplementationOnce(() => new Promise<void>(() => {}));

      internals(fixture).onNameInput('Team sizes v2');
      const closing = internals(fixture).onClose();
      await vi.advanceTimersByTimeAsync(500);
      expect(closed).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(600);
      await closing;
      expect(closed).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes even when the save fails', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fixture = await mountEditor(SAVED);
      const closed = vi.fn();
      fixture.componentInstance.closeRequested.subscribe(closed);
      updateCustomScaleFn.mockRejectedValueOnce(new Error('storage is full'));

      internals(fixture).onNameInput('Team sizes v2');
      await internals(fixture).onClose();

      expect(closed).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('CustomScaleEditorSheetComponent — what is not saved', () => {
  const SAVED = { id: 'custom-1', label: 'Team sizes', cards: ['S', 'M'] };

  beforeEach(() => {
    vi.clearAllMocks();
    addCustomScaleFn.mockResolvedValue('custom-test-id');
  });

  function add(fixture: Awaited<ReturnType<typeof mountEditor>>, ...cards: string[]): void {
    for (const card of cards) {
      internals(fixture).newCard = card;
      internals(fixture).onAddCard();
    }
  }

  it('a new scale asks for its cards first', async () => {
    const fixture = await mountEditor();

    expect(internals(fixture).hint()).toBe('Add at least 2 cards to create the scale.');
  });

  it('then for the one that is missing', async () => {
    const fixture = await mountEditor();
    internals(fixture).onNameInput('Team sizes');
    add(fixture, 'S');

    expect(internals(fixture).hint()).toBe('Add one more card and the scale is saved.');
  });

  it('and for the name, when that is missing too', async () => {
    const fixture = await mountEditor();
    add(fixture, 'S');

    expect(internals(fixture).hint()).toBe('Add one more card and a name, and the scale is saved.');
  });

  // Two cards and no name: nothing was saved, and nothing said so.
  it('or for the name alone', async () => {
    const fixture = await mountEditor();
    add(fixture, 'S', 'M');

    expect(internals(fixture).hint()).toBe('Give the scale a name and it is saved.');
    expect(addCustomScaleFn).not.toHaveBeenCalled();
  });

  it('says nothing once the scale is saved', async () => {
    const fixture = await mountEditor();
    internals(fixture).onNameInput('Team sizes');
    add(fixture, 'S', 'M');
    await fixture.whenStable();

    expect(internals(fixture).hint()).toBeNull();
  });

  // Done is in the header by now. Without the note, a scale cut down to one
  // card reads as saved that way.
  it('says so when an edit leaves a scale that cannot be saved', async () => {
    const fixture = await mountEditor(SAVED);
    expect(internals(fixture).hint()).toBeNull();

    internals(fixture).onDeleteCard(1, new Event('click'));
    fixture.detectChanges();

    expect(internals(fixture).hint()).toBe('Not saved: a scale needs a name and at least 2 cards.');
    expect(updateCustomScaleFn).not.toHaveBeenCalled();
    const note = (fixture.nativeElement as HTMLElement).querySelector('.empty-hint');
    expect(note?.textContent?.trim()).toBe('Not saved: a scale needs a name and at least 2 cards.');
  });
});

// The device cannot store the scale. What is on screen is not what is saved,
// and the sheet must not read as if it were.
describe('CustomScaleEditorSheetComponent — a save that fails', () => {
  const SAVED = { id: 'custom-1', label: 'Team sizes', cards: ['S', 'M'] };
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    addCustomScaleFn.mockResolvedValue('custom-test-id');
    updateCustomScaleFn.mockResolvedValue(undefined);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  function add(fixture: Awaited<ReturnType<typeof mountEditor>>, card: string): void {
    internals(fixture).newCard = card;
    internals(fixture).onAddCard();
  }

  it('says so, under the cards and in a toast', async () => {
    const fixture = await mountEditor(SAVED);
    updateCustomScaleFn.mockRejectedValueOnce(new Error('storage is full'));

    add(fixture, 'L');

    await vi.waitFor(() =>
      expect(internals(fixture).hint()).toBe('Not saved: this device could not store the scale.'),
    );
    expect(toastStub.error).toHaveBeenCalledExactlyOnceWith("Couldn't save the scale.");
  });

  it('says it once, however many changes fail after it', async () => {
    const fixture = await mountEditor(SAVED);
    updateCustomScaleFn.mockRejectedValue(new Error('storage is full'));

    add(fixture, 'L');
    await vi.waitFor(() => expect(updateCustomScaleFn).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(toastStub.error).toHaveBeenCalledOnce());
    add(fixture, 'XL');
    await vi.waitFor(() => expect(updateCustomScaleFn).toHaveBeenCalledTimes(2));
    await fixture.whenStable();

    expect(toastStub.error).toHaveBeenCalledOnce();
    expect(internals(fixture).hint()).toBe('Not saved: this device could not store the scale.');
  });

  it('takes it back with the next change that is saved', async () => {
    const fixture = await mountEditor(SAVED);
    updateCustomScaleFn.mockRejectedValueOnce(new Error('storage is full'));
    add(fixture, 'L');
    await vi.waitFor(() =>
      expect(internals(fixture).hint()).toBe('Not saved: this device could not store the scale.'),
    );

    add(fixture, 'XL');

    await vi.waitFor(() => expect(internals(fixture).hint()).toBeNull());
    expect(updateCustomScaleFn).toHaveBeenLastCalledWith('custom-1', 'Team sizes', [
      'S',
      'M',
      'L',
      'XL',
    ]);
  });

  // A scale that could not be created does not exist: Cancel, no Delete,
  // and the next change creates it — once.
  it('leaves a new scale new', async () => {
    const fixture = await mountEditor();
    const created = vi.fn();
    fixture.componentInstance.created.subscribe(created);
    addCustomScaleFn.mockRejectedValueOnce(new Error('storage is full'));
    internals(fixture).onNameInput('Sizes');
    add(fixture, 'S');
    add(fixture, 'M');

    await vi.waitFor(() =>
      expect(internals(fixture).hint()).toBe('Not saved: this device could not store the scale.'),
    );
    expect(internals(fixture).persistedId()).toBeNull();
    expect(created).not.toHaveBeenCalled();

    add(fixture, 'L');

    await vi.waitFor(() => expect(internals(fixture).hint()).toBeNull());
    expect(addCustomScaleFn).toHaveBeenCalledTimes(2);
    expect(created).toHaveBeenCalledExactlyOnceWith('custom-test-id');
  });
});

describe('CustomScaleEditorSheetComponent — the cards', () => {
  const SAVED = { id: 'custom-1', label: 'Team sizes', cards: ['S', 'M', 'L'] };
  type Fixture = Awaited<ReturnType<typeof mountEditor>>;

  beforeEach(() => {
    vi.clearAllMocks();
    focusFieldMock.mockReset();
    focusFieldMock.mockResolvedValue(undefined);
    surface.mode = 'mobile';
  });

  function removeButtons(fixture: Fixture): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.remove-card-btn'),
    );
  }

  /**
   * Remove the card in row `index` by a tap that leaves the focus where it
   * is — as on a phone — and let the list settle.
   */
  async function remove(fixture: Fixture, index: number): Promise<void> {
    removeButtons(fixture)[index]!.click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /** The same from the keyboard: the button has the focus when it is pressed. */
  async function removeFromKeyboard(fixture: Fixture, index: number): Promise<void> {
    const button = removeButtons(fixture)[index]!;
    button.tabIndex = 0;
    HTMLElement.prototype.focus.call(button);
    expect(document.activeElement).toBe(button);
    await remove(fixture, index);
  }

  /** Which buttons are handed the focus, by the card they remove. */
  function watchFocus(fixture: Fixture): Array<string | null> {
    const focused: Array<string | null> = [];
    for (const button of removeButtons(fixture)) {
      vi.spyOn(button, 'focus').mockImplementation(() => {
        focused.push(button.getAttribute('aria-label'));
      });
    }
    return focused;
  }

  it('have a button each, named after the card it removes', async () => {
    const fixture = await mountEditor(SAVED);

    expect(removeButtons(fixture).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Remove card S',
      'Remove card M',
      'Remove card L',
    ]);
  });

  it('lose the one whose button is pressed', async () => {
    const fixture = await mountEditor(SAVED);

    await remove(fixture, 1);

    expect(internals(fixture).cards()).toEqual(['S', 'L']);
    expect(updateCustomScaleFn).toHaveBeenCalledExactlyOnceWith('custom-1', 'Team sizes', [
      'S',
      'L',
    ]);
  });

  // The rows are tracked by position: the row that goes is the last one,
  // and with it the button that had the focus.
  it('keep the focus in the list when the last one is removed', async () => {
    const fixture = await mountEditor(SAVED);
    const focused = watchFocus(fixture);

    await removeFromKeyboard(fixture, 2);

    expect(focused).toEqual(['Remove card M']);
  });

  it('keep it on the card that moved up when one in the middle is removed', async () => {
    const fixture = await mountEditor(SAVED);
    const focused = watchFocus(fixture);

    await removeFromKeyboard(fixture, 1);

    expect(focused).toEqual(['Remove card L']);
  });

  it('hand the focus to the field that adds one when none is left', async () => {
    surface.mode = 'desktop';
    const fixture = await mountEditor({ id: 'custom-1', label: 'One', cards: ['S'] });
    focusFieldMock.mockClear();

    await removeFromKeyboard(fixture, 0);

    const field = fixture.debugElement.queryAll((el) => el.name === 'ion-input')[1]!;
    expect((field.nativeElement as HTMLElement).getAttribute('label')).toBe('New card');
    // At once: the sheet has been open all along, and says nothing more
    // about opening.
    expect(focusFieldMock).toHaveBeenCalledExactlyOnceWith(field.componentInstance, {
      overlayIsOpen: true,
    });
  });

  // It would bring up the keyboard.
  it('leave the field alone on a phone', async () => {
    const fixture = await mountEditor({ id: 'custom-1', label: 'One', cards: ['S'] });
    focusFieldMock.mockClear();

    await removeFromKeyboard(fixture, 0);

    expect(focusFieldMock).not.toHaveBeenCalled();
  });

  // A tap on a phone does not give the button the focus. The field the
  // cards are typed into has it, with the keyboard up for the next card —
  // and keeps both.
  it('leave the focus where it is when the button did not have it', async () => {
    surface.mode = 'desktop';
    const fixture = await mountEditor(SAVED);
    const focused = watchFocus(fixture);
    focusFieldMock.mockClear();

    await remove(fixture, 2);
    await remove(fixture, 1);
    await remove(fixture, 0);

    expect(internals(fixture).cards()).toEqual([]);
    expect(focused).toEqual([]);
    expect(focusFieldMock).not.toHaveBeenCalled();
  });

  it('are added by Enter', async () => {
    const fixture = await mountEditor(SAVED);
    internals(fixture).newCard = 'XL';

    internals(fixture).onAddCardKey(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(internals(fixture).cards()).toEqual(['S', 'M', 'L', 'XL']);
  });

  it('are not added by the Enter that confirms a composition', async () => {
    const fixture = await mountEditor(SAVED);
    internals(fixture).newCard = '大';

    internals(fixture).onAddCardKey(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }),
    );
    internals(fixture).onAddCardKey(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229 }));

    expect(internals(fixture).cards()).toEqual(['S', 'M', 'L']);
    expect(internals(fixture).newCard).toBe('大');
  });
});

describe('CustomScaleEditorSheetComponent — where the cursor starts', () => {
  beforeEach(() => {
    focusFieldMock.mockReset();
    focusFieldMock.mockResolvedValue(undefined);
    surface.mode = 'mobile';
  });

  it('in the name of a new scale, on every surface', async () => {
    for (const mode of ['mobile', 'desktop'] as const) {
      surface.mode = mode;
      focusFieldMock.mockClear();
      const fixture = await mountEditor();
      await fixture.whenStable();

      expect(focusFieldMock).toHaveBeenCalledOnce();
      const field = fixture.debugElement.query((el) => el.name === 'ion-input');
      expect(focusFieldMock.mock.calls[0]![0]).toBe(field.componentInstance);
      expect((field.nativeElement as HTMLElement).getAttribute('label')).toBe('Scale name');
    }
  });

  it('nowhere in a scale that is opened to be changed', async () => {
    surface.mode = 'desktop';
    const fixture = await mountEditor({ id: 'custom-1', label: 'Team sizes', cards: ['S', 'M'] });
    await fixture.whenStable();

    expect(focusFieldMock).not.toHaveBeenCalled();
  });
});

describe('CustomScaleEditorSheetComponent — deleting a scale', () => {
  const SAVED = { id: 'custom-1', label: 'Team sizes', cards: ['S', 'M', 'L'] };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    deletedIds.length = 0;
    deleting.failures = 0;
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

  describe('when the delete fails', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      alertState.answer = 'destructive';
      deleting.failures = 1;
    });

    afterEach(() => {
      warn.mockRestore();
    });

    it('says so, and leaves the sheet open', async () => {
      const fixture = await mountEditor(SAVED);
      const closed = vi.fn();
      fixture.componentInstance.closeRequested.subscribe(closed);

      await internals(fixture).onDeleteScale();

      expect(toastStub.error).toHaveBeenCalledExactlyOnceWith(
        "Couldn't delete the scale. Try again.",
      );
      expect(closed).not.toHaveBeenCalled();
      expect(hapticStub.notificationWarning).not.toHaveBeenCalled();
    });

    it('can be tried again', async () => {
      const fixture = await mountEditor(SAVED);
      const closed = vi.fn();
      fixture.componentInstance.closeRequested.subscribe(closed);

      await internals(fixture).onDeleteScale();
      await internals(fixture).onDeleteScale();

      expect(alertState.shown).toHaveLength(2);
      expect(deletedIds).toEqual(['custom-1']);
      expect(closed).toHaveBeenCalledOnce();
    });

    // The scale is still there: an edit to it is an edit like any other.
    it('goes on saving what is changed', async () => {
      const fixture = await mountEditor(SAVED);

      await internals(fixture).onDeleteScale();
      internals(fixture).newCard = 'XL';
      internals(fixture).onAddCard();
      await fixture.whenStable();

      expect(updateCustomScaleFn).toHaveBeenCalledOnce();
    });
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
