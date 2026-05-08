import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonChip, IonItemGroup, IonLabel } from '@ionic/angular/standalone';

/**
 * VoteResultCardComponent — displays one vote-group card (glyph + voter chips).
 *
 * Extracted from VoteResultsComponent for reuse in Lobby + any future
 * results view. Receives a pre-computed voter list so the parent handles
 * name resolution and sorting.
 *
 * Inputs:
 *   card      — the card value string (rendered in Fraunces via --hnch-card-glyph)
 *   voters    — display names of voters for this card (already resolved)
 *   isWinner  — true if this card received the most votes (largest group)
 *   isMyVote  — true if the current user voted for this card
 */
@Component({
  selector: 'hnch-vote-result-card',
  standalone: true,
  imports: [IonChip, IonItemGroup, IonLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-item-group
      class="result-group"
      [class.winner]="isWinner()"
      [class.my-vote]="isMyVote()"
      [attr.aria-label]="voteCountLabel() + ' for ' + card()"
    >
      <div class="group-header">
        <span class="card-glyph">{{ card() }}</span>
        <span class="voter-count">({{ voteCountLabel() }})</span>
      </div>
      <div class="voter-chips">
        @for (name of voters(); track name) {
          <ion-chip [color]="isMyVote() ? 'primary' : undefined">
            <ion-label>{{ name }}</ion-label>
          </ion-chip>
        }
      </div>
    </ion-item-group>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .result-group {
        padding: var(--hnch-sp-3) 0;
        border-top: 1px solid var(--ion-color-step-150, rgba(0, 0, 0, 0.08));
      }
      .result-group:first-of-type {
        border-top: none;
      }
      .result-group.winner .card-glyph {
        color: var(--ion-color-primary, #0a84ff);
      }
      .group-header {
        display: flex;
        align-items: baseline;
        gap: var(--hnch-sp-2);
        margin-bottom: var(--hnch-sp-1);
      }
      .card-glyph {
        font: var(--hnch-card-glyph);
        line-height: 1;
      }
      .voter-count {
        color: var(--ion-color-medium);
        font: var(--hnch-body-sm);
      }
      .voter-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--hnch-sp-1);
      }
    `,
  ],
})
export class VoteResultCardComponent {
  readonly card = input.required<string>();
  readonly voters = input.required<readonly string[]>();
  readonly isWinner = input<boolean>(false);
  readonly isMyVote = input<boolean>(false);

  protected voteCountLabel(): string {
    const n = this.voters().length;
    return n === 1 ? '1 vote' : `${n} votes`;
  }
}
