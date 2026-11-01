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
import { getScaleLabel, MAX_PASSWORD_LENGTH, normalizePassword, type Scale } from '@hnch/shared';
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

import { DocService } from '../core/doc/doc.service';
import { ScalePreferenceService } from '../core/scale-preference.service';
import { SessionAccessService } from '../core/session-access.service';
import { SurfaceService } from '../core/surface.service';
import { ToastService } from '../services/toast.service';
import { ScalePickerSheetComponent } from './scale-picker.sheet';
import { presentSheet } from '../utils/present-sheet';
import { accessHint, passwordPlaceholder } from './session-settings.helpers';
import { isComposingKey } from '../utils/composing-key';

/**
 * Session settings half-sheet — host only.
 *
 * Three rows: name, scale, password. Name and password save when the field
 * loses focus (or on Enter); scale opens its picker. There is no separate
 * "access" picker: a session with a password is protected and one without is
 * open, so the password field *is* the access setting.
 *
 * Access is relay state (ADR-0009), kept by `SessionAccessService`. The
 * sheet asks for a change and reports how it went; the state itself is not
 * the sheet's, because the sheet is usually closed before the relay has
 * answered — the field saves on blur, and what blurs it is the tap on Done.
 *
 * The password is never shown back. The relay holds a hash and so does this
 * device; the field is empty until something is typed into it, and empty
 * again once that has been saved.
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
            (keydown.enter)="composing($event) || onSessionNameBlur()"
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
            autocomplete="off"
            enterkeyhint="done"
            [maxlength]="maxPasswordLength"
            [placeholder]="passwordPlaceholder()"
            [value]="passwordDraft()"
            [disabled]="!isHost() || savingAccess()"
            (ionInput)="passwordDraft.set($any($event.detail.value) ?? '')"
            (ionBlur)="onPasswordCommit()"
            (keydown.enter)="composing($event) || onPasswordCommit()"
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
  /**
   * For the Enter handlers: the Enter that confirms a choice in an input
   * method is part of typing, and commits nothing.
   */
  protected readonly composing = isComposingKey;

  /** As long as a password gets, on every surface. */
  protected readonly maxPasswordLength = MAX_PASSWORD_LENGTH;

  private readonly scalePrefs = inject(ScalePreferenceService);
  private readonly docService = inject(DocService);
  private readonly access = inject(SessionAccessService);
  private readonly toastService = inject(ToastService);
  protected readonly surface = inject(SurfaceService);

  protected readonly settings = this.docService.settings;

  /**
   * Fires when the user taps Done. The Lobby owns the outer sheet's
   * `ion-modal` and is responsible for dismissing it.
   */
  readonly closeRequested = output<void>();

  /** Whether the session asks for a password, as the relay last said. */
  protected readonly accessMode = this.access.mode;

  /** Only the host may change anything here; everyone else gets it read-only. */
  readonly isHost = input<boolean>(false);

  /** Inner picker visibility flag. */
  protected readonly scaleOpen = signal(false);

  /** What is in the password field right now. Committed on blur / Enter. */
  protected readonly passwordDraft = signal('');

  /** True while an access change is on its way to the relay. */
  protected readonly savingAccess = this.access.saving;

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

  /**
   * Blur / Enter on the password field. A blank field changes nothing —
   * taking the password *off* is the explicit "Remove password" button, so
   * tabbing through an empty field can never open a protected session.
   */
  protected async onPasswordCommit(): Promise<void> {
    if (!this.isHost() || this.savingAccess()) return;
    const password = this.passwordDraft();
    if (normalizePassword(password) === '') return;
    // Out of the field before anything else: it has been handed over.
    this.passwordDraft.set('');
    await this.report(await this.access.setPassword(password), 'Password set');
  }

  protected async onRemovePassword(): Promise<void> {
    if (!this.isHost() || this.savingAccess()) return;
    this.passwordDraft.set('');
    await this.report(await this.access.removePassword(), 'Password removed');
  }

  /**
   * Say how the change went. Runs to the end even when the sheet has been
   * closed in the meantime — the toast is how the user finds out.
   */
  private async report(
    result: Awaited<ReturnType<SessionAccessService['setPassword']>>,
    done: string,
  ): Promise<void> {
    if (result === 'applied') await this.toastService.info(done);
    if (result === 'failed') {
      await this.toastService.error("Couldn't update the password. Try again.");
    }
  }
}
