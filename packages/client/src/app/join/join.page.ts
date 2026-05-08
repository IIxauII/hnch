import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  formatRoomCode,
  hashPassword,
  isValidRoomCode,
  normalizeRoomCode,
  parseInviteContent,
  type JoinRejectionReason,
} from '@hnch/shared';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { ellipsisHorizontalOutline, qrCodeOutline } from 'ionicons/icons';

import { environment } from '../../environments/environment';
import { AppPreferenceService } from '../core/app-preference.service';
import { DisplayNameService } from '../core/display-name.service';
import { DocService } from '../core/doc/doc.service';
import { ParticipantIdService } from '../core/participant-id.service';
import { type QrScanErrorReason, QrScannerService } from '../core/qr-scanner.service';
import { RelayRejectionError, resolveRoom } from '../core/relay/relay-api';
import { ToastService } from '../services/toast.service';
import { SegmentedCodeInputComponent } from '../shared/segmented-code-input.component';
import { ActionMenuService } from '../shared/ui/action-menu.service';
import { PageHeaderComponent } from '../shared/ui/page-header.component';

/**
 * Join Room (manual-entry path).
 *
 * Eyebrow "join" + serif "Enter room code". Below: existing
 * SegmentedCodeInputComponent. Password field when room requires it.
 * Footer: QR scan item + Join button.
 */
@Component({
  selector: 'app-join',
  host: { class: 'ion-page' },
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonList,
    IonTitle,
    IonToolbar,
    PageHeaderComponent,
    ReactiveFormsModule,
    SegmentedCodeInputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home"></ion-back-button>
        </ion-buttons>
        <ion-title style="font: var(--hnch-title)">Join</ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="More options" (click)="openMenu()">
            <ion-icon slot="icon-only" name="ellipsis-horizontal-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      <div class="page-body">
        <hnch-page-header
          eyebrow="join"
          title="Enter room code"
          subtitle="Ask your host for the 6-character code."
        />

        <div class="code-wrap">
          <app-segmented-code-input [formControl]="codeControl" />
        </div>

        @if (needsPassword()) {
          <ion-list inset="true" class="password-list">
            <ion-item lines="none">
              <ion-input
                [formControl]="passwordControl"
                label="Password"
                labelPlacement="stacked"
                type="password"
                enterkeyhint="go"
                placeholder="Enter the room password"
                aria-label="Room password"
                (keydown.enter)="submit()"
              ></ion-input>
            </ion-item>
          </ion-list>
          <p class="password-hint">This room is password-protected.</p>
        }

        @if (errorText()) {
          <p class="error-text" role="alert" aria-live="polite">{{ errorText() }}</p>
        }
      </div>
    </ion-content>

    <ion-footer>
      <div class="footer-inner">
        <ion-button
          fill="clear"
          class="scan-btn"
          aria-label="Scan QR code"
          [disabled]="isSubmitting()"
          (click)="onScanQr()"
        >
          <ion-icon slot="start" name="qr-code-outline" aria-hidden="true"></ion-icon>
          Scan QR code
        </ion-button>
        <ion-button
          expand="block"
          color="primary"
          size="large"
          class="join-btn"
          aria-label="Join room"
          [disabled]="!canJoin() || isSubmitting()"
          (click)="submit()"
        >
          Join
        </ion-button>
      </div>
    </ion-footer>
  `,
  styles: [
    `
      ion-content {
        --background: var(--hnch-bg);
      }
      .page-body {
        display: flex;
        flex-direction: column;
        padding: 0 var(--hnch-sp-4) var(--hnch-sp-6);
        max-width: 480px;
        margin: 0 auto;
      }
      .code-wrap {
        display: flex;
        justify-content: center;
        padding-block: var(--hnch-sp-4);
        max-width: 420px;
        margin: 0 auto;
        width: 100%;
      }
      .password-list {
        background: transparent;
        margin-block-start: var(--hnch-sp-3);
      }
      ion-item {
        --background: var(--hnch-surface);
      }
      .password-hint {
        margin: var(--hnch-sp-2) var(--hnch-sp-4) 0;
        font: var(--hnch-body-sm);
        color: var(--hnch-muted);
      }
      .error-text {
        margin: var(--hnch-sp-3) var(--hnch-sp-4) 0;
        font: var(--hnch-body-sm);
        color: var(--ion-color-danger);
      }
      ion-footer {
        --background: var(--hnch-bg);
        box-shadow: none;
      }
      .footer-inner {
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-2);
        padding: var(--hnch-sp-3) var(--hnch-sp-4) var(--hnch-sp-6);
        max-width: 480px;
        margin: 0 auto;
      }
      .scan-btn {
        font: var(--hnch-body);
        color: var(--hnch-muted);
        align-self: center;
      }
      .join-btn {
        font: var(--hnch-title);
        --border-radius: var(--hnch-r-sm);
      }
    `,
  ],
})
export class JoinPage {
  private readonly appPrefs = inject(AppPreferenceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly docService = inject(DocService);
  private readonly displayNameService = inject(DisplayNameService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly qrScanner = inject(QrScannerService);
  private readonly toastService = inject(ToastService);
  private readonly actionMenuService = inject(ActionMenuService);

  protected readonly codeControl = new FormControl('', { nonNullable: true });
  protected readonly passwordControl = new FormControl('', { nonNullable: true });

  private readonly rawValue = toSignal(this.codeControl.valueChanges, {
    initialValue: this.codeControl.value,
  });

  private readonly rawPassword = toSignal(this.passwordControl.valueChanges, {
    initialValue: this.passwordControl.value,
  });

  private readonly normalizedCode = computed(() => normalizeRoomCode(this.rawValue()));

  protected readonly needsPassword = signal(false);
  protected readonly errorText = signal<string | null>(null);

  private resolvedUuid: string | null = null;

  protected readonly canJoin = computed(() => {
    if (!isValidRoomCode(this.normalizedCode())) return false;
    if (this.resolvedUuid !== null && this.needsPassword() && !this.rawPassword().trim())
      return false;
    return true;
  });

  protected readonly isSubmitting = signal(false);

  constructor() {
    addIcons({
      'qr-code-outline': qrCodeOutline,
      'ellipsis-horizontal-outline': ellipsisHorizontalOutline,
    });

    this.codeControl.valueChanges.subscribe((value) => {
      const normalized = normalizeRoomCode(value);
      const formatted = formatRoomCode(normalized);
      if (formatted !== value) {
        this.codeControl.setValue(formatted, { emitEvent: false });
      }
      if (this.resolvedUuid !== null || this.needsPassword()) {
        this.resolvedUuid = null;
        this.needsPassword.set(false);
        this.passwordControl.reset();
      }
      this.errorText.set(null);
    });

    const codeParam = this.route.snapshot.queryParamMap.get('code');
    if (codeParam) {
      const formatted = formatRoomCode(normalizeRoomCode(codeParam));
      this.codeControl.setValue(formatted);

      const pwParam = this.route.snapshot.queryParamMap.get('pw');
      if (pwParam === '1') {
        this.needsPassword.set(true);
      }

      void this.displayNameService.getDisplayName().then((name) => {
        if (shouldAutoSubmitDeepLink(codeParam, name)) {
          void this.submit();
        }
      });
    }
  }

  protected async submit(): Promise<void> {
    if (!this.canJoin() || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.errorText.set(null);

    const code = this.normalizedCode();
    try {
      let uuid = this.resolvedUuid;
      if (uuid === null) {
        const resolved = await resolveRoom(
          this.appPrefs.relayHttpUrl() ?? environment.relayHttpUrl,
          code,
        );
        uuid = resolved.uuid;

        if (resolved.accessMode === 'password') {
          this.resolvedUuid = uuid;
          this.needsPassword.set(true);
          this.isSubmitting.set(false);
          return;
        }

        this.needsPassword.set(false);
        this.passwordControl.reset();
      }

      const [displayName, participantId] = await Promise.all([
        this.displayNameService.getDisplayName(),
        this.participantIdService.getOrCreateId(),
      ]);

      const passwordHash = this.needsPassword()
        ? await hashPassword(this.passwordControl.value, uuid)
        : undefined;

      this.docService.endSession();
      this.docService.joinSession({
        participantId,
        displayName: displayName ?? '',
        roomCode: code,
      });

      this.docService.connect(
        {
          roomCode: code,
          deviceId: participantId,
          ...(passwordHash !== undefined && { passwordHash }),
        },
        { roomUuid: uuid },
      );

      const roomCode = this.docService.roomCode();
      if (!roomCode) {
        throw new Error('join.page submit: docService.roomCode() is null after joinSession');
      }
      await this.router.navigate(['/lobby', roomCode]);
    } catch (err) {
      if (err instanceof RelayRejectionError) {
        this.errorText.set(rejectionCopy(err.reason));
      } else {
        this.errorText.set("Couldn't reach the relay. Check your connection and try again.");
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected async onScanQr(): Promise<void> {
    if (this.isSubmitting()) return;
    const result = await this.qrScanner.scanForCode();

    if (result.status === 'cancelled') return;

    if (result.status === 'error') {
      await this.toastService.error(qrScanErrorCopy(result.reason));
      return;
    }

    const code = parseInviteContent(result.value);
    if (!code) {
      await this.toastService.error("That doesn't look like an hnch invite");
      return;
    }

    this.codeControl.setValue(formatRoomCode(code));
    await this.submit();
  }

  protected async openMenu(): Promise<void> {
    const id = await this.actionMenuService.open(
      [
        { id: 'settings', label: 'Settings', icon: 'settings-outline' },
        { id: 'cancel', label: 'Cancel', role: 'cancel' },
      ],
      { header: 'Join' },
    );
    if (id === 'settings') {
      await this.router.navigate(['/settings']);
    }
  }
}

// ---------------------------------------------------------------------------
// Exported helpers (also used in tests)
// ---------------------------------------------------------------------------

export function shouldAutoSubmitDeepLink(
  codeParam: string | null,
  displayName: string | null,
): boolean {
  if (!codeParam) return false;
  return displayName !== null && displayName.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Module-private copy
// ---------------------------------------------------------------------------

export function rejectionCopy(reason: JoinRejectionReason): string {
  switch (reason) {
    case 'unknown-room':
      return "That room code isn't active. Double-check with your host.";
    case 'wrong-password':
      return 'That password is incorrect.';
    case 'invalid-invite':
      return "That invite link isn't valid.";
    case 'expired-invite':
      return 'That invite link has expired.';
    case 'invite-already-redeemed':
      return 'That invite link has already been used.';
    case 'room-full':
      return 'This room is full (max 20 participants). Navigate back and try another room.';
    case 'malformed-credentials':
      return "Couldn't join with the info provided.";
  }
}

export function qrScanErrorCopy(reason: QrScanErrorReason): string {
  switch (reason) {
    case 'permission-denied':
      return 'Camera access blocked. Allow camera in browser settings to scan.';
    case 'no-camera':
      return 'No camera available on this device.';
    case 'camera-busy':
      return 'Camera is in use by another app.';
    case 'unavailable':
      return "Scanning isn't supported on this browser.";
    case 'unknown':
      return "Couldn't start the scanner.";
  }
}
