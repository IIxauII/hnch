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
import { hashPassword, type Scale } from '@hnch/shared';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronForwardOutline } from 'ionicons/icons';

import { environment } from '../../environments/environment';
import { AppPreferenceService } from '../core/app-preference.service';
import { DocService } from '../core/doc/doc.service';
import { patchRoomAccess } from '../core/relay/relay-api';
import { ToastService } from '../services/toast.service';
import {
  AccessPickerSheetComponent,
  type AccessMode,
  type AccessSelection,
} from './access-picker.sheet';
import { ScalePickerSheetComponent } from './scale-picker.sheet';
import { presentSheet } from '../utils/present-sheet';
import { formatScaleId } from '@hnch/shared';

/**
 * Session settings half-sheet — ux.md §5.8.
 *
 * Two rows (Scale, Access) with chevrons that open the corresponding
 * picker half-sheets. Scale writes through to `DocService` immediately
 * on selection (iOS picker idiom, no Save button). Access is held in a
 * local signal — access enforcement is a relay concern (ADR-0009).
 */
@Component({
  selector: 'app-session-settings-sheet',
  host: { class: 'ion-page' },
  imports: [
    AccessPickerSheetComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonNote,
    IonTitle,
    IonToolbar,
    ScalePickerSheetComponent,
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
        <ion-item [disabled]="!isHost()">
          <ion-label position="floating">Session name</ion-label>
          <ion-input
            #sessionNameInput
            type="text"
            placeholder="Session name"
            [value]="settings()?.name"
            [disabled]="!isHost()"
            (ionBlur)="onSessionNameBlur()"
            clearInput
            aria-label="Session name"
          ></ion-input>
        </ion-item>
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
        <app-scale-picker-sheet
          [selectedScaleId]="currentScale()?.id"
          (scaleSelected)="onScaleSelected($event)"
          (closeRequested)="closeScalePicker()"
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
      .value {
        color: var(--ion-color-medium);
        font-size: 0.95rem;
        margin-right: 0.25rem;
      }
    `,
  ],
})
export class SessionSettingsSheetComponent {
  private readonly appPrefs = inject(AppPreferenceService);
  private readonly docService = inject(DocService);
  private readonly toastService = inject(ToastService);

  protected readonly settings = this.docService.settings;

  /**
   * Fires when the user taps Done. The Lobby owns the outer sheet's
   * `ion-modal` and is responsible for dismissing it.
   */
  readonly closeRequested = output<void>();

  /**
   * Access state is owned by the parent (LobbyPage) so it survives
   * modal dismiss/recreate cycles. The settings sheet reads and
   * updates it via input/output bindings.
   */
  readonly accessMode = input<AccessMode>('open');
  readonly accessPassword = input<string>('');
  readonly accessChanged = output<AccessSelection>();

  /**
   * Host state — controls whether room name input is editable.
   * Only the host can edit session name.
   */
  readonly isHost = input<boolean>(false);

  /** Inner picker visibility flags. */
  protected readonly scaleOpen = signal(false);
  protected readonly accessOpen = signal(false);

  /** Current settings.defaultScale, or `null` until session boots. */
  protected readonly currentScale = computed<Scale | null>(
    () => this.settings()?.defaultScale ?? null,
  );

  protected readonly scaleLabel = computed(() => {
    const id = this.currentScale()?.id;
    if (!id) return '';
    return formatScaleId(id);
  });

  protected readonly accessLabel = computed(() => formatAccessLabel(this.accessMode()));

  private readonly sessionNameInput = viewChild<IonInput>('sessionNameInput');
  private readonly scaleModalRef = viewChild<IonModal>('scaleModal');
  private readonly accessModalRef = viewChild<IonModal>('accessModal');

  constructor() {
    addIcons({
      'chevron-forward-outline': chevronForwardOutline,
    });
  }

  // ---------------------------------------------------------------------------
  // Row handlers
  // ---------------------------------------------------------------------------

  protected onSessionNameBlur(): void {
    const sessionNameInputElement = this.sessionNameInput();
    if (!sessionNameInputElement) return;
    const trimmed = (sessionNameInputElement.value as string).trim();
    const update = { ...((trimmed) && { name: trimmed }) };
    this.docService.updateSettings(update);
  }

  protected openScalePicker(): void {
    const modal = this.scaleModalRef();
    if (modal) void presentSheet({ modal });
  }

  protected openAccessPicker(): void {
    const modal = this.accessModalRef();
    if (modal) void presentSheet({ modal });
  }

  // ---------------------------------------------------------------------------
  // Picker event handlers
  // ---------------------------------------------------------------------------

  protected onScaleSelected(scale: Scale): void {
    this.docService.updateSettings({ defaultScale: scale });
  }

  protected async closeScalePicker(): Promise<void> {
    await this.scaleModalRef()?.dismiss();
    this.scaleOpen.set(false);
  }

  protected onAccessSelected(selection: AccessSelection): void {
    this.accessChanged.emit(selection);

    // Fire-and-forget relay PATCH — update access mode on the relay.
    void this.syncAccessToRelay(selection);
  }

  private async syncAccessToRelay(selection: AccessSelection): Promise<void> {
    const roomUuid = this.docService.meta()?.roomUuid;
    if (!roomUuid) return;

    try {
      if (selection.mode === 'password' && selection.password) {
        const hash = await hashPassword(selection.password, roomUuid);
        await patchRoomAccess(
          this.appPrefs.relayHttpUrl() ?? environment.relayHttpUrl,
          roomUuid,
          hash,
        );
      } else if (selection.mode === 'open') {
        await patchRoomAccess(
          this.appPrefs.relayHttpUrl() ?? environment.relayHttpUrl,
          roomUuid,
          null,
        );
      }
      // 'invite' mode is a no-op per ADR-0017 (dropped from v1).
    } catch {
      await this.toastService.error('Failed to update access mode. Try again.');
    }
  }

  protected async closeAccessPicker(): Promise<void> {
    await this.accessModalRef()?.dismiss();
    this.accessOpen.set(false);
  }
}

// ---------------------------------------------------------------------------
// Module-private formatters
// ---------------------------------------------------------------------------

function formatAccessLabel(mode: AccessMode): string {
  switch (mode) {
    case 'open':
      return 'Open';
    case 'password':
      return 'Password';
  }
}
