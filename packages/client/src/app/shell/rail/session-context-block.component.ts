import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { formatRoomCode } from '@hnch/shared';

import { DocService } from '../../core/doc/doc.service';

/**
 * Session context block shown in the session rail.
 *
 * CRITICAL: reads the EXACT same DocService.currentRound() signal that
 * Lobby and Estimating pages read. Single source → rail and page always
 * agree (fixes prior round-desync bug).
 */
@Component({
  selector: 'hnch-session-context-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scb" aria-label="Session context">
      <div class="scb-eyebrow" aria-hidden="true">SESSION</div>

      @if (formattedCode()) {
        <div class="scb-code" aria-label="Room code {{ formattedCode() }}">
          {{ formattedCode() }}
        </div>
      }

      @if (roundLine()) {
        <div class="scb-round" aria-label="{{ roundLine() }}">{{ roundLine() }}</div>
      }

      @if (participants().length > 0) {
        <div class="scb-participants" aria-label="Participants">
          @for (p of participants(); track p.id) {
            <span
              class="scb-participant"
              [class.scb-participant--online]="onlineIds().has(p.id)"
              [attr.aria-label]="p.displayName + (onlineIds().has(p.id) ? ' online' : ' offline')"
            >
              <span class="scb-dot" aria-hidden="true"></span>
              {{ p.displayName }}
            </span>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .scb {
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-2, 8px);
      }

      .scb-eyebrow {
        font: var(--hnch-eyebrow);
        letter-spacing: var(--hnch-eyebrow-tracking);
        color: var(--ion-color-step-600);
        text-transform: uppercase;
      }

      .scb-code {
        font: var(--hnch-numeral-lg);
        color: var(--ion-text-color);
        letter-spacing: 0.04em;
      }

      .scb-round {
        font: var(--hnch-body-sm);
        color: var(--ion-color-step-600);
      }

      .scb-participants {
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-1, 4px);
        margin-top: var(--hnch-sp-1, 4px);
      }

      .scb-participant {
        display: flex;
        align-items: center;
        gap: var(--hnch-sp-1, 4px);
        font: var(--hnch-body-sm);
        color: var(--ion-color-step-500);

        &.scb-participant--online {
          color: var(--ion-text-color);
        }
      }

      .scb-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--ion-color-step-400);
        flex-shrink: 0;

        .scb-participant--online & {
          background: var(--ion-color-success);
        }
      }
    `,
  ],
})
export class SessionContextBlockComponent {
  private readonly docService = inject(DocService);

  /** Dash-formatted room code — same signal source as lobby page. */
  protected readonly formattedCode = computed(() => {
    const code = this.docService.roomCode();
    return code ? formatRoomCode(code) : '';
  });

  /**
   * "Round N · ScaleName" derived from the EXACT same currentRound() signal
   * that Lobby and Estimating read from DocService. No intermediate re-derive.
   */
  protected readonly roundLine = computed(() => {
    const round = this.docService.currentRound();
    const settings = this.docService.settings();
    if (!settings?.defaultScale) return '';
    const rounds = this.docService.rounds();
    const roundIndex = round ? rounds.findIndex((r) => r.id === round.id) + 1 : rounds.length + 1;
    const scaleName = formatScaleId(settings.defaultScale.id);
    return `Round ${roundIndex} · ${scaleName}`;
  });

  /** Active participants (filter on !leftAt). */
  protected readonly participants = this.docService.activeParticipants;

  /** Online participant IDs from awareness. */
  protected readonly onlineIds = this.docService.onlineParticipantIds;
}

function formatScaleId(id: string): string {
  if (id.length === 0) return id;
  return `${id.charAt(0).toUpperCase()}${id.slice(1)}`;
}
