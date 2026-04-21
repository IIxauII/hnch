import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core'
import type { Scale } from '@hnch/shared'
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
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { chevronForwardOutline } from 'ionicons/icons'

import { DocService } from '../core/doc/doc.service'
import {
  AccessPickerSheetComponent,
  type AccessMode,
  type AccessSelection,
} from './access-picker.sheet'
import { ScalePickerSheetComponent } from './scale-picker.sheet'
import {
  TimerPickerSheetComponent,
  type TimerSelection,
} from './timer-picker.sheet'

/**
 * Session settings half-sheet — ux.md §5.8.
 *
 * Three rows (Scale, Timer, Access) with chevrons that open the
 * corresponding picker half-sheets. Scale and Timer write through
 * to `DocService` immediately on selection (iOS picker idiom, no
 * Save button). Access is held in a local signal per plan §3.6 —
 * access enforcement is a Phase-5 relay concern (ADR-0009) and
 * writing to the doc prematurely would be wrong.
 *
 * Phase 2 only surfaces the host view. Joiners-as-readonly
 * (ux.md §5.8: "Joiners see the same sheet without chevrons") is
 * Phase 3; the necessary `isHost` signal lives on the DocService's
 * consumers already and would just gate the chevrons + row taps
 * when toggled off.
 */
@Component({
  selector: 'app-session-settings-sheet',
  imports: [
    AccessPickerSheetComponent,
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
    IonTitle,
    IonToolbar,
    ScalePickerSheetComponent,
    TimerPickerSheetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Session settings</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="closeRequested.emit()">Done</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding-top">
      <ion-list lines="inset">
        <ion-item button (click)="openScalePicker()">
          <ion-label>
            <h3>Scale</h3>
          </ion-label>
          <ion-note slot="end" class="value">{{ scaleLabel() }}</ion-note>
          <ion-icon
            slot="end"
            name="chevron-forward-outline"
            aria-hidden="true"
          ></ion-icon>
        </ion-item>
        <ion-item button (click)="openTimerPicker()">
          <ion-label>
            <h3>Timer</h3>
          </ion-label>
          <ion-note slot="end" class="value">{{ timerLabel() }}</ion-note>
          <ion-icon
            slot="end"
            name="chevron-forward-outline"
            aria-hidden="true"
          ></ion-icon>
        </ion-item>
        <ion-item button (click)="openAccessPicker()">
          <ion-label>
            <h3>Access</h3>
          </ion-label>
          <ion-note slot="end" class="value">{{ accessLabel() }}</ion-note>
          <ion-icon
            slot="end"
            name="chevron-forward-outline"
            aria-hidden="true"
          ></ion-icon>
        </ion-item>
      </ion-list>
    </ion-content>

    <ion-modal
      #scaleModal
      [isOpen]="scaleOpen()"
      [breakpoints]="[0, 0.6, 0.95]"
      [initialBreakpoint]="0.6"
      (didDismiss)="scaleOpen.set(false)"
    >
      <ng-template>
        @if (currentScale(); as scale) {
          <app-scale-picker-sheet
            [currentScale]="scale"
            (selected)="onScaleSelected($event)"
            (closeRequested)="closeScalePicker()"
          />
        }
      </ng-template>
    </ion-modal>

    <ion-modal
      #timerModal
      [isOpen]="timerOpen()"
      [breakpoints]="[0, 0.6, 0.95]"
      [initialBreakpoint]="0.6"
      (didDismiss)="timerOpen.set(false)"
    >
      <ng-template>
        <app-timer-picker-sheet
          [currentMs]="currentTimerMs()"
          (selected)="onTimerSelected($event)"
          (closeRequested)="closeTimerPicker()"
        />
      </ng-template>
    </ion-modal>

    <ion-modal
      #accessModal
      [isOpen]="accessOpen()"
      [breakpoints]="[0, 0.6, 0.95]"
      [initialBreakpoint]="0.6"
      (didDismiss)="accessOpen.set(false)"
    >
      <ng-template>
        <app-access-picker-sheet
          [currentMode]="accessMode()"
          [currentPassword]="accessPassword()"
          (selected)="onAccessSelected($event)"
          (closeRequested)="closeAccessPicker()"
        />
      </ng-template>
    </ion-modal>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .value {
        color: var(--ion-color-medium);
        font-size: 0.95rem;
        margin-right: 0.25rem;
      }
    `,
  ],
})
export class SessionSettingsSheetComponent {
  private readonly docService = inject(DocService)

  private readonly settings = this.docService.settings

  /**
   * Fires when the user taps Done. The Lobby owns the outer sheet's
   * `ion-modal` and is responsible for dismissing it.
   */
  readonly closeRequested = output<void>()

  /** Inner picker visibility flags. */
  protected readonly scaleOpen = signal(false)
  protected readonly timerOpen = signal(false)
  protected readonly accessOpen = signal(false)

  /**
   * Access picker state — held locally, never written to the doc.
   * ADR-0009: access enforcement is the relay's job; the client-side
   * UI ships this phase so the flow is exercisable.
   */
  protected readonly accessMode = signal<AccessMode>('open')
  protected readonly accessPassword = signal<string>('')

  /** Current settings.defaultScale, or `null` until session boots. */
  protected readonly currentScale = computed<Scale | null>(
    () => this.settings()?.defaultScale ?? null,
  )

  /** Current timer duration in ms, or `null` when revealMode = 'manual'. */
  protected readonly currentTimerMs = computed<number | null>(() => {
    const s = this.settings()
    if (!s) return null
    if (s.revealMode !== 'timer') return null
    return s.timerDurationMs ?? null
  })

  protected readonly scaleLabel = computed(() => {
    const id = this.currentScale()?.id
    if (!id) return ''
    return formatScaleId(id)
  })

  protected readonly timerLabel = computed(() => {
    const ms = this.currentTimerMs()
    if (ms === null) return 'None'
    return formatTimerMs(ms)
  })

  protected readonly accessLabel = computed(() =>
    formatAccessMode(this.accessMode()),
  )

  private readonly scaleModalRef = viewChild<IonModal>('scaleModal')
  private readonly timerModalRef = viewChild<IonModal>('timerModal')
  private readonly accessModalRef = viewChild<IonModal>('accessModal')

  constructor() {
    addIcons({
      'chevron-forward-outline': chevronForwardOutline,
    })
  }

  // ---------------------------------------------------------------------------
  // Row handlers
  // ---------------------------------------------------------------------------

  protected openScalePicker(): void {
    this.scaleOpen.set(true)
  }

  protected openTimerPicker(): void {
    this.timerOpen.set(true)
  }

  protected openAccessPicker(): void {
    this.accessOpen.set(true)
  }

  // ---------------------------------------------------------------------------
  // Picker event handlers
  // ---------------------------------------------------------------------------

  protected onScaleSelected(scale: Scale): void {
    this.docService.updateSettings({ defaultScale: scale })
  }

  protected async closeScalePicker(): Promise<void> {
    await this.scaleModalRef()?.dismiss()
    this.scaleOpen.set(false)
  }

  protected onTimerSelected(selection: TimerSelection): void {
    if (selection.ms === null) {
      this.docService.updateSettings({
        revealMode: 'manual',
        timerDurationMs: undefined,
      })
    } else {
      this.docService.updateSettings({
        revealMode: 'timer',
        timerDurationMs: selection.ms,
      })
    }
  }

  protected async closeTimerPicker(): Promise<void> {
    await this.timerModalRef()?.dismiss()
    this.timerOpen.set(false)
  }

  protected onAccessSelected(selection: AccessSelection): void {
    // Phase 2: held locally only. Phase 5 wires this to the relay
    // handshake (ADR-0009 / roadmap §7).
    this.accessMode.set(selection.mode)
    this.accessPassword.set(selection.password ?? '')
  }

  protected async closeAccessPicker(): Promise<void> {
    await this.accessModalRef()?.dismiss()
    this.accessOpen.set(false)
  }
}

// ---------------------------------------------------------------------------
// Module-private formatters
// ---------------------------------------------------------------------------

/** "fibonacci" → "Fibonacci"; "t-shirt" → "T-shirt". */
function formatScaleId(id: string): string {
  if (id.length === 0) return id
  return id.charAt(0).toUpperCase() + id.slice(1)
}

/**
 * Mirrors the Lobby subtitle's timer formatting: `<60s` as "Ns",
 * >=60s as "Nmin" with one decimal for fractional minutes.
 */
function formatTimerMs(ms: number): string {
  if (ms < 60_000) {
    return `${Math.floor(ms / 1000)}s`
  }
  const mins = ms / 60_000
  return Number.isInteger(mins) ? `${mins}min` : `${mins.toFixed(1)}min`
}

function formatAccessMode(mode: AccessMode): string {
  switch (mode) {
    case 'open':
      return 'Open'
    case 'password':
      return 'Password'
    case 'invite':
      return 'Invite only'
  }
}
