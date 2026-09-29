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
 * QR display — ux.md §2 "QR display".
 *
 * Renders the invite URL as a large QR code with the formatted session
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
            [alt]="'QR code to join session ' + roomCode()"
            class="qr-image"
          />
        }
        <p class="room-code">{{ roomCode() }}</p>
        <p class="hint">Point a phone camera at the code, or type it in.</p>
      </div>
    </ion-content>
  `,
  styles: [
    `
      /*
       * min-height, not height: the image must be able to push the container
       * taller than the dialog and scroll, rather than be centered *over* the
       * header — a QR code with its top row clipped does not scan.
       */
      .qr-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100%;
      }
      .qr-image {
        width: min(100%, 320px);
        height: auto;
        aspect-ratio: 1;
        border-radius: 12px;
      }
      .room-code {
        margin: 20px 0 0;
        color: var(--hnch-text);
        font-size: 1.75rem;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        letter-spacing: 0.08em;
      }
      .hint {
        margin: 6px 0 0;
        color: var(--hnch-muted);
        font-size: 0.875rem;
        text-align: center;
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
