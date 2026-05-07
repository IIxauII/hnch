import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
} from '@angular/core'
import { Router } from '@angular/router'
import { formatElapsed, participantRole, type ParticipantSnapshot } from '@hnch/shared'
import {
  AlertController,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonChip,
  IonCol,
  IonContent,
  IonFooter,
  IonGrid,
  IonHeader,
  IonIcon,
  IonLabel,
  IonRow,
  IonTitle,
  IonToolbar,
  PopoverController,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { chevronBackOutline, ellipsisHorizontalCircle } from 'ionicons/icons'

import { KeyboardShortcutService } from '../services/keyboard-shortcut.service'
import { ConnectionChipComponent } from '../core/connection-chip.component'
import { ConnectionStatusBannerComponent } from '../shared/connection-status-banner.component'
import { DocService } from '../core/doc/doc.service'
import { HapticService } from '../core/haptic.service'
import { LastSessionService } from '../core/last-session.service'
import { assertRoomCode } from '../core/room-join.service'
import { shouldRecordCache } from '../core/cache-record-guard'
import { ParticipantIdService } from '../core/participant-id.service'
import { TimerTickService } from '../core/timer-tick.service'
import { AvatarVoteRowComponent } from './avatar-vote-row.component'
import { OverflowMenuComponent, type OverflowMenuItem } from '../shared/overflow-menu.component'

/**
 * Estimating — ux.md §5.5.
 *
 * Pick-your-card screen. Presence of a vote is public (shown in the
 * avatar row); the value stays hidden until reveal.
 *
 * Features:
 *  - Title "Round N" uses the current round's 1-based index.
 *  - Elapsed time stopwatch counting up from round start.
 *  - Card grid with tap-to-vote / tap-again-to-unvote (ADR-0013).
 *  - Unanimous auto-reveal: when all online participants have voted,
 *    `revealedAt` is written automatically (ADR-0018).
 *  - Host-only manual Reveal button.
 *  - Auto-navigation to Lobby (with inline results) when `revealedAt` is written.
 */
@Component({
  selector: 'app-estimating',
  host: { class: 'ion-page' },
  imports: [
    AvatarVoteRowComponent,
    ConnectionChipComponent,
    ConnectionStatusBannerComponent,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonChip,
    IonCol,
    IonContent,
    IonFooter,
    IonGrid,
    IonHeader,
    IonIcon,
    IonLabel,
    IonRow,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button
            aria-label="Back to lobby"
            (click)="softExit()"
          >
            <ion-icon
              slot="icon-only"
              name="chevron-back-outline"
            ></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>Estimating</ion-title>
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
            (click)="openActionSheet($event)"
          >
            <ion-icon slot="icon-only" name="ellipsis-horizontal-circle"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div class="page-shell">
      <app-connection-status-banner />
      @if (currentRound(); as round) {

        <!-- Round card -->
        <ion-card class="section-card">
          <ion-card-header>
            <ion-card-title>
              <h1 class="title">Round {{ roundIndex() }}</h1>
            </ion-card-title>
            @if (round.title) {
              <p class="descriptor">{{ round.title }}</p>
            }
            @if (elapsedLabel(); as label) {
              <p class="elapsed" role="status" aria-live="off">{{ label }}</p>
            }
          </ion-card-header>
          <ion-card-content>
            <app-avatar-vote-row
              [participants]="onlineVoterParticipants()"
              [votedIds]="votedIds()"
            />
          </ion-card-content>
        </ion-card>

        <!-- Vote card -->
        <ion-card class="section-card">
          <ion-card-header>
            <ion-card-title>Cast your vote</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            @if (isViewer()) {
              <p class="observer-notice" role="status" aria-live="polite">
                You're observing this round
              </p>
            } @else {
              <ion-grid class="grid" role="group" aria-label="Choose your estimate">
                <ion-row>
                  @for (card of round.scale.cards; track card) {
                    <ion-col size="4" size-md="3">
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
                    </ion-col>
                  }
                </ion-row>
              </ion-grid>
            }
          </ion-card-content>
        </ion-card>

      } @else {
        <p class="empty">No active round.</p>
      }
      </div>
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
      /* Section cards */
      .section-card {
        margin: 0 0 1rem;
        border: 1px solid var(--hnch-sep);
        background: var(--hnch-surface);
      }
      .section-card ion-card-header {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .title {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0.25rem 0 0.25rem;
        display: inline;
      }
      .descriptor {
        margin: 0.25rem 0 0;
        color: var(--ion-color-medium);
      }
      .elapsed {
        font-size: 2rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        margin: 0.5rem 0 0;
        color: var(--ion-color-medium);
      }
      .grid {
        --ion-grid-padding: 0;
        --ion-grid-column-padding: 0.5rem;
      }
      @media (min-width: 1024px) {
        .grid ion-col { flex: 0 0 20%; max-width: 20%; }
      }
      .card {
        margin: 0;
        border: 2px solid transparent;
        transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
      }
      .card.selected {
        border-color: var(--ion-color-primary);
        background: var(--ion-color-primary-tint);
      }
      .card-face {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 4.5rem;
        font-size: 1.75rem;
        font-weight: 700;
      }
      @media (prefers-reduced-motion: reduce) {
        .card {
          transition: none;
        }
      }
      @media (hover: hover) and (pointer: fine) {
        .card:not(.selected):hover {
          transform: translateY(-2px);
          border-color: var(--ion-color-primary-tint);
        }
        @media (prefers-reduced-motion: reduce) {
          .card:not(.selected):hover {
            transform: none;
          }
        }
      }
      @media (min-width: 768px) {
        .card-face {
          min-height: 5.5rem;
          font-size: 2rem;
        }
      }
      .empty {
        color: var(--ion-color-medium);
        margin: 2rem 0;
        text-align: center;
      }
      .observer-notice {
        margin: 2rem 0;
        text-align: center;
        color: var(--ion-color-medium);
        font-size: 1.1rem;
      }
    `,
  ],
})
export class EstimatingPage implements OnInit, OnDestroy {
  private readonly router = inject(Router)
  private readonly docService = inject(DocService)
  private readonly participantIdService = inject(ParticipantIdService)
  private readonly haptic = inject(HapticService)
  private readonly lastSessionService = inject(LastSessionService)
  private readonly timerTick = inject(TimerTickService)
  private readonly popoverCtrl = inject(PopoverController)
  private readonly alertCtrl = inject(AlertController)
  private readonly shortcuts = inject(KeyboardShortcutService)

  private unregisterShortcuts: (() => void) | null = null

  protected readonly currentRound = this.docService.currentRound
  protected readonly onlineParticipants = this.docService.onlineParticipants

  // Tracks the last uuid written to the cache so the effect does not
  // re-fire on every Yjs doc mutation while connected to the same room.
  // Reset to null when status leaves 'connected' so a reconnect
  // re-writes and bumps the TTL.
  private lastRecordedUuid: string | null = null

  constructor() {
    addIcons({
      'chevron-back-outline': chevronBackOutline,
      'ellipsis-horizontal-circle': ellipsisHorizontalCircle,
    })

    // Bump `hnch.lastSession` so a reopen lands on Estimating rather
    // than Lobby (plan §3.8). Deduped via lastRecordedUuid so we don't
    // write on every Yjs doc mutation while staying connected
    // (ADR-0022 §5).
    effect(() => {
      const code = this.docService.roomCode()
      const uuid = this.docService.meta()?.roomUuid
      const status = this.docService.syncStatus()
      if (status !== 'connected') {
        this.lastRecordedUuid = null
        return
      }
      if (shouldRecordCache(code, uuid, status, this.lastRecordedUuid)) {
        this.lastRecordedUuid = uuid ?? null
        void this.lastSessionService.record({
          roomCode: code!,
          roomUuid: uuid!,
          lastScreen: 'estimating',
        })
      }
    })

    // Auto-navigate to Lobby when `revealedAt` is written — covers
    // unanimous auto-reveal and host manual reveal. Scoped to this
    // component's lifetime.
    effect(() => {
      const round = this.docService.currentRound()
      if (round?.revealedAt !== undefined) {
        const activeCode = this.docService.roomCode()
        assertRoomCode(activeCode, 'estimating.autoNav')
        void this.router.navigate(['/lobby', activeCode], { replaceUrl: true })
      }
    })

    // Unanimous auto-reveal: when all online voters have voted,
    // write `revealedAt`. Guard: require at least 1 online voter (ADR-0018).
    effect(() => {
      const round = this.docService.currentRound()
      const onlineVoterIds = this.onlineVoterIds()
      if (shouldAutoReveal(round, onlineVoterIds)) {
        this.haptic.notificationSuccess()
        this.docService.revealRound(round!.id)
      }
    })
  }

  private readonly myId = this.participantIdService.id

  /**
   * 1-based index of the current round within `rounds()`. Re-votes and
   * Next Round both append, so the array-index lookup is exact. Returns
   * `null` when there's no active round (transient — we just navigated
   * in).
   */
  protected readonly roundIndex = computed(() => {
    const round = this.currentRound()
    if (!round) return null
    const rounds = this.docService.rounds()
    const idx = rounds.findIndex((r) => r.id === round.id)
    return idx >= 0 ? idx + 1 : null
  })

  /** The current user's card, or `null` when they haven't voted yet. */
  protected readonly myVote = computed<string | null>(() => {
    const id = this.myId()
    const round = this.currentRound()
    if (!id || !round) return null
    return round.votes[id] ?? null
  })

  /**
   * Set of participantIds that have a vote in the current round,
   * filtered against awareness. A peer that cast a vote and then
   * silently dropped (no close frame, just a dead connection) keeps
   * its entry in `round.votes` — ADR-0011 treats the cast vote as
   * authoritative — but we don't want the avatar row to keep showing
   * them as "voted" when the tally won't include them on reveal.
   * Revealed chips (§3.7) intentionally skip this filter because
   * there the tally *is* the post-reveal record.
   */
  protected readonly votedIds = computed<ReadonlySet<string>>(() => {
    const round = this.currentRound()
    if (!round) return new Set()
    const voterIds = this.onlineVoterIds()
    return new Set(Object.keys(round.votes).filter((id) => voterIds.has(id)))
  })

  protected readonly onlineVoterIds = computed<ReadonlySet<string>>(() => {
    const online = this.docService.onlineParticipantIds()
    const activeParticipants = this.docService.activeParticipants()
    return new Set(
      activeParticipants
        .filter((p) => online.has(p.id) && participantRole(p) !== 'viewer')
        .map((p) => p.id),
    )
  })

  protected readonly onlineVoterParticipants = computed<readonly ParticipantSnapshot[]>(() => {
    const voterIds = this.onlineVoterIds()
    const activeParticipants = this.docService.activeParticipants()
    return activeParticipants.filter((p) => voterIds.has(p.id))
  })

  protected readonly isHost = computed(() => {
    const myId = this.myId()
    const hostId = this.docService.settings()?.hostParticipantId
    return !!myId && !!hostId && myId === hostId
  })

  /** True when the current user's effective role is `'viewer'`. */
  protected readonly isViewer = computed(() => {
    const myId = this.myId()
    if (!myId) return false
    const me = this.docService.activeParticipants().find((p) => p.id === myId)
    return me ? participantRole(me) === 'viewer' : false
  })

  /**
   * Elapsed voting time label (M:SS counting up), or `null` before the
   * round's stopwatch has started. Driven by the 4 Hz wall-clock tick.
   */
  protected readonly elapsedLabel = computed<string | null>(() => {
    const round = this.docService.currentRound()
    if (!round || round.timerStartedAt === undefined) return null
    const elapsed = this.timerTick.now() - round.timerStartedAt
    return formatElapsed(Math.max(0, elapsed))
  })

  ngOnInit(): void {
    const handlers: Partial<Record<string, () => void>> = {
      r: () => {
        const r = this.currentRound()
        if (this.isHost() && r && !r.revealedAt) void this.onReveal()
      },
      escape: () => {
        const vote = this.myVote()
        if (vote !== null) this.onCardTap(vote)
      },
    }

    // Wire 1–9 to cards by 1-based position.
    for (let i = 1; i <= 9; i++) {
      const pos = i
      handlers[String(pos)] = () => {
        const cards = this.currentRound()?.scale.cards
        if (!cards) return
        const card = cards[pos - 1]
        if (card !== undefined) this.onCardTap(card)
      }
    }

    this.unregisterShortcuts = this.shortcuts.register(handlers)
  }

  ngOnDestroy(): void {
    this.unregisterShortcuts?.()
  }

  protected onToggleRole(): void {
    const id = this.myId()
    if (!id) return
    this.haptic.impactLight()
    this.docService.toggleRole(id)
  }

  protected onCardTap(card: string): void {
    const id = this.myId()
    const round = this.currentRound()
    if (!id || !round) return

    if (this.myVote() === card) {
      this.docService.clearVote(round.id, id)
    } else {
      this.docService.castVote(round.id, id, card)
    }
    this.haptic.impactLight()
  }

  protected async onReveal(): Promise<void> {
    const round = this.currentRound()
    if (!round) return
    this.haptic.impactMedium()
    this.docService.revealRound(round.id)
    const code = this.docService.roomCode()
    assertRoomCode(code, 'estimating.onReveal')
    // replaceUrl: back-nav from Lobby (results view) should pop to the
    // screen before Estimating, not bounce back here (plan §3.10).
    await this.router.navigate(['/lobby', code], { replaceUrl: true })
  }

  /**
   * Soft exit — back-chevron path. Navigates back to Lobby in the SAME
   * session WITHOUT clearing the cache. Does not tear down the WebSocket.
   */
  protected softExit(): void {
    const code = this.docService.roomCode()
    assertRoomCode(code, 'estimating.softExit')
    void this.router.navigate(['/lobby', code])
  }

  protected async openActionSheet(event: MouseEvent): Promise<void> {
    const items: OverflowMenuItem[] = [
      { id: 'session-settings', label: 'Session settings' },
    ]

    if (this.isHost()) {
      items.push({ id: 'end-session', label: 'End session for everyone', role: 'destructive' })
    }

    items.push({ id: 'leave-session', label: 'Leave session', role: 'destructive' })

    const popover = await this.popoverCtrl.create({
      component: OverflowMenuComponent,
      componentProps: { items },
      event,
    })
    await popover.present()

    const { data } = await popover.onDidDismiss<string>()
    if (!data) return

    switch (data) {
      case 'session-settings': {
        // Session settings sheet lives on Lobby; navigate there.
        const code = this.docService.roomCode()
        assertRoomCode(code, 'estimating.openActionSheet[Session settings]')
        void this.router.navigate(['/lobby', code])
        break
      }
      case 'end-session':
        void this.confirmEndSession()
        break
      case 'leave-session':
        void this.confirmLeave()
        break
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
            this.haptic.impactHeavy()
            void this.leaveSession()
          },
        },
      ],
    })
    await alert.present()
  }

  private async leaveSession(): Promise<void> {
    const selfId = this.myId()
    if (selfId) {
      // Write the soft-delete before disconnecting so peers see the removal (ADR-0036).
      this.docService.leaveSession(selfId)
      // Flush the Yjs update through the WebSocket before closing (best-effort, 500 ms cap).
      await this.docService.flushUpdates()
    }
    this.docService.endSession()
    // Destructive leave — clear cache so Jump-back-in banner does not reappear (ADR-0022).
    await this.lastSessionService.clear()
    await this.router.navigate(['/home'])
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
            this.haptic.impactHeavy()
            this.docService.endSessionForEveryone()
          },
        },
      ],
    })
    await alert.present()
  }
}

// ---------------------------------------------------------------------------
/**
 * Pure predicate: should the current round auto-reveal?
 * Guards: round must exist + not already revealed, at least 1 online voter,
 * all online voters have voted.
 */
export function shouldAutoReveal(
  round: { readonly id: string; readonly revealedAt?: number; readonly votes: Record<string, string> } | null | undefined,
  onlineVoterIds: ReadonlySet<string>,
): boolean {
  if (!round || round.revealedAt !== undefined) return false
  if (onlineVoterIds.size === 0) return false
  const votedCount = Object.keys(round.votes).filter((id) => onlineVoterIds.has(id)).length
  return votedCount >= onlineVoterIds.size
}
