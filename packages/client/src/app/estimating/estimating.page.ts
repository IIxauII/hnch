import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { formatElapsed, participantRole, type ParticipantSnapshot } from '@hnch/shared';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonLabel,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { ellipsisHorizontalCircle } from 'ionicons/icons';

import { ConnectionChipComponent } from '../core/connection-chip.component';
import { ConnectionStatusBannerComponent } from '../shared/connection-status-banner.component';
import { DocService } from '../core/doc/doc.service';
import { HapticService } from '../core/haptic.service';
import { LastSessionService } from '../core/last-session.service';
import { assertRoomCode } from '../core/room-join.service';
import { shouldRecordCache } from '../core/cache-record-guard';
import { ParticipantIdService } from '../core/participant-id.service';
import { TimerTickService } from '../core/timer-tick.service';
import { AvatarVoteRowComponent } from './avatar-vote-row.component';
import { ActionMenuService } from '../shared/ui/action-menu.service';

/**
 * Estimating — ux.md §5.5.
 *
 * Phase D changes:
 *  - Mobile toolbar title "Round N" uses `var(--hnch-numeral-lg)` Fraunces.
 *  - Subject text uses `var(--hnch-display-md)` Fraunces directly below toolbar.
 *  - Eyebrow "round subject" above subject text.
 *  - ⋯ menu: Settings + Leave + End session.
 *  - Drop the custom back chevron — use IonBackButton defaultHref="/lobby/{code}".
 *  - CRITICAL FIX: Round N is now Fraunces (was sans in bug report).
 */
@Component({
  selector: 'app-estimating',
  host: { class: 'ion-page' },
  imports: [
    ActionMenuService,
    AvatarVoteRowComponent,
    ConnectionChipComponent,
    ConnectionStatusBannerComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonChip,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonLabel,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button
            [defaultHref]="backHref()"
            aria-label="Back to lobby"
          ></ion-back-button>
        </ion-buttons>
        <!-- Round N in Fraunces numeral-lg — CRITICAL FIX for typography bug -->
        <ion-title>
          <span class="round-title" aria-label="Round {{ roundIndex() }}">
            Round {{ roundIndex() }}
          </span>
        </ion-title>
        <ion-buttons slot="end">
          <ion-chip
            [color]="isViewer() ? 'medium' : 'primary'"
            [attr.aria-label]="isViewer() ? 'You are observing. Tap to switch to voter.' : 'You are a voter. Tap to switch to observer.'"
            [attr.aria-pressed]="isViewer()"
            (click)="onToggleRole()"
          >
            <ion-label>{{ isViewer() ? 'Observing' : 'Voter' }}</ion-label>
          </ion-chip>
          <app-connection-chip></app-connection-chip>
          <ion-button
            aria-label="More options"
            (click)="openMenu()"
          >
            <ion-icon slot="icon-only" name="ellipsis-horizontal-circle"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <app-connection-status-banner />

      @if (currentRound(); as round) {
        <!-- Subject eyebrow + Fraunces heading -->
        @if (round.title) {
          <p class="subject-eyebrow" aria-hidden="true">round subject</p>
          <h1 class="subject-title">{{ round.title }}</h1>
        }

        @if (elapsedLabel(); as label) {
          @if (isHost()) {
            <p class="elapsed elapsed--host" role="status" aria-live="off" aria-label="Elapsed time: {{ label }}">{{ label }}</p>
          } @else {
            <p class="elapsed elapsed--voter" role="status" aria-live="off" aria-label="Elapsed time: {{ label }}">{{ label }}</p>
          }
        }

        <app-avatar-vote-row
          [participants]="onlineVoterParticipants()"
          [votedIds]="votedIds()"
        />

        @if (isViewer()) {
          <p class="observer-notice" role="status" aria-live="polite">
            You're observing this round
          </p>
        } @else {
          <h2 class="cards-eyebrow">Pick your estimate</h2>

          <div class="grid" role="group" aria-label="Choose your estimate">
            @for (card of round.scale.cards; track card) {
              <ion-card
                button
                class="card"
                [class.selected]="card === myVote()"
                [attr.aria-pressed]="card === myVote()"
                [attr.aria-label]="'Card ' + card"
                (click)="onCardTap(card)"
              >
                <ion-card-content class="card-face">
                  {{ card }}
                </ion-card-content>
              </ion-card>
            }
          </div>
        }
      } @else {
        <p class="empty">No active round.</p>
      }
    </ion-content>

    @if (isHost()) {
      <ion-footer>
        <ion-toolbar>
          <ion-button
            expand="block"
            color="primary"
            [disabled]="!currentRound()"
            (click)="onReveal()"
          >
            Reveal Votes
          </ion-button>
        </ion-toolbar>
      </ion-footer>
    }
  `,
  styles: [
    `
      /* Round N in toolbar — Fraunces numeral-lg (CRITICAL FIX) */
      .round-title {
        font: var(--hnch-numeral-lg);
        letter-spacing: var(--hnch-numeral-tracking);
        font-variant-numeric: tabular-nums;
      }
      /* Subject area */
      .subject-eyebrow {
        margin: 0 0 var(--hnch-sp-1);
        font: var(--hnch-eyebrow);
        letter-spacing: var(--hnch-eyebrow-tracking);
        text-transform: uppercase;
        color: var(--hnch-muted);
      }
      .subject-title {
        margin: 0 0 var(--hnch-sp-3);
        font: var(--hnch-display-md);
        letter-spacing: var(--hnch-display-tracking);
        color: var(--hnch-text);
      }
      .elapsed {
        margin: 0 0 var(--hnch-sp-3);
        font-variant-numeric: tabular-nums;
        letter-spacing: var(--hnch-numeral-tracking);
        color: var(--ion-color-medium);
      }
      /* Host sees large elapsed timer (numeral-xl); voters see compact pill (numeral-lg) */
      .elapsed--host {
        font: var(--hnch-numeral-xl);
      }
      .elapsed--voter {
        font: var(--hnch-numeral-lg);
      }
      .cards-eyebrow {
        margin: var(--hnch-sp-4) 0 var(--hnch-sp-2);
        font: var(--hnch-eyebrow);
        letter-spacing: var(--hnch-eyebrow-tracking);
        text-transform: uppercase;
        color: var(--hnch-muted);
      }
      /* Vote card grid */
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
        gap: var(--hnch-sp-3);
      }
      @media (min-width: 768px) {
        .grid {
          grid-template-columns: repeat(auto-fit, minmax(112px, 140px));
        }
      }
      .card {
        margin: 0;
        border-radius: var(--hnch-r-lg);
        border: 2px solid transparent;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .card.selected {
        border-color: var(--ion-color-primary);
        box-shadow: var(--hnch-shadow-3);
      }
      .card-face {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 80px;
        font: var(--hnch-card-glyph);
        padding: var(--hnch-sp-4) var(--hnch-sp-2);
      }
      @media (prefers-reduced-motion: reduce) {
        .card {
          transition: none;
        }
      }
      .empty {
        color: var(--ion-color-medium);
        margin: var(--hnch-sp-7) 0;
        text-align: center;
        font: var(--hnch-body);
      }
      .observer-notice {
        margin: var(--hnch-sp-7) 0;
        text-align: center;
        color: var(--ion-color-medium);
        font: var(--hnch-body);
      }
    `,
  ],
})
export class EstimatingPage {
  private readonly router = inject(Router);
  private readonly docService = inject(DocService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly haptic = inject(HapticService);
  private readonly lastSessionService = inject(LastSessionService);
  private readonly timerTick = inject(TimerTickService);
  private readonly alertCtrl = inject(AlertController);
  private readonly actionMenuService = inject(ActionMenuService);

  protected readonly currentRound = this.docService.currentRound;
  protected readonly onlineParticipants = this.docService.onlineParticipants;

  private lastRecordedUuid: string | null = null;

  constructor() {
    addIcons({ ellipsisHorizontalCircle });

    effect(() => {
      const code = this.docService.roomCode();
      const uuid = this.docService.meta()?.roomUuid;
      const status = this.docService.syncStatus();
      if (status !== 'connected') {
        this.lastRecordedUuid = null;
        return;
      }
      if (shouldRecordCache(code, uuid, status, this.lastRecordedUuid)) {
        this.lastRecordedUuid = uuid ?? null;
        void this.lastSessionService.record({
          roomCode: code!,
          roomUuid: uuid!,
          lastScreen: 'estimating',
        });
      }
    });

    effect(() => {
      const round = this.docService.currentRound();
      if (round?.revealedAt !== undefined) {
        const activeCode = this.docService.roomCode();
        assertRoomCode(activeCode, 'estimating.autoNav');
        void this.router.navigate(['/lobby', activeCode], { replaceUrl: true });
      }
    });

    effect(() => {
      const round = this.docService.currentRound();
      const onlineVoterIds = this.onlineVoterIds();
      if (shouldAutoReveal(round, onlineVoterIds)) {
        this.haptic.notificationSuccess();
        this.docService.revealRound(round!.id);
      }
    });
  }

  private readonly myId = this.participantIdService.id;

  protected readonly roundIndex = computed(() => {
    const round = this.currentRound();
    if (!round) return null;
    const rounds = this.docService.rounds();
    const idx = rounds.findIndex((r) => r.id === round.id);
    return idx >= 0 ? idx + 1 : null;
  });

  /** Back href — `/lobby/{code}` when code is known, else `/home`. */
  protected readonly backHref = computed(() => {
    const code = this.docService.roomCode();
    return code ? `/lobby/${code}` : '/home';
  });

  protected readonly myVote = computed<string | null>(() => {
    const id = this.myId();
    const round = this.currentRound();
    if (!id || !round) return null;
    return round.votes[id] ?? null;
  });

  protected readonly votedIds = computed<ReadonlySet<string>>(() => {
    const round = this.currentRound();
    if (!round) return new Set();
    const voterIds = this.onlineVoterIds();
    return new Set(Object.keys(round.votes).filter((id) => voterIds.has(id)));
  });

  protected readonly onlineVoterIds = computed<ReadonlySet<string>>(() => {
    const online = this.docService.onlineParticipantIds();
    const activeParticipants = this.docService.activeParticipants();
    return new Set(
      activeParticipants
        .filter((p) => online.has(p.id) && participantRole(p) !== 'viewer')
        .map((p) => p.id),
    );
  });

  protected readonly onlineVoterParticipants = computed<readonly ParticipantSnapshot[]>(() => {
    const voterIds = this.onlineVoterIds();
    const activeParticipants = this.docService.activeParticipants();
    return activeParticipants.filter((p) => voterIds.has(p.id));
  });

  protected readonly isHost = computed(() => {
    const myId = this.myId();
    const hostId = this.docService.settings()?.hostParticipantId;
    return !!myId && !!hostId && myId === hostId;
  });

  protected readonly isViewer = computed(() => {
    const myId = this.myId();
    if (!myId) return false;
    const me = this.docService.activeParticipants().find((p) => p.id === myId);
    return me ? participantRole(me) === 'viewer' : false;
  });

  protected readonly elapsedLabel = computed<string | null>(() => {
    const round = this.docService.currentRound();
    if (!round || round.timerStartedAt === undefined) return null;
    const elapsed = this.timerTick.now() - round.timerStartedAt;
    return formatElapsed(Math.max(0, elapsed));
  });

  protected onToggleRole(): void {
    const id = this.myId();
    if (!id) return;
    this.haptic.impactLight();
    this.docService.toggleRole(id);
  }

  protected onCardTap(card: string): void {
    const id = this.myId();
    const round = this.currentRound();
    if (!id || !round) return;

    if (this.myVote() === card) {
      this.docService.clearVote(round.id, id);
    } else {
      this.docService.castVote(round.id, id, card);
    }
    this.haptic.impactLight();
  }

  protected async onReveal(): Promise<void> {
    const round = this.currentRound();
    if (!round) return;
    this.haptic.impactMedium();
    this.docService.revealRound(round.id);
    const code = this.docService.roomCode();
    assertRoomCode(code, 'estimating.onReveal');
    await this.router.navigate(['/lobby', code], { replaceUrl: true });
  }

  protected async openMenu(): Promise<void> {
    const items: { id: string; label: string; role?: 'destructive' | 'cancel' }[] = [
      { id: 'leave', label: 'Leave session', role: 'destructive' },
    ];

    if (this.isHost()) {
      items.splice(0, 0, { id: 'end', label: 'End session for everyone', role: 'destructive' });
    }

    items.push({ id: 'cancel', label: 'Cancel', role: 'cancel' });

    const id = await this.actionMenuService.open(items, { header: 'Session' });
    switch (id) {
      case 'leave':
        await this.confirmLeave();
        break;
      case 'end':
        await this.confirmEndSession();
        break;
    }
  }

  private async confirmLeave(): Promise<void> {
    const alert = await this.alertCtrl.create({
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
    });
    await alert.present();
  }

  private async leaveSession(): Promise<void> {
    const selfId = this.myId();
    if (selfId) {
      this.docService.leaveSession(selfId);
      await this.docService.flushUpdates();
    }
    this.docService.endSession();
    await this.lastSessionService.clear();
    await this.router.navigate(['/home']);
  }

  private async confirmEndSession(): Promise<void> {
    const alert = await this.alertCtrl.create({
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
    });
    await alert.present();
  }
}

// ---------------------------------------------------------------------------
/**
 * Pure predicate: should the current round auto-reveal?
 */
export function shouldAutoReveal(
  round:
    | { readonly id: string; readonly revealedAt?: number; readonly votes: Record<string, string> }
    | null
    | undefined,
  onlineVoterIds: ReadonlySet<string>,
): boolean {
  if (!round || round.revealedAt !== undefined) return false;
  if (onlineVoterIds.size === 0) return false;
  const votedCount = Object.keys(round.votes).filter((id) => onlineVoterIds.has(id)).length;
  return votedCount >= onlineVoterIds.size;
}
