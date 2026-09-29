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
import { getScaleLabel, hashPassword, patchRoomAccess, type Scale } from '@hnch/shared';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonInputPasswordToggle,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { AppPreferenceService } from '../core/app-preference.service';
import { DocService } from '../core/doc/doc.service';
import { LastSessionService } from '../core/last-session.service';
import { ScalePreferenceService } from '../core/scale-preference.service';
import { SurfaceService } from '../core/surface.service';
import { ToastService } from '../services/toast.service';
import { ScalePickerSheetComponent } from './scale-picker.sheet';
import { presentSheet } from '../utils/present-sheet';
import { accessHint, passwordPlaceholder } from './session-settings.helpers';

/** Access modes per ADR-0009. Invite-only dropped from v1 (ADR-0017). */
export type AccessMode = 'open' | 'password';

/**
 * What the sheet reports once the relay has accepted an access change.
 * `password` is only populated when `mode === 'password'`.
 */
export interface AccessSelection {
  readonly mode: AccessMode;
  readonly password: string | null;
}

/**
 * Session settings half-sheet — host only.
 *
 * Three rows: name, scale, password. Name and password save when the field
 * loses focus (or on Enter); scale opens its picker. There is no separate
 * "access" picker: a session with a password is protected and one without is
 * open, so the password field *is* the access setting.
 *
 * Access is relay state (ADR-0009). `accessChanged` fires only after the
 * relay has accepted the change, so the Lobby never shows a lock the relay
 * does not enforce.
 */
@Component({
  selector: 'app-session-settings-sheet',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonInputPasswordToggle,
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
          <ion-button strong="true" color="primary" (click)="closeRequested.emit()">Done</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list inset="true" lines="inset">
        <ion-item>
          <ion-input
            #sessionNameInput
            label="Session name"
            labelPlacement="stacked"
            type="text"
            placeholder="e.g. Sprint 24 planning"
            [value]="settings()?.name ?? ''"
            [disabled]="!isHost()"
            maxlength="60"
            autocapitalize="sentences"
            enterkeyhint="done"
            (ionBlur)="onSessionNameBlur()"
            (keydown.enter)="onSessionNameBlur()"
          ></ion-input>
        </ion-item>
        <ion-item button detail="true" [disabled]="!isHost()" (click)="openScalePicker()">
          <ion-label>
            <h3>Scale</h3>
          </ion-label>
          <ion-note slot="end" class="value">{{ scaleLabel() }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-input
            label="Password"
            labelPlacement="stacked"
            type="password"
            autocomplete="new-password"
            enterkeyhint="done"
            maxlength="120"
            [placeholder]="passwordPlaceholder()"
            [value]="passwordDraft()"
            [disabled]="!isHost() || savingAccess()"
            (ionInput)="passwordDraft.set($any($event.detail.value) ?? '')"
            (ionBlur)="onPasswordCommit()"
            (keydown.enter)="onPasswordCommit()"
          >
            <ion-input-password-toggle slot="end" color="medium"></ion-input-password-toggle>
          </ion-input>
        </ion-item>
      </ion-list>
      <ion-note class="helper">{{ accessHint() }}</ion-note>
      @if (isHost() && accessMode() === 'password') {
        <ion-button
          fill="clear"
          color="danger"
          class="remove-password-btn"
          [disabled]="savingAccess()"
          (click)="onRemovePassword()"
        >
          Remove password
        </ion-button>
      }
    </ion-content>

    <ion-modal
      #scaleModal
      cssClass="modal-centered"
      [isOpen]="scaleOpen()"
      [breakpoints]="surface.sheetBreakpointsFull()"
      [initialBreakpoint]="surface.initialSheetBreakpointFull()"
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
  `,
  styles: [
    `
      ion-list {
        margin-block: 0;
      }
      .value {
        font-size: 0.9375rem;
      }
      .helper {
        display: block;
        padding: 8px 16px 0;
        font-size: 13px;
        line-height: 1.4;
      }
      .remove-password-btn {
        margin: 8px 0 0 4px;
      }
    `,
  ],
})
export class SessionSettingsSheetComponent {
  private readonly appPrefs = inject(AppPreferenceService);
  private readonly scalePrefs = inject(ScalePreferenceService);
  private readonly docService = inject(DocService);
  private readonly lastSessionService = inject(LastSessionService);
  private readonly toastService = inject(ToastService);
  protected readonly surface = inject(SurfaceService);

  protected readonly settings = this.docService.settings;

  /**
   * Fires when the user taps Done. The Lobby owns the outer sheet's
   * `ion-modal` and is responsible for dismissing it.
   */
  readonly closeRequested = output<void>();

  /**
   * Access state is owned by the parent (LobbyPage) so it survives
   * modal dismiss/recreate cycles. `accessPassword` is whatever the host
   * typed on this device this session — the relay only ever holds a hash,
   * so after a reload it is blank even when the session is protected.
   */
  readonly accessMode = input<AccessMode>('open');
  readonly accessPassword = input<string>('');
  readonly accessChanged = output<AccessSelection>();

  /** Only the host may change anything here; everyone else gets it read-only. */
  readonly isHost = input<boolean>(false);

  /** Inner picker visibility flag. */
  protected readonly scaleOpen = signal(false);

  /** What is in the password field right now. Committed on blur / Enter. */
  protected readonly passwordDraft = signal('');

  /** True while an access change is on its way to the relay. */
  protected readonly savingAccess = signal(false);

  /** Current settings.defaultScale, or `null` until session boots. */
  protected readonly currentScale = computed<Scale | null>(
    () => this.settings()?.defaultScale ?? null,
  );

  protected readonly scaleLabel = computed(() => {
    const id = this.currentScale()?.id;
    if (!id) return '';
    return getScaleLabel(id, this.scalePrefs.customScales());
  });

  protected readonly accessHint = computed(() => accessHint(this.accessMode()));

  protected readonly passwordPlaceholder = computed(() => passwordPlaceholder(this.accessMode()));

  private readonly sessionNameInput = viewChild<IonInput>('sessionNameInput');
  private readonly scaleModalRef = viewChild<IonModal>('scaleModal');

  constructor() {
    // input()s aren't available until after construction — seed the draft
    // from the parent's remembered password once they are.
    queueMicrotask(() => this.passwordDraft.set(this.accessPassword()));
  }

  // ---------------------------------------------------------------------------
  // Row handlers
  // ---------------------------------------------------------------------------

  protected onSessionNameBlur(): void {
    if (!this.isHost()) return;
    const sessionNameInputElement = this.sessionNameInput();
    if (!sessionNameInputElement) return;
    const trimmed = ((sessionNameInputElement.value as string | null | undefined) ?? '').trim();
    if (!trimmed || trimmed === this.settings()?.name) return;
    this.docService.updateSettings({ name: trimmed });
  }

  protected openScalePicker(): void {
    if (!this.isHost()) return;
    const modal = this.scaleModalRef();
    if (modal) void presentSheet({ modal });
  }

  protected onScaleSelected(scale: Scale): void {
    if (!this.isHost()) return;
    this.docService.updateSettings({ defaultScale: scale });
  }

  protected async closeScalePicker(): Promise<void> {
    await this.scaleModalRef()?.dismiss();
    this.scaleOpen.set(false);
  }

  // ---------------------------------------------------------------------------
  // Password
  // ---------------------------------------------------------------------------

  /**
   * Blur / Enter on the password field. A blank field changes nothing —
   * taking the password *off* is the explicit "Remove password" button, so
   * tabbing through an empty field can never open a protected session.
   */
  protected async onPasswordCommit(): Promise<void> {
    if (!this.isHost() || this.savingAccess()) return;
    const password = this.passwordDraft().trim();
    if (!password) return;
    if (this.accessMode() === 'password' && password === this.accessPassword()) return;
    await this.applyAccess({ mode: 'password', password });
  }

  protected async onRemovePassword(): Promise<void> {
    if (!this.isHost() || this.savingAccess()) return;
    await this.applyAccess({ mode: 'open', password: null });
  }

  /** Relay first; the UI only follows once the relay has said yes. */
  private async applyAccess(selection: AccessSelection): Promise<void> {
    const roomUuid = this.docService.meta()?.roomUuid;
    if (!roomUuid) return;

    this.savingAccess.set(true);
    try {
      const relayUrl = this.appPrefs.resolvedRelayHttpUrl();
      if (selection.mode === 'password' && selection.password !== null) {
        const hash = await hashPassword(selection.password, roomUuid);
        await patchRoomAccess(relayUrl, roomUuid, hash);
        // Our own socket still carries the old `pw`; re-handshake so the
        // rotation does not lock this client out on its next reconnect, and
        // cache the hash so the host's own way back in does not ask for it.
        this.docService.updateCredentials(hash);
        this.lastSessionService.setPendingPasswordHash(roomUuid, hash);
        this.passwordDraft.set(selection.password);
        await this.toastService.info('Password set');
      } else {
        await patchRoomAccess(relayUrl, roomUuid, null);
        this.docService.updateCredentials(null);
        await this.lastSessionService.clearPasswordHash(roomUuid);
        this.passwordDraft.set('');
        await this.toastService.info('Password removed');
      }
      this.accessChanged.emit(selection);
    } catch {
      await this.toastService.error("Couldn't update the password. Try again.");
    } finally {
      this.savingAccess.set(false);
    }
  }
}
