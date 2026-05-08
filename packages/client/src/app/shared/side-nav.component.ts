import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  logOutOutline,
  personCircleOutline,
  powerOutline,
  settingsOutline,
  starOutline,
} from 'ionicons/icons';

import { DocService } from '../core/doc/doc.service';
import { HapticService } from '../core/haptic.service';
import { LastSessionService } from '../core/last-session.service';
import { ParticipantIdService } from '../core/participant-id.service';
import { participantRole } from '@hnch/shared';

addIcons({
  chevronBackOutline,
  logOutOutline,
  personCircleOutline,
  powerOutline,
  settingsOutline,
  starOutline,
});

/**
 * SideNavComponent — session-context left rail. Rendered only when the
 * split-pane is active (in-session screens, ≥lg breakpoint). Shows live
 * session info: room code, round/scale, participants, recent history.
 * Footer hosts settings, leave, and end-session (host only) actions.
 */
@Component({
  selector: 'app-side-nav',
  host: { class: 'ion-page' },
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote, RouterLink],
  template: `
    <div class="rail">
      <!-- Top: brand + home -->
      <div class="rail-top">
        <a routerLink="/home" class="brand" aria-label="Back to home">
          <span class="brand-word">hnch</span>
        </a>
        <a routerLink="/home" class="back-home" aria-label="Back to home">
          <ion-icon name="chevron-back-outline" aria-hidden="true"></ion-icon>
          Home
        </a>
      </div>

      <ion-content>
        @if (formattedCode(); as code) {
          <!-- Session section -->
          <section class="rail-section" aria-label="Session">
            <p class="section-label">Session</p>
            <p class="room-code" aria-label="Room code {{ code }}">{{ code }}</p>
            <p class="round-descriptor">{{ roundDescriptor() }}</p>
          </section>

          <!-- Participants -->
          <section class="rail-section" aria-label="Participants">
            <p class="section-label">Participants</p>
            <ion-list lines="none" class="participant-list">
              @for (p of activeParticipants(); track p.id) {
                <ion-item class="participant-item" [class.offline]="!onlineIds().has(p.id)">
                  <span class="online-dot" [class.online]="onlineIds().has(p.id)" aria-hidden="true"></span>
                  <ion-label>
                    {{ p.id === myId() ? 'You (' + p.displayName + ')' : p.displayName }}
                  </ion-label>
                  @if (p.id === hostId()) {
                    <ion-icon name="star-outline" class="host-icon" aria-label="Host" slot="end"></ion-icon>
                  }
                  @if (isParticipantViewer(p)) {
                    <ion-note slot="end" aria-label="Observer">obs</ion-note>
                  }
                </ion-item>
              }
            </ion-list>
          </section>

          <!-- Recent rounds -->
          @if (recentRounds().length > 0) {
            <section class="rail-section" aria-label="Recent rounds">
              <p class="section-label">Recent rounds</p>
              <ion-list lines="none" class="history-list">
                @for (entry of recentRounds(); track entry.id) {
                  <ion-item class="history-item">
                    <ion-label>
                      <span class="history-round">R{{ entry.roundNumber }}</span>
                      @if (entry.title) {
                        <span class="history-title"> · {{ entry.title }}</span>
                      }
                    </ion-label>
                    <ion-note slot="end" class="history-result">
                      {{ entry.winningCard ?? '–' }}
                    </ion-note>
                  </ion-item>
                }
              </ion-list>
            </section>
          }
        }
      </ion-content>

      <!-- Footer: settings + leave/end -->
      <div class="rail-footer">
        <a routerLink="/settings" class="footer-link" aria-label="Settings">
          <ion-icon name="settings-outline" aria-hidden="true"></ion-icon>
          Settings
        </a>
        <button class="footer-link footer-link--danger" (click)="onLeave()" aria-label="Leave session">
          <ion-icon name="log-out-outline" aria-hidden="true"></ion-icon>
          Leave
        </button>
        @if (isHost()) {
          <button class="footer-link footer-link--danger" (click)="onEndSession()" aria-label="End session for everyone">
            <ion-icon name="power-outline" aria-hidden="true"></ion-icon>
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
    .rail {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--ion-background-color-step-50);
      border-right: 1px solid var(--ion-color-step-100, rgba(0,0,0,0.08));
    }
    .rail-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 16px 12px;
      border-bottom: 1px solid var(--ion-color-step-100, rgba(0,0,0,0.08));
      flex-shrink: 0;
    }
    .brand {
      text-decoration: none;
      color: var(--ion-text-color);
    }
    .brand-word {
      font-family: var(--hnch-font-display);
      font-weight: 800;
      font-size: 22px;
      letter-spacing: -0.04em;
      line-height: 1;
      font-variation-settings: "opsz" 32;
    }
    .back-home {
      display: flex;
      align-items: center;
      gap: 2px;
      font-size: 13px;
      color: var(--ion-color-step-600);
      text-decoration: none;
      transition: color 0.15s;
    }
    .back-home:hover { color: var(--ion-text-color); }
    ion-content {
      --background: transparent;
      flex: 1 1 auto;
    }
    .rail-section {
      padding: 16px 16px 4px;
    }
    .rail-section + .rail-section {
      border-top: 1px solid var(--ion-color-step-100, rgba(0,0,0,0.08));
    }
    .section-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--ion-color-step-500);
      margin: 0 0 8px;
    }
    .room-code {
      font-family: var(--hnch-font-display);
      font-size: clamp(24px, 2.4vw, 32px);
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 0 0 4px;
      line-height: 1.1;
      color: var(--ion-text-color);
      font-variation-settings: "opsz" 32;
    }
    .round-descriptor {
      font-size: 13px;
      color: var(--ion-color-step-600);
      margin: 0 0 4px;
    }
    .participant-list,
    .history-list {
      --background: transparent;
      margin: 0;
    }
    .participant-item,
    .history-item {
      --background: transparent;
      --inner-padding-start: 0;
      --padding-start: 0;
      --min-height: 32px;
      font-size: 13px;
    }
    .participant-item.offline {
      opacity: 0.5;
    }
    .online-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ion-color-step-400);
      margin-inline-end: 8px;
      flex-shrink: 0;
    }
    .online-dot.online {
      background: var(--ion-color-success);
    }
    .host-icon {
      font-size: 13px;
      color: var(--ion-color-step-500);
    }
    .history-round {
      font-weight: 600;
    }
    .history-title {
      color: var(--ion-color-step-600);
    }
    .history-result {
      font-family: var(--hnch-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--ion-color-primary);
    }
    .rail-footer {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 8px 20px;
      border-top: 1px solid var(--ion-color-step-100, rgba(0,0,0,0.08));
      flex-shrink: 0;
    }
    .footer-link {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 8px;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      color: var(--ion-color-step-700);
      text-decoration: none;
      background: transparent;
      border: none;
      cursor: pointer;
      transition: background 0.12s;
      text-align: left;
      width: 100%;
    }
    .footer-link:hover {
      background: var(--ion-background-color-step-100);
    }
    .footer-link--danger {
      color: var(--ion-color-danger);
    }
    `,
  ],
})
export class SideNavComponent {
  private readonly docService = inject(DocService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly haptic = inject(HapticService);
  private readonly lastSessionService = inject(LastSessionService);
  private readonly alertCtrl = inject(AlertController);
  private readonly router = inject(Router);

  protected readonly myId = this.participantIdService.id;
  protected readonly activeParticipants = this.docService.activeParticipants;
  protected readonly onlineIds = this.docService.onlineParticipantIds;
  protected readonly rounds = this.docService.rounds;

  protected readonly hostId = computed(() => this.docService.settings()?.hostParticipantId ?? null);

  protected readonly isHost = computed(() => {
    const host = this.hostId();
    const me = this.myId();
    return !!me && !!host && me === host;
  });

  protected readonly formattedCode = computed(() => {
    if (!this.docService.hasSession()) return null;
    const code = this.docService.roomCode();
    if (!code) return null;
    // Insert dash in the middle for readability: ABC-DEF
    return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
  });

  protected readonly roundDescriptor = computed(() => {
    const settings = this.docService.settings();
    if (!settings) return '';
    const roundCount = this.rounds().length;
    const scaleName = settings.defaultScale?.id ? formatScaleId(settings.defaultScale.id) : '';
    return `Round ${roundCount + 1}${scaleName ? ` · ${scaleName}` : ''}`;
  });

  protected readonly recentRounds = computed(() => {
    const rounds = this.rounds();

    return rounds
      .filter((r) => r.revealedAt !== undefined)
      .slice(-3)
      .toReversed()
      .map((r) => {
        const roundNumber = rounds.findIndex((x) => x.id === r.id) + 1;
        const votes = Object.entries(r.votes ?? {})
          .map(([, v]) => v)
          .filter(Boolean) as string[];
        // Most common vote = winning card
        const winningCard = mostCommonVote(votes);
        return {
          id: r.id,
          roundNumber,
          title: r.title ?? null,
          winningCard,
        };
      });
  });

  protected isParticipantViewer(p: { role?: 'voter' | 'viewer' }): boolean {
    return participantRole(p) === 'viewer';
  }

  protected onLeave(): void {
    void this.alertCtrl
      .create({
        header: 'Leave session?',
        message: "You'll need the code to rejoin.",
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Leave',
            role: 'destructive',
            handler: () => {
              this.haptic.impactHeavy();
              void this.leaveSession();
            },
          },
        ],
      })
      .then((alert) => alert.present());
  }

  protected onEndSession(): void {
    void this.alertCtrl
      .create({
        header: 'End this session?',
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
      })
      .then((alert) => alert.present());
  }

  private leaveSession(): Promise<void> {
    const selfId = this.myId();
    const flush = selfId
      ? (this.docService.leaveSession(selfId), this.docService.flushUpdates())
      : Promise.resolve();
    return flush
      .then(() => {
        this.docService.endSession();
        return this.lastSessionService.clear();
      })
      .then(() => {
        void this.router.navigate(['/home']);
      });
  }
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

function formatScaleId(id: string): string {
  const map: Record<string, string> = {
    fibonacci: 'Fibonacci',
    'powers-of-2': 'Powers of 2',
    linear: 'Linear',
    risk: 'Risk',
    't-shirt': 'T-shirt',
  };
  if (id in map) return map[id]!;
  if (id.startsWith('custom-')) return 'Custom';
  return id;
}

function mostCommonVote(votes: string[]): string | null {
  if (votes.length === 0) return null;
  const freq: Record<string, number> = {};
  for (const v of votes) freq[v] = (freq[v] ?? 0) + 1;
  return Object.entries(freq).toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
