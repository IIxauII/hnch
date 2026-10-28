import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isValidCustomCardLabel, type CustomScale } from '@hnch/shared';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonReorder,
  IonReorderGroup,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, closeCircle, trashOutline } from 'ionicons/icons';

import { HapticService } from '../core/haptic.service';
import { ScalePreferenceService } from '../core/scale-preference.service';
import { SurfaceService } from '../core/surface.service';
import { ToastService } from '../services/toast.service';
import { isComposingKey } from '../utils/composing-key';
import { focusField } from '../utils/focus-field';

/**
 * Custom scale creator / editor half-sheet.
 *
 * Create mode (no `existingScale`): builds a new scale, calls
 * `addCustomScale()`, emits `created` with the new id.
 *
 * Edit mode (`existingScale` provided): pre-fills name and cards, calls
 * `updateCustomScale()`, emits `updated` with the same id.
 *
 * Auto-saves on every card mutation and after a 250ms debounce on name
 * changes. In create mode, first save mints the id and emits `created`.
 * Closing the sheet saves a name that was still waiting.
 *
 * A scale that has been saved can be deleted from here, behind a
 * confirmation — the one place a custom scale is deleted.
 *
 * Validation: name required, at least 2 cards required. What is on screen
 * is only saved while it is both, and the note under the cards says so
 * when it is not.
 * UX: one row per card, with a button to remove it and a handle to move it
 * (`ion-reorder-group`). Add a card via text input + Add button or Enter key.
 *
 * The header has one button, and it stays where it is: Cancel until the
 * scale exists, Done once it has been saved and there is nothing left to
 * cancel. Both close the sheet.
 */
@Component({
  selector: 'app-custom-scale-editor-sheet',
  host: { class: 'ion-page' },
  imports: [
    FormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonReorder,
    IonReorderGroup,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            [strong]="exists()"
            [color]="exists() ? 'primary' : undefined"
            (click)="onClose()"
          >{{ exists() ? 'Done' : 'Cancel' }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">

      <!-- Scale name, and the field that adds a card to it -->
      <ion-list inset="true" lines="inset">
        <ion-item>
          <ion-input
            #nameField
            label="Scale name"
            labelPlacement="stacked"
            placeholder="e.g. Team Sizes"
            maxlength="40"
            autocapitalize="words"
            [ngModel]="name()"
            (ionInput)="onNameInput($any($event.detail.value) ?? '')"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            #addCardField
            label="New card"
            labelPlacement="stacked"
            placeholder="e.g. XS"
            maxlength="12"
            autocapitalize="characters"
            enterkeyhint="enter"
            [(ngModel)]="newCard"
            (ionInput)="newCard = $any($event.detail.value) ?? ''; newCardError.set(null)"
            (keydown.enter)="onAddCardKey($event)"
          ></ion-input>
          <ion-button
            slot="end"
            fill="clear"
            class="add-card-btn"
            [disabled]="!newCard.trim()"
            (click)="onAddCard()"
            aria-label="Add card"
          >
            <ion-icon slot="icon-only" name="add-outline" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-item>
      </ion-list>

      @if (newCardError()) {
        <ion-note class="card-error" color="danger" aria-live="assertive">
          {{ newCardError() }}
        </ion-note>
      }

      <!-- The cards, in order: remove one, or drag it somewhere else -->
      @if (cards().length > 0) {
        <ion-list inset="true" lines="inset" class="card-list" aria-label="Cards">
          <ion-reorder-group
            [disabled]="false"
            (ionItemReorder)="onReorder($event)"
          >
            @for (card of cards(); track $index; let i = $index) {
              <ion-item>
                <ion-label class="card-face">{{ card }}</ion-label>
                <ion-button
                  #removeButton
                  slot="end"
                  fill="clear"
                  color="medium"
                  class="remove-card-btn"
                  [attr.aria-label]="'Remove card ' + card"
                  (click)="onDeleteCard(i, $event)"
                >
                  <ion-icon slot="icon-only" name="close-circle" aria-hidden="true"></ion-icon>
                </ion-button>
                <ion-reorder
                  slot="end"
                  [attr.aria-label]="'Reorder card ' + card"
                ></ion-reorder>
              </ion-item>
            }
          </ion-reorder-group>
        </ion-list>
      }

      @if (hint(); as text) {
        <ion-note class="empty-hint" aria-live="polite">{{ text }}</ion-note>
      }

      @if (persistedId()) {
        <ion-button
          class="delete-btn"
          expand="block"
          fill="clear"
          color="danger"
          (click)="onDeleteScale()"
        >
          <ion-icon slot="start" name="trash-outline" aria-hidden="true"></ion-icon>
          Delete scale
        </ion-button>
      }

    </ion-content>
  `,
  styles: [
    `
      /* Ionic takes the top margin off an inset list that follows another
         (.list-ios.list-inset + ion-list.list-inset). ':host' is what puts
         this rule ahead of it, whichever of the two is loaded last. */
      :host ion-list.list-inset.card-list {
        margin-block-start: 12px;
      }
      .card-error,
      .empty-hint {
        display: block;
        padding: 8px 16px 0;
        font-size: 13px;
        line-height: 1.4;
      }
      .card-face {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }
      .remove-card-btn,
      .add-card-btn {
        min-width: 44px;
        min-height: 44px;
        margin: 0;
      }
      .remove-card-btn {
        font-size: 1rem;
      }
      .delete-btn {
        min-height: 44px;
        margin: 24px 0 0;
      }
    `,
  ],
})
export class CustomScaleEditorSheetComponent implements OnInit, OnDestroy {
  private readonly scalePrefs = inject(ScalePreferenceService);
  private readonly haptics = inject(HapticService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toasts = inject(ToastService);
  private readonly surface = inject(SurfaceService);
  private readonly injector = inject(Injector);

  private readonly nameField = viewChild<IonInput>('nameField');
  private readonly addCardField = viewChild<IonInput>('addCardField');
  private readonly removeButtons = viewChildren<unknown, ElementRef<HTMLElement>>('removeButton', {
    read: ElementRef,
  });

  private nameDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  /** The saves that are under way, until the last of them is done. */
  private saving: Promise<void> | null = null;
  private saveNeeded = false;
  /** Set once the scale is deleted: nothing may save it back. */
  private deleted = false;
  /** True while the delete confirmation is up — a second tap must not stack another. */
  private confirmingDelete = false;
  /** The sheet is gone, and with it everyone a save could be reported to. */
  private destroyed = false;

  /**
   * If provided, the sheet opens in edit mode: pre-fills name and cards,
   * and calls `updateCustomScale()` on save.
   */
  readonly existingScale = input<CustomScale | undefined>();

  /** Emits the id of the newly-created scale (create mode). */
  readonly created = output<string>();

  /** Emits the id of the updated scale (edit mode). */
  readonly updated = output<string>();

  /** Emits when the sheet should close: Cancel, Done, or the scale was deleted. */
  readonly closeRequested = output<void>();

  protected readonly name = signal('');
  protected newCard = '';
  protected readonly cards = signal<string[]>([]);

  /** Null in create mode until first auto-save mints the id. */
  protected readonly persistedId = signal<string | null>(null);

  protected readonly isEditMode = computed(() => !!this.existingScale());

  protected readonly title = computed(() =>
    this.isEditMode() ? 'Edit custom scale' : 'New custom scale',
  );

  protected readonly canSave = computed(
    () => this.name().trim().length > 0 && this.cards().length >= 2,
  );

  /** True once the scale is on this device: from here on, edits change it. */
  protected readonly exists = computed(() => this.persistedId() !== null);

  /**
   * What is still missing, or `null` when what is on screen is what is
   * saved. For a scale that exists already the note is about the edit: the
   * scale stays as it was last saved.
   */
  protected readonly hint = computed<string | null>(() => {
    if (this.canSave()) {
      return this.saveFailed() ? 'Not saved: this device could not store the scale.' : null;
    }
    if (this.exists()) return 'Not saved: a scale needs a name and at least 2 cards.';
    const named = this.name().trim().length > 0;
    switch (this.cards().length) {
      case 0:
        return 'Add at least 2 cards to create the scale.';
      case 1:
        return named
          ? 'Add one more card and the scale is saved.'
          : 'Add one more card and a name, and the scale is saved.';
      default:
        return 'Give the scale a name and it is saved.';
    }
  });

  /** Error message for the card-label input, or null when input is valid/empty. */
  protected readonly newCardError = signal<string | null>(null);

  /** The last save did not reach the device. The next change tries again. */
  protected readonly saveFailed = signal(false);

  constructor() {
    addIcons({
      'add-outline': addOutline,
      'close-circle': closeCircle,
      'trash-outline': trashOutline,
    });

    // A new scale starts with its name, and there is no getting around
    // typing it. One that exists is opened to change any part of it.
    afterNextRender(() => {
      if (!this.isEditMode()) void focusField(this.nameField());
    });
  }

  ngOnInit(): void {
    const existing = this.existingScale();
    if (existing) {
      this.name.set(existing.label);
      this.cards.set([...existing.cards]);
      this.persistedId.set(existing.id);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    // Swiped away, or closed by a tap next to it, with a name still waiting.
    // The name is saved; whoever opened the sheet is past being told, so a
    // session that uses the scale gets the name with its next change.
    void this.saveNameNow();
  }

  /**
   * Cancel and Done: close, once what was typed last is saved — but not
   * later than a moment from now. A sheet that does not close is worse than
   * a name that is saved a little after it has.
   */
  protected async onClose(): Promise<void> {
    await Promise.race([
      this.saveNameNow(),
      new Promise<void>((resolve) => setTimeout(resolve, CLOSE_WAIT_MS)),
    ]);
    if (!this.destroyed) this.closeRequested.emit();
  }

  /** Save a name edit that is still waiting out its debounce. */
  private async saveNameNow(): Promise<void> {
    if (this.nameDebounceHandle === null) return;
    clearTimeout(this.nameDebounceHandle);
    this.nameDebounceHandle = null;
    await this.autoSave();
  }

  protected onNameInput(value: string): void {
    this.name.set(value);
    if (this.nameDebounceHandle !== null) {
      clearTimeout(this.nameDebounceHandle);
    }
    this.nameDebounceHandle = setTimeout(() => {
      this.nameDebounceHandle = null;
      void this.autoSave();
    }, 250);
  }

  /** Enter adds the card — unless it is the Enter that confirms an IME composition. */
  protected onAddCardKey(event: Event): void {
    if (isComposingKey(event)) return;
    this.onAddCard();
  }

  protected onAddCard(): void {
    const face = this.newCard.trim();
    if (!face) return;
    if (!isValidCustomCardLabel(face)) {
      this.newCardError.set(
        face === 'hnch_abstain'
          ? "'hnch_abstain' is reserved and cannot be used as a card label."
          : 'Card label must not be empty or whitespace.',
      );
      return;
    }
    this.newCardError.set(null);
    this.haptics.impactLight();
    this.cards.update((prev) => [...prev, face]);
    this.newCard = '';
    void this.autoSave();
  }

  protected onDeleteCard(index: number, event: Event): void {
    event.stopPropagation();
    // Asked before the row is gone: whether the button had the focus. One
    // that is tapped on a phone has not — the field the card was typed into
    // has, and keeps it, with the keyboard that is up for the next card.
    const hadFocus = event.currentTarget !== null && event.currentTarget === document.activeElement;
    this.haptics.impactLight();
    this.cards.update((prev) => prev.filter((_, i) => i !== index));
    void this.autoSave();
    if (hadFocus) this.focusAfterRemoving(index);
  }

  /**
   * Keep the focus in the list. The rows are tracked by position, so it is
   * the last row that goes when a card is removed, and the button in it may
   * be the one that was pressed: focus would drop to the page, and a
   * keyboard user would start over from the top.
   *
   * With no card left the next thing to do is to add one. Only where that
   * does not bring up a keyboard nobody asked for.
   */
  private focusAfterRemoving(index: number): void {
    afterNextRender(
      () => {
        const buttons = this.removeButtons();
        const next = buttons[Math.min(index, buttons.length - 1)];
        if (next !== undefined) {
          focusButton(next.nativeElement);
        } else if (this.surface.mode() === 'desktop') {
          void focusField(this.addCardField(), { overlayIsOpen: true });
        }
      },
      { injector: this.injector },
    );
  }

  protected onReorder(
    event: CustomEvent<{
      from: number;
      to: number;
      complete: (data?: boolean | unknown[]) => unknown;
    }>,
  ): void {
    const { from, to, complete } = event.detail;
    this.cards.update((prev) => {
      const reordered = [...prev];
      const moved = reordered.splice(from, 1)[0]!;
      reordered.splice(to, 0, moved);
      return reordered;
    });
    complete(false);
    void this.autoSave();
  }

  /** Ask first, then delete the scale from this device and close. */
  protected async onDeleteScale(): Promise<void> {
    const id = this.persistedId();
    if (id === null || this.deleted || this.confirmingDelete) return;

    this.confirmingDelete = true;
    let role: string | undefined;
    try {
      const alert = await this.alertCtrl.create({
        header: 'Delete this scale?',
        message: `"${this.name().trim()}" is removed from this device. A session that uses it keeps its cards.`,
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'Delete', role: 'destructive' },
        ],
      });
      await alert.present();
      ({ role } = await alert.onDidDismiss());
    } finally {
      this.confirmingDelete = false;
    }
    if (role !== 'destructive') return;

    // Nothing may save the scale back from here on: not a name edit still
    // waiting out its debounce, not a card that is removed meanwhile.
    this.deleted = true;
    if (this.nameDebounceHandle !== null) {
      clearTimeout(this.nameDebounceHandle);
      this.nameDebounceHandle = null;
    }
    try {
      await this.scalePrefs.deleteCustomScale(id);
    } catch (err) {
      // Still there, and still to be edited — or deleted, at another try.
      console.warn('Failed to delete the custom scale:', err);
      this.deleted = false;
      void this.toasts.error("Couldn't delete the scale. Try again.");
      return;
    }
    this.haptics.notificationWarning();
    if (!this.destroyed) this.closeRequested.emit();
  }

  /**
   * Save what is on screen, if it can be saved. One save at a time: a change
   * made while one is under way is saved right after it, and the promise is
   * for the last of them. It does not reject — a save that failed leaves the
   * scale as it was, and the next change tries again.
   */
  private autoSave(): Promise<void> {
    this.saveNeeded = true;
    this.saving ??= this.saveUntilSettled();
    return this.saving;
  }

  private async saveUntilSettled(): Promise<void> {
    try {
      while (this.saveNeeded) {
        this.saveNeeded = false;
        try {
          await this.save();
          this.saveFailed.set(false);
        } catch (err) {
          console.warn('Failed to save the custom scale:', err);
          // Said once, not with every key that is pressed from here on. The
          // note under the cards stays for as long as it is so.
          if (!this.saveFailed()) void this.toasts.error("Couldn't save the scale.");
          this.saveFailed.set(true);
        }
      }
    } finally {
      // In the same breath as the last look at `saveNeeded`: a change made
      // after it starts over, none is left behind.
      this.saving = null;
    }
  }

  private async save(): Promise<void> {
    if (this.deleted || !this.canSave()) return;

    const label = this.name().trim();
    const cards = this.cards();
    const currentId = this.persistedId();

    if (currentId === null) {
      const id = await this.scalePrefs.addCustomScale(label, cards);
      this.persistedId.set(id);
      if (!this.destroyed) this.created.emit(id);
    } else {
      await this.scalePrefs.updateCustomScale(currentId, label, cards);
      // Deleted while this save was under way: there is nothing to pick.
      if (!this.deleted && !this.destroyed) this.updated.emit(currentId);
    }
  }
}

/** How long Cancel and Done wait for a name that is being saved. */
const CLOSE_WAIT_MS = 1_000;

/** `ion-button` keeps the button that takes the focus in its shadow tree. */
function focusButton(host: HTMLElement): void {
  (host.shadowRoot?.querySelector<HTMLElement>('button, a') ?? host).focus();
}
