import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ParticipantSnapshot } from '@hnch/shared';
import {
  IonChip,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personCircleOutline, personRemoveOutline, starOutline } from 'ionicons/icons';

/**
 * ParticipantRowComponent — canonical participant row for lobby + session views.
 *
 * Renders avatar (initials circle or person icon fallback), display name,
 * host badge (if applicable), "You" badge, online indicator, and a trailing
 * role segment (voter / viewer). Swipe-left reveals "Remove" for hosts
 * (not applicable to self).
 *
 * Inputs:
 *   participant  — participant snapshot
 *   isMe         — whether this row is the current user
 *   canEditRole  — host or self can toggle role
 *   isHost       — whether this participant is the room host
 *   online       — whether the participant is currently online
 *
 * Outputs:
 *   roleChange  — emitted with new role when the role chip is toggled
 *   kick        — emitted when host removes via slide action
 */
@Component({
  selector: 'hnch-participant-row',
  standalone: true,
  imports: [IonChip, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-item-sliding>
      <ion-item
        class="participant-item"
        [class.offline]="!online()"
        [attr.aria-label]="ariaLabel()"
        lines="inset"
      >
        <!-- Avatar: 32px circle showing first initial -->
        <div
          slot="start"
          class="avatar"
          [attr.aria-hidden]="true"
        >
          <span class="avatar-initial">{{ initial() }}</span>
        </div>

        <!-- Name + badges -->
        <ion-label class="participant-label">
          <span class="participant-name">{{ displayName() }}</span>
          @if (isHost()) {
            <ion-icon
              name="star-outline"
              class="badge host-badge"
              aria-label="Host"
            />
          }
          @if (isMe()) {
            <span class="badge you-badge" aria-hidden="true">You</span>
          }
          @if (!online()) {
            <span class="badge offline-badge" aria-hidden="true">Offline</span>
          }
        </ion-label>

        <!-- Role chip (voter / viewer) — only when canEditRole -->
        @if (canEditRole()) {
          <ion-chip
            slot="end"
            class="role-chip"
            [color]="isViewer() ? 'medium' : 'primary'"
            [attr.aria-label]="
              isViewer()
                ? 'Observing — tap to switch to voter'
                : 'Voter — tap to switch to observer'
            "
            [attr.aria-pressed]="isViewer()"
            (click)="onRoleChipClick()"
            button
          >
            <ion-label>{{ isViewer() ? 'Observing' : 'Voter' }}</ion-label>
          </ion-chip>
        } @else {
          @if (isViewer()) {
            <span slot="end" class="role-note">observer</span>
          }
        }
      </ion-item>

      <!-- Slide option: Remove (host-only, not self) -->
      @if (canKick()) {
        <ion-item-options side="end">
          <ion-item-option
            color="danger"
            [attr.aria-label]="'Remove ' + participant().displayName + ' from session'"
            (click)="kick.emit()"
          >
            <ion-icon slot="icon-only" name="person-remove-outline" aria-hidden="true" />
          </ion-item-option>
        </ion-item-options>
      }
    </ion-item-sliding>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .participant-item {
        --min-height: 56px;
      }
      .participant-item.offline {
        opacity: 0.55;
      }
      .avatar {
        width: 32px;
        height: 32px;
        border-radius: var(--hnch-r-sm);
        background: var(--ion-color-primary-tint, rgba(0,122,255,0.12));
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-inline-end: var(--hnch-sp-3);
      }
      .avatar-initial {
        font: var(--hnch-body);
        font-weight: 600;
        color: var(--ion-color-primary, #0a84ff);
        text-transform: uppercase;
        line-height: 1;
      }
      .participant-label {
        display: flex;
        align-items: center;
        gap: var(--hnch-sp-2);
        font: var(--hnch-body);
        flex-wrap: wrap;
      }
      .participant-name {
        font-weight: 500;
      }
      .badge {
        display: inline-flex;
        align-items: center;
      }
      .host-badge {
        font-size: 14px;
        color: var(--ion-color-warning, #ffd60a);
      }
      .you-badge {
        font: var(--hnch-body-sm);
        color: var(--ion-color-step-500, rgba(60,60,67,0.5));
      }
      .offline-badge {
        font: var(--hnch-body-sm);
        color: var(--ion-color-medium);
      }
      .role-chip {
        margin: 0;
        border-radius: var(--hnch-r-xs);
        font: var(--hnch-body-sm);
        height: auto;
        min-height: 28px;
      }
      .role-note {
        font: var(--hnch-body-sm);
        color: var(--ion-color-medium);
      }
    `,
  ],
})
export class ParticipantRowComponent {
  readonly participant = input.required<ParticipantSnapshot>();
  readonly isMe = input<boolean>(false);
  /** True when this participant is the current host. */
  readonly isHost = input<boolean>(false);
  /** True when the current user can toggle this participant's role. */
  readonly canEditRole = input<boolean>(false);
  /** True when this participant is currently connected. */
  readonly online = input<boolean>(true);
  /** True when the current user can remove this participant (host action, not self). */
  readonly canKick = input<boolean>(false);

  readonly roleChange = output<'voter' | 'viewer'>();
  readonly kick = output<void>();

  readonly displayName = computed(() => this.participant().displayName);

  readonly initial = computed(() => {
    const name = this.participant().displayName;
    return name.length > 0 ? name[0] : '?';
  });

  readonly isViewer = computed(() => this.participant().role === 'viewer');

  readonly ariaLabel = computed(() => {
    const name = this.participant().displayName;
    const label = this.isMe() ? `You (${name})` : name;
    const role = this.isViewer() ? ', observer' : '';
    const online = this.online() ? '' : ', offline';
    return `${label}${role}${online}`;
  });

  protected onRoleChipClick(): void {
    const next: 'voter' | 'viewer' = this.isViewer() ? 'voter' : 'viewer';
    this.roleChange.emit(next);
  }

  constructor() {
    addIcons({ personCircleOutline, personRemoveOutline, starOutline });
  }
}
