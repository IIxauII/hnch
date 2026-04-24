import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core'
import { BUILTIN_SCALES, formatScaleId } from '@hnch/shared'
import { type CustomScale } from '@hnch/shared'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { addOutline, createOutline, trashOutline } from 'ionicons/icons'

import { HapticService } from '../core/haptic.service'
import { ScalePreferenceService } from '../core/scale-preference.service'
import { CustomScaleEditorSheetComponent } from '../session-settings/custom-scale-editor.sheet'
import { ScaleEditorSheetComponent } from '../session-settings/scale-editor.sheet'

/**
 * Scale management half-sheet — reachable from Settings → Scales section.
 *
 * Two sections:
 * - Presets: all builtin scales; tap edit icon to toggle individual cards
 *   (ScaleEditorSheetComponent).
 * - Custom: user-defined scales; tap edit to modify, swipe-left to delete.
 *   "Add custom scale" row opens CustomScaleEditorSheetComponent in create mode.
 */
@Component({
  selector: 'app-scale-management-sheet',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonListHeader,
    IonModal,
    IonNote,
    IonTitle,
    IonToolbar,
    CustomScaleEditorSheetComponent,
    ScaleEditorSheetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Scales</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="closeRequested.emit()">Done</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding-top">

      <!-- Presets -->
      <ion-list-header>
        <ion-label>Presets</ion-label>
      </ion-list-header>
      <ion-list lines="inset">
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

      <!-- Custom scales -->
      <ion-list-header>
        <ion-label>Custom</ion-label>
      </ion-list-header>
      <ion-list lines="inset">
        @for (scale of scalePrefs.customScales(); track scale.id) {
          <ion-item-sliding>
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
            <ion-item-options side="end">
              <ion-item-option
                color="danger"
                (click)="onDeleteCustomScale(scale)"
                [attr.aria-label]="'Delete ' + scale.label"
              >
                <ion-icon slot="icon-only" name="trash-outline" aria-hidden="true"></ion-icon>
              </ion-item-option>
            </ion-item-options>
          </ion-item-sliding>
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

    </ion-content>

    <!-- Preset card-toggle editor -->
    <ion-modal
      #presetEditorModal
      [isOpen]="presetEditorOpen()"
      [breakpoints]="[0, 0.6, 0.95]"
      [initialBreakpoint]="0.6"
      (didDismiss)="presetEditorOpen.set(false)"
    >
      <ng-template>
        @if (editingPresetId(); as id) {
          <app-scale-editor-sheet
            [scaleId]="id"
            (closeRequested)="closePresetEditor()"
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
      ion-list-header {
        margin-top: 0.5rem;
      }
    `,
  ],
})
export class ScaleManagementSheetComponent {
  protected readonly scalePrefs = inject(ScalePreferenceService)
  private readonly haptics = inject(HapticService)

  private readonly presetEditorModalRef = viewChild<IonModal>('presetEditorModal')
  private readonly customEditorModalRef = viewChild<IonModal>('customEditorModal')

  /** Emits when the user taps Done. */
  readonly closeRequested = output<void>()

  /** Ordered builtin scales for the Presets section. */
  protected readonly presetScales = Object.values(BUILTIN_SCALES)

  protected readonly editingPresetId = signal<string | null>(null)
  protected readonly presetEditorOpen = signal(false)

  protected readonly editingCustomScale = signal<CustomScale | undefined>(undefined)
  protected readonly customEditorOpen = signal(false)

  protected readonly formatId = formatScaleId

  constructor() {
    addIcons({
      'create-outline': createOutline,
      'add-outline': addOutline,
      'trash-outline': trashOutline,
    })
  }

  protected previewBuiltin(id: string): string {
    const overrides = this.scalePrefs.presetOverrides()
    const builtin = BUILTIN_SCALES[id]
    if (!builtin) return ''
    const disabled = overrides[id] ?? []
    const cards =
      disabled.length === 0
        ? builtin.cards
        : builtin.cards.filter((_, i) => !disabled.includes(i))
    return this.previewCards(cards)
  }

  protected previewCards(cards: string[]): string {
    return cards.join(' · ')
  }

  protected openPresetEditor(scaleId: string): void {
    this.editingPresetId.set(scaleId)
    this.presetEditorOpen.set(true)
  }

  protected async closePresetEditor(): Promise<void> {
    await this.presetEditorModalRef()?.dismiss()
    this.presetEditorOpen.set(false)
  }

  protected openCustomEditor(scale?: CustomScale): void {
    this.editingCustomScale.set(scale)
    this.customEditorOpen.set(true)
  }

  protected async closeCustomEditor(): Promise<void> {
    await this.customEditorModalRef()?.dismiss()
    this.customEditorOpen.set(false)
  }

  protected onDeleteCustomScale(scale: CustomScale): void {
    this.haptics.notificationWarning()
    void this.scalePrefs.deleteCustomScale(scale.id)
  }
}
