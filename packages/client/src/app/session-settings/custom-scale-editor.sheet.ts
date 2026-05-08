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
import { type CustomScale } from '@hnch/shared';
import {
  IonButton,
  IonButtons,
  IonChip,
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
import { addOutline, closeCircle } from 'ionicons/icons';

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
 * Validation: name required, at least 2 cards required.
 * UX: chip-based card list; `ion-reorder-group` for ordering; X on each
 * chip to remove. Add card via text input + Add button or Enter key.
 */
@Component({
  selector: 'app-custom-scale-editor-sheet',
  host: { class: 'ion-page' },
  imports: [
    FormsModule,
    IonButton,
    IonButtons,
    IonChip,
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
        <ion-buttons slot="start">
          <ion-button (click)="closeRequested.emit()">
            {{ persistedId() ? 'Done' : 'Cancel' }}
          </ion-button>
        </ion-buttons>
        <ion-title>{{ title() }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-top">

      <!-- Scale name -->
      <ion-list lines="inset">
        <ion-item>
          <ion-input
            label="Scale name"
            labelPlacement="stacked"
            placeholder="e.g. Team Sizes"
            maxlength="40"
            autocapitalize="words"
            [ngModel]="name()"
            (ionInput)="onNameInput($any($event.detail.value) ?? '')"
            aria-label="Scale name"
          ></ion-input>
        </ion-item>
      </ion-list>

      <!-- Add card input -->
      <ion-list lines="inset" class="add-row">
        <ion-item>
          <ion-input
            label="Add card"
            labelPlacement="stacked"
            placeholder="e.g. XS"
            maxlength="12"
            autocapitalize="characters"
            [(ngModel)]="newCard"
            (ionInput)="newCard = $any($event.detail.value) ?? ''"
            (keydown.enter)="onAddCard()"
            aria-label="New card face value"
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

      <!-- Chip list with reorder -->
      @if (cards().length > 0) {
        <ion-list lines="none" class="card-list">
          <ion-reorder-group
            [disabled]="false"
            (ionItemReorder)="onReorder($event)"
          >
            @for (card of cards(); track $index; let i = $index) {
              <ion-item>
                <ion-chip
                  [attr.aria-label]="card + ', tap X to remove'"
                >
                  <ion-label>{{ card }}</ion-label>
                  <ion-icon
                    name="close-circle"
                    (click)="onDeleteCard(i, $event)"
                    [attr.aria-label]="'Remove card ' + card"
                    role="button"
                    tabindex="0"
                    (keydown.enter)="onDeleteCard(i, $event)"
                    (keydown.space)="onDeleteCard(i, $event)"
                  ></ion-icon>
                </ion-chip>
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
        <ion-note class="empty-hint ion-padding-horizontal" aria-live="polite">
          Add at least 2 cards to create the scale.
        </ion-note>
      } @else if (cards().length === 1) {
        <ion-note class="empty-hint ion-padding-horizontal" aria-live="polite">
          Add one more card to enable saving.
        </ion-note>
      }

    </ion-content>
  `,
  styles: [
    `
      .add-row {
        margin-top: 1rem;
      }
      .card-list {
        margin-top: 0.5rem;
      }
      .empty-hint {
        display: block;
        margin-top: 0.75rem;
        font-size: 0.8rem;
        color: var(--ion-color-medium);
      }
      ion-chip {
        --background: var(--ion-color-primary-tint);
        --color: var(--ion-color-primary-contrast);
      }
    `,
  ],
})
export class CustomScaleEditorSheetComponent implements OnInit, OnDestroy {
  private readonly scalePrefs = inject(ScalePreferenceService);
  private readonly haptics = inject(HapticService);

  private nameDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  private savingInProgress = false;
  private saveNeeded = false;

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
    this.isEditMode() ? 'Edit Custom Scale' : 'Create Custom Scale',
  );

  protected readonly canSave = computed(
    () => this.name().trim().length > 0 && this.cards().length >= 2,
  );

  constructor() {
    addIcons({ 'add-outline': addOutline, 'close-circle': closeCircle });
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

  private async autoSave(): Promise<void> {
    if (!this.canSave()) return;
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
        this.updated.emit(currentId);
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
