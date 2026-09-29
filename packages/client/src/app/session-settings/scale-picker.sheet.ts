import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { BUILTIN_SCALES, getScaleLabel, type Scale } from '@hnch/shared';
import { type CustomScale } from '@hnch/shared';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonRadio,
  IonRadioGroup,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, createOutline } from 'ionicons/icons';

import { ScalePreferenceService } from '../core/scale-preference.service';
import { SurfaceService } from '../core/surface.service';
import { CustomScaleEditorSheetComponent } from './custom-scale-editor.sheet';
import { ScaleEditorSheetComponent } from './scale-editor.sheet';
import { previewBuiltinCards, previewCards } from './scale-picker.helpers';

/**
 * Unified scale picker and management component — ux.md §5.8 & §5.7.
 *
 * Can be used in two modes:
 * 1. **Picker mode** (with selectedScaleId + scaleSelected output): radio group over all
 *    available scales, emits when user selects. Parent uses this for session creation,
 *    picking a session's scale, or device default scale preference.
 * 2. **Management mode** (no selectedScaleId): show presets and custom scales with editing
 *    capabilities, used from Settings → Scales.
 *
 * In both modes:
 * - Builtin preset rows carry a card-toggle edit button (ScaleEditorSheetComponent)
 * - Custom rows carry an edit button; the editor is also where a custom scale
 *   is deleted (CustomScaleEditorSheetComponent)
 * - "Create/Add custom scale" row at bottom opens the editor in create mode
 * - Selection or updates commit immediately (no Save button)
 */
@Component({
  selector: 'app-scale-picker-sheet',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonNote,
    IonRadio,
    IonRadioGroup,
    IonTitle,
    IonToolbar,
    CustomScaleEditorSheetComponent,
    ScaleEditorSheetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ showPickerMode() ? 'Scale' : 'Scales' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button strong="true" color="primary" (click)="closeRequested.emit()">
            Done
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (showPickerMode()) {
        <!-- Picker mode: radio group -->
        <ion-list inset="true" lines="inset">
          <ion-radio-group
            aria-label="Estimation scale"
            [value]="selectedScaleId()"
            (ionChange)="onChange($event.detail.value)"
          >
            @for (scale of availableScales(); track scale.id) {
              <ion-item>
                <ion-radio
                  [value]="scale.id"
                  justify="space-between"
                  [attr.aria-label]="formatId(scale.id) + ' — ' + preview(scale)"
                >
                  <ion-label>
                    <h3>{{ formatId(scale.id) }}</h3>
                    <ion-note>{{ preview(scale) }}</ion-note>
                  </ion-label>
                </ion-radio>
                <ion-button
                  fill="clear"
                  slot="end"
                  size="small"
                  [attr.aria-label]="'Edit ' + formatId(scale.id)"
                  (click)="openEdit(scale, $event)"
                >
                  <ion-icon slot="icon-only" name="create-outline" aria-hidden="true"></ion-icon>
                </ion-button>
              </ion-item>
            } @empty {
              <ion-item>
                <ion-label color="medium">No scales available</ion-label>
              </ion-item>
            }
          </ion-radio-group>

          <!-- Create custom scale row -->
          <ion-item button (click)="openCustomEditor()" aria-label="Create custom scale">
            <ion-icon slot="start" name="add-outline" aria-hidden="true"></ion-icon>
            <ion-label>Create custom scale</ion-label>
          </ion-item>
        </ion-list>
      } @else {
        <!-- Management mode: presets section -->
        <h2 class="section-label">Presets</h2>
        <ion-list inset="true" lines="inset">
          @for (scale of presetScales; track scale.id) {
            <ion-item>
              <ion-label>
                <h3>{{ formatId(scale.id) }}</h3>
                <ion-note>{{ previewBuiltin(scale.id) }}</ion-note>
              </ion-label>
              <ion-button
                fill="clear"
                slot="end"
                size="small"
                [attr.aria-label]="'Edit ' + formatId(scale.id) + ' cards'"
                (click)="openPresetEditor(scale.id)"
              >
                <ion-icon slot="icon-only" name="create-outline" aria-hidden="true"></ion-icon>
              </ion-button>
            </ion-item>
          }
        </ion-list>

        <!-- Management mode: custom section -->
        <h2 class="section-label">Custom</h2>
        <ion-list inset="true" lines="inset">
          @for (scale of scalePrefs.customScales(); track scale.id) {
            <ion-item>
              <ion-label>
                <h3>{{ scale.label }}</h3>
                <ion-note>{{ previewCards(scale.cards) }}</ion-note>
              </ion-label>
              <ion-button
                fill="clear"
                slot="end"
                size="small"
                [attr.aria-label]="'Edit custom scale ' + scale.label"
                (click)="openCustomEditor(scale)"
              >
                <ion-icon slot="icon-only" name="create-outline" aria-hidden="true"></ion-icon>
              </ion-button>
            </ion-item>
          } @empty {
            <ion-item>
              <ion-label color="medium">No custom scales yet</ion-label>
            </ion-item>
          }

          <!-- Add custom scale -->
          <ion-item button (click)="openCustomEditor()" aria-label="Add custom scale">
            <ion-icon slot="start" name="add-outline" aria-hidden="true"></ion-icon>
            <ion-label>Add custom scale</ion-label>
          </ion-item>
        </ion-list>
      }
    </ion-content>

    <!-- Builtin preset card-toggle editor -->
    <ion-modal
      #editorModal
      cssClass="modal-centered"
      [isOpen]="editorOpen()"
      [breakpoints]="surface.sheetBreakpointsFull()"
      [initialBreakpoint]="surface.initialSheetBreakpointFull()"
      (didDismiss)="editorOpen.set(false)"
    >
      <ng-template>
        @if (editingScaleId(); as id) {
          <app-scale-editor-sheet
            [scaleId]="id"
            (closeRequested)="closeEditor()"
          />
        }
      </ng-template>
    </ion-modal>

    <!-- Custom scale creator / editor -->
    <ion-modal
      #customEditorModal
      cssClass="modal-centered"
      [isOpen]="customEditorOpen()"
      [breakpoints]="surface.sheetBreakpointsFull()"
      [initialBreakpoint]="surface.initialSheetBreakpointFull()"
      (didDismiss)="customEditorOpen.set(false)"
    >
      <ng-template>
        <app-custom-scale-editor-sheet
          [existingScale]="editingCustomScale()"
          (created)="onCustomScaleCreated($event)"
          (updated)="onCustomScaleUpdated($event)"
          (closeRequested)="closeCustomEditor()"
        />
      </ng-template>
    </ion-modal>
  `,
  styles: [
    `
      ion-note {
        font-size: 0.85rem;
      }
    `,
  ],
})
export class ScalePickerSheetComponent {
  protected readonly scalePrefs = inject(ScalePreferenceService);
  protected readonly surface = inject(SurfaceService);
  private readonly editorModalRef = viewChild<IonModal>('editorModal');
  private readonly customEditorModalRef = viewChild<IonModal>('customEditorModal');

  /**
   * Optional: scale ID for pre-selection in picker mode. If provided,
   * component shows as a radio picker and emits scaleSelected events.
   * If not provided, shows management-only mode (presets + custom with CRUD).
   */
  readonly selectedScaleId = input<string | undefined>();

  /**
   * Emits the newly-selected scale in picker mode. The parent container
   * is responsible for writing to the doc or updating preferences.
   */
  readonly scaleSelected = output<Scale>();

  /** Emits when the user taps "Done" in the header. */
  readonly closeRequested = output<void>();

  protected readonly availableScales = this.scalePrefs.availableScales;
  protected readonly presetScales = Object.values(BUILTIN_SCALES);

  /** True if in picker mode (selectedScaleId is provided). */
  protected readonly showPickerMode = computed(() => this.selectedScaleId() !== undefined);

  /** ID of the builtin preset being card-toggled. */
  protected readonly editingScaleId = signal<string | null>(null);
  protected readonly editorOpen = signal(false);

  /** Custom scale being edited (undefined = create mode). */
  protected readonly editingCustomScale = signal<CustomScale | undefined>(undefined);
  protected readonly customEditorOpen = signal(false);

  protected formatId = (id: string): string => getScaleLabel(id, this.scalePrefs.customScales());

  constructor() {
    addIcons({
      'create-outline': createOutline,
      'add-outline': addOutline,
    });
  }

  protected onChange(id: string | null | undefined): void {
    if (!id) return;
    const next = this.availableScales().find((s) => s.id === id);
    if (!next) return;
    this.scaleSelected.emit(next);
  }

  protected preview(scale: Scale): string {
    return previewCards(scale.cards);
  }

  protected previewBuiltin(id: string): string {
    return previewBuiltinCards(id, this.scalePrefs.presetOverrides());
  }

  protected previewCards(cards: string[]): string {
    return previewCards(cards);
  }

  private isBuiltin(id: string): boolean {
    return id in BUILTIN_SCALES;
  }

  /** Route to the appropriate editor depending on builtin vs custom. */
  protected openEdit(scale: Scale, event: Event): void {
    event.stopPropagation();
    if (this.isBuiltin(scale.id)) {
      this.editingScaleId.set(scale.id);
      this.editorOpen.set(true);
    } else {
      const custom = this.scalePrefs.customScales().find((s) => s.id === scale.id);
      this.editingCustomScale.set(custom);
      this.customEditorOpen.set(true);
    }
  }

  protected openPresetEditor(scaleId: string): void {
    this.editingScaleId.set(scaleId);
    this.editorOpen.set(true);
  }

  protected async closeEditor(): Promise<void> {
    await this.editorModalRef()?.dismiss();
    this.editorOpen.set(false);
  }

  protected openCustomEditor(scale?: CustomScale): void {
    this.editingCustomScale.set(scale);
    this.customEditorOpen.set(true);
  }

  protected async closeCustomEditor(): Promise<void> {
    await this.customEditorModalRef()?.dismiss();
    this.customEditorOpen.set(false);
  }

  protected onCustomScaleCreated(id: string): void {
    const scale = this.availableScales().find((s) => s.id === id);
    if (scale) this.scaleSelected.emit(scale);
  }

  protected onCustomScaleUpdated(id: string): void {
    const scale = this.availableScales().find((s) => s.id === id);
    if (scale) this.scaleSelected.emit(scale);
  }
}
