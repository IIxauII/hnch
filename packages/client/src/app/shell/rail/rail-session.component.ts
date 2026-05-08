import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AlertController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { DocService } from '../../core/doc/doc.service';
import { HapticService } from '../../core/haptic.service';
import { LastSessionService } from '../../core/last-session.service';
import { ParticipantIdService } from '../../core/participant-id.service';
import { PublicNavBlockComponent } from './public-nav-block.component';
import { SessionContextBlockComponent } from './session-context-block.component';

/**
 * Session rail: wordmark + nav + session context + Leave/End footer.
 * Reads the same DocService signals as Lobby/Estimating pages.
 */
@Component({
  selector: 'hnch-rail-session',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublicNavBlockComponent, SessionContextBlockComponent],
  providers: [AlertController],
  template: `
    <div class="rss">
      <div class="rss-top">
        <hnch-public-nav-block />
        <div class="rss-divider" aria-hidden="true"></div>
        <hnch-session-context-block />
      </div>

      <div class="rss-footer" role="group" aria-label="Session actions">
        <button
          class="rss-action rss-action--danger"
          (click)="onLeaveTap()"
          aria-label="Leave session"
          type="button"
        >
          Leave
        </button>
        @if (isHost()) {
          <button
            class="rss-action rss-action--danger"
            (click)="onEndTap()"
            aria-label="End session for everyone"
            type="button"
          >
            End session
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      .rss {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: var(--hnch-sp-5, 24px) var(--hnch-sp-4, 16px);
      }

      .rss-top {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-4, 16px);
        overflow-y: auto;
      }

      .rss-divider {
        height: 1px;
        background: var(--ion-border-color, var(--ion-color-step-200));
        margin-block: var(--hnch-sp-1, 4px);
      }

      .rss-footer {
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-2, 8px);
        padding-top: var(--hnch-sp-4, 16px);
        border-top: 1px solid var(--ion-border-color, var(--ion-color-step-200));
      }

      .rss-action {
        display: block;
        width: 100%;
        padding: var(--hnch-sp-2, 8px) var(--hnch-sp-3, 12px);
        border-radius: var(--hnch-r-sm, 10px);
        border: none;
        background: transparent;
        text-align: left;
        cursor: pointer;
        font: var(--hnch-body);
        transition: background 150ms ease;

        &:hover {
          background: var(--ion-color-step-100);
        }

        &.rss-action--danger {
          color: var(--ion-color-danger);
        }
      }
    `,
  ],
})
export class RailSessionComponent {
  private readonly docService = inject(DocService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly lastSession = inject(LastSessionService);
  private readonly router = inject(Router);
  private readonly haptic = inject(HapticService);
  private readonly alertCtrl = inject(AlertController);

  protected readonly isHost = computed(() => {
    const hostId = this.docService.settings()?.hostParticipantId ?? null;
    const myId = this.participantIdService.id();
    return !!myId && !!hostId && myId === hostId;
  });

  protected async onLeaveTap(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Leave session?',
      message: 'You will be removed from the session.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Leave',
          role: 'destructive',
          handler: () => {
            this.haptic.impactMedium();
            void this.leaveSession();
          },
        },
      ],
    });
    await alert.present();
  }

  protected async onEndTap(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'End session?',
      message: 'All participants will be disconnected.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'End session',
          role: 'destructive',
          handler: () => {
            this.haptic.impactHeavy();
            this.docService.endSessionForEveryone();
          },
        },
      ],
    });
    await alert.present();
  }

  private async leaveSession(): Promise<void> {
    const selfId = this.participantIdService.id();
    if (selfId) {
      this.docService.leaveSession(selfId);
      await this.docService.flushUpdates();
    }
    this.docService.endSession();
    await this.lastSession.clear();
    await this.router.navigate(['/home']);
  }
}
