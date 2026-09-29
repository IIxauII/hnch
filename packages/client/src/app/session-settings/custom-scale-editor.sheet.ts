import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
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
 *
 * A scale that has been saved can be deleted from here, behind a
 * confirmation — the one place a custom scale is deleted.
 *
 * Validation: name required, at least 2 cards required.
 * UX: one row per card, with a button to remove it and a handle to move it
 * (`ion-reorder-group`). Add a card via text input + Add button or Enter key.
 *
 * The header has one button. Until the scale exists it is Cancel, on the
 * left; once it has been saved there is nothing left to cancel, and it is
 * Done, on the right — where every other sheet has its Done.
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
        @if (!persistedId()) {
          <ion-buttons slot="start">
            <ion-button (click)="closeRequested.emit()">Cancel</ion-button>
          </ion-buttons>
        }
        <ion-title>{{ title() }}</ion-title>
        @if (persistedId()) {
          <ion-buttons slot="end">
            <ion-button strong="true" color="primary" (click)="closeRequested.emit()">
              Done
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">

      <!-- Scale name, and the field that adds a card to it -->
      <ion-list inset="true" lines="inset">
        <ion-item>
          <ion-input
            label="Scale name"
            labelPlacement="stacked"
            placeholder="e.g. Team Sizes"
            maxlength="40"
            autocapitalize="words"
            [ngModel]="name()"
            (ionInput)="onNameInput($any($event.detail.value) ?? '')"
          ></ion-input>
        </ion-item>
        <ion-item class="add-row">
          <ion-input
            label="Add card"
            labelPlacement="stacked"
            placeholder="e.g. XS"
            maxlength="12"
            autocapitalize="characters"
            enterkeyhint="done"
            [(ngModel)]="newCard"
            (ionInput)="newCard = $any($event.detail.value) ?? ''; newCardError.set(null)"
            (keydown.enter)="onAddCard()"
          ></ion-input>
          <ion-button
            slot="end"
            fill="clear"
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

      @if (cards().length === 0) {
        <ion-note class="empty-hint" aria-live="polite">
          Add at least 2 cards to create the scale.
        </ion-note>
      } @else if (cards().length === 1) {
        <ion-note class="empty-hint" aria-live="polite">
          Add one more card and the scale is saved.
        </ion-note>
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
      /* Two classes on the list: Ionic's own rule for an inset list has two. */
      ion-list.list-inset.card-list {
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
      .remove-card-btn {
        min-width: 44px;
        min-height: 44px;
        margin: 0;
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

  private nameDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  private savingInProgress = false;
  private saveNeeded = false;
  /** Set once the scale is deleted: nothing may save it back. */
  private deleted = false;
  /** True while the delete confirmation is up — a second tap must not stack another. */
  private confirmingDelete = false;

  /**
   * If provided, the sheet opens in edit mode: pre-fills name and cards,
   * and calls `updateCustomScale()` on save.
   */
  readonly existingScale = input<CustomScale | undefined>();

  /** Emits the id of the newly-created scale (create mode). */
  readonly created = output<string>();

  /** Emits the id of the updated scale (edit mode). */
  readonly updated = output<string>();

  /** Emits when the sheet should close (Cancel or after Save). */
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

  /** Error message for the card-label input, or null when input is valid/empty. */
  protected readonly newCardError = signal<string | null>(null);

  constructor() {
    addIcons({
      'add-outline': addOutline,
      'close-circle': closeCircle,
      'trash-outline': trashOutline,
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
    if (this.nameDebounceHandle !== null) {
      clearTimeout(this.nameDebounceHandle);
    }
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
    this.haptics.impactLight();
    this.cards.update((prev) => prev.filter((_, i) => i !== index));
    void this.autoSave();
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

    // A name edit still waiting out its debounce must not save after this.
    this.deleted = true;
    if (this.nameDebounceHandle !== null) {
      clearTimeout(this.nameDebounceHandle);
      this.nameDebounceHandle = null;
    }
    this.haptics.notificationWarning();
    await this.scalePrefs.deleteCustomScale(id);
    this.closeRequested.emit();
  }

  private async autoSave(): Promise<void> {
    if (this.deleted || !this.canSave()) return;
    if (this.savingInProgress) {
      this.saveNeeded = true;
      return;
    }

    this.savingInProgress = true;
    try {
      const label = this.name().trim();
      const cards = this.cards();
      const currentId = this.persistedId();

      if (currentId === null) {
        const id = await this.scalePrefs.addCustomScale(label, cards);
        this.persistedId.set(id);
        this.created.emit(id);
      } else {
        await this.scalePrefs.updateCustomScale(currentId, label, cards);
        // Deleted while this save was under way: there is nothing to pick.
        if (!this.deleted) this.updated.emit(currentId);
      }
    } finally {
      this.savingInProgress = false;
    }

    if (this.saveNeeded) {
      this.saveNeeded = false;
      void this.autoSave();
    }
  }
}
