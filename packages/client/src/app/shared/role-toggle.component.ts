import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { eyeOutline, handLeftOutline } from 'ionicons/icons';

/**
 * Voter ⇄ Observer switch for the local participant (ADR-0020).
 *
 * A real button, so it takes keyboard focus and Enter / Space — the chip it
 * replaces was click-only. It names the role you currently hold and carries
 * an icon, which is what makes it read as a control rather than as a label.
 *
 * The role is called `viewer` in the doc and "Observer" on screen.
 */
@Component({
  selector: 'app-role-toggle',
  imports: [IonButton, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-button
      class="role-toggle"
      [class.role-toggle--observer]="viewer()"
      shape="round"
      size="small"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-pressed]="viewer()"
      [attr.title]="hint()"
      (click)="toggled.emit()"
    >
      <ion-icon
        slot="start"
        [name]="viewer() ? 'eye-outline' : 'hand-left-outline'"
        aria-hidden="true"
      ></ion-icon>
      {{ viewer() ? 'Observer' : 'Voter' }}
    </ion-button>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: 0 0 auto;
      }
      .role-toggle {
        --background: rgba(var(--hnch-accent-text-rgb), 0.16);
        --background-activated: rgba(var(--hnch-accent-text-rgb), 0.28);
        --background-hover: rgba(var(--hnch-accent-text-rgb), 0.28);
        --background-hover-opacity: 1;
        --color: var(--hnch-accent-text);
        --padding-end: 12px;
        --padding-start: 10px;
        min-height: 32px;
        margin: 0;
        font-size: 0.8125rem;
      }
      .role-toggle--observer {
        --background: var(--hnch-fill);
        --background-activated: var(--hnch-fill-strong);
        --background-hover: var(--hnch-fill-strong);
        --color: var(--hnch-muted);
      }
      ion-icon {
        margin-inline-end: 4px;
        font-size: 1rem;
      }
    `,
  ],
})
export class RoleToggleComponent {
  /** True when the local participant's effective role is `viewer`. */
  readonly viewer = input.required<boolean>();

  /** The user asked to switch roles. The parent owns the write. */
  readonly toggled = output<void>();

  protected readonly hint = computed(() =>
    this.viewer() ? 'Switch to voter' : 'Switch to observer',
  );

  protected readonly ariaLabel = computed(() =>
    this.viewer() ? 'You are observing. Switch to voter.' : 'You are a voter. Switch to observer.',
  );

  constructor() {
    addIcons({ 'eye-outline': eyeOutline, 'hand-left-outline': handLeftOutline });
  }
}
