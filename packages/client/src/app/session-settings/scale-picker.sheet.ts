import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core'
import { BUILTIN_SCALES, formatScaleId, type Scale } from '@hnch/shared'
import { type CustomScale } from '@hnch/shared'
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
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { addOutline, createOutline } from 'ionicons/icons'

import { ScalePreferenceService } from '../core/scale-preference.service'
import { CustomScaleEditorSheetComponent } from './custom-scale-editor.sheet'
import { ScaleEditorSheetComponent } from './scale-editor.sheet'

/**
 * Scale picker half-sheet — ux.md §5.8.
 *
 * Radio group over all available scales (builtins + custom). Builtin rows
 * carry a card-toggle edit button (ScaleEditorSheetComponent). Custom rows
 * carry a full edit button (CustomScaleEditorSheetComponent). A "Create
 * custom scale" row at the bottom opens the editor in create mode.
 * Radio selection commits immediately (no Save button).
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
        <ion-title>Scale</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="closeRequested.emit()">Done</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding-top">
      <ion-list lines="inset">
        <ion-radio-group
          aria-label="Estimation scale"
          [value]="currentValue()"
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
    </ion-content>

    <!-- Builtin preset card-toggle editor -->
    <ion-modal
      #editorModal
      [isOpen]="editorOpen()"
      [breakpoints]="[0, 0.6, 0.95]"
      [initialBreakpoint]="0.6"
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
      [isOpen]="customEditorOpen()"
      [breakpoints]="[0, 0.6, 1]"
      [initialBreakpoint]="1"
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
  private readonly scalePrefs = inject(ScalePreferenceService)
  private readonly editorModalRef = viewChild<IonModal>('editorModal')
  private readonly customEditorModalRef = viewChild<IonModal>('customEditorModal')

  /** Current scale — drives the selected radio. */
  readonly currentScale = input.required<Scale>()

  /**
   * Emits the newly-selected scale. The parent container is responsible
   * for writing to the doc (keeps this component dumb + reusable).
   */
  readonly selected = output<Scale>()

  /** Emits when the user taps "Done" in the header. */
  readonly closeRequested = output<void>()

  protected readonly availableScales = this.scalePrefs.availableScales

  protected readonly currentValue = computed(() => this.currentScale().id)

  /** ID of the builtin preset being card-toggled. */
  protected readonly editingScaleId = signal<string | null>(null)
  protected readonly editorOpen = signal(false)

  /** Custom scale being edited (undefined = create mode). */
  protected readonly editingCustomScale = signal<CustomScale | undefined>(undefined)
  protected readonly customEditorOpen = signal(false)

  constructor() {
    addIcons({ 'create-outline': createOutline, 'add-outline': addOutline })
  }

  protected onChange(id: string | null | undefined): void {
    if (!id) return
    if (id === this.currentScale().id) return
    const next = this.availableScales().find((s) => s.id === id)
    if (!next) return
    this.selected.emit(next)
  }

  protected preview(scale: Scale): string {
    return scale.cards.join(' · ')
  }

  protected readonly formatId = formatScaleId

  protected isBuiltin(id: string): boolean {
    return id in BUILTIN_SCALES
  }

  /** Route to the appropriate editor depending on builtin vs custom. */
  protected openEdit(scale: Scale, event: Event): void {
    event.stopPropagation()
    if (this.isBuiltin(scale.id)) {
      this.editingScaleId.set(scale.id)
      this.editorOpen.set(true)
    } else {
      const custom = this.scalePrefs.customScales().find((s) => s.id === scale.id)
      this.editingCustomScale.set(custom)
      this.customEditorOpen.set(true)
    }
  }

  protected async closeEditor(): Promise<void> {
    await this.editorModalRef()?.dismiss()
    this.editorOpen.set(false)
  }

  protected openCustomEditor(): void {
    this.editingCustomScale.set(undefined)
    this.customEditorOpen.set(true)
  }

  protected async closeCustomEditor(): Promise<void> {
    await this.customEditorModalRef()?.dismiss()
    this.customEditorOpen.set(false)
  }

  protected onCustomScaleCreated(id: string): void {
    const scale = this.availableScales().find((s) => s.id === id)
    if (scale) this.selected.emit(scale)
  }

  protected onCustomScaleUpdated(id: string): void {
    const scale = this.availableScales().find((s) => s.id === id)
    if (scale) this.selected.emit(scale)
  }
}
