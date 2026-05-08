import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import QRCode from 'qrcode';

/**
 * Full-screen QR display — ux.md §6 "QR display".
 *
 * Renders the invite URL as a large QR code with the formatted room
 * code below for readability and accessibility. The caller owns the
 * `<ion-modal>` visibility; this component owns the content.
 */
@Component({
  selector: 'app-qr-display-sheet',
  host: { class: 'ion-page' },
  imports: [IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Scan to join</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="closeRequested.emit()">Done</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div class="qr-container">
        @if (qrDataUrl()) {
          <img
            [src]="qrDataUrl()"
            [alt]="'QR code to join room ' + roomCode()"
            class="qr-image"
          />
        }
        <p class="room-code">{{ roomCode() }}</p>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .qr-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
      }
      .qr-image {
        width: min(80vmin, 400px);
        height: min(80vmin, 400px);
        border-radius: 12px;
      }
      .room-code {
        margin-top: 1.5rem;
        font-size: 1.75rem;
        font-weight: 700;
        letter-spacing: 0.1em;
        font-family: var(--ion-font-family-monospace, ui-monospace, monospace);
      }
    `,
  ],
})
export class QrDisplaySheetComponent {
  readonly inviteUrl = input.required<string>();
  readonly roomCode = input.required<string>();
  readonly closeRequested = output<void>();

  protected readonly qrDataUrl = signal<string | null>(null);

  constructor() {
    effect(() => {
      const url = this.inviteUrl();
      if (url) {
        void this.generateQr(url);
      }
    });
  }

  private async generateQr(text: string): Promise<void> {
    try {
      const dataUrl = await QRCode.toDataURL(text, {
        width: 512,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      this.qrDataUrl.set(dataUrl);
    } catch {
      // QR generation failure is non-critical — the room code
      // text is still visible as a fallback.
      this.qrDataUrl.set(null);
    }
  }
}
