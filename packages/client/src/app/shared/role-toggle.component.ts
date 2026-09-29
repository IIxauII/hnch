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
 * Its name starts with the word on it, so "click Voter" finds it, and goes on
 * to say where a press leads. It is not a pressed / unpressed toggle: those
 * keep one name and change state, and this one changes its name.
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
        --ring: var(--hnch-accent-text);
        --background: rgba(var(--hnch-accent-text-rgb), 0.16);
        --background-activated-opacity: 0;
        --background-focused-opacity: 0;
        --background-hover-opacity: 0;
        --color: var(--hnch-accent-text);
        --padding-end: 12px;
        --padding-start: 10px;
        min-height: 32px;
        margin: 0;
        font-size: 0.8125rem;
      }
      .role-toggle--observer {
        --ring: var(--hnch-muted);
        --background: var(--hnch-fill);
        --color: var(--hnch-muted);
      }
      /* Hover, focus and press draw a ring. A deeper tint would do, but it
         moves the background toward the label and the label below AA. */
      .role-toggle.ion-focused,
      .role-toggle.ion-activated {
        --box-shadow: inset 0 0 0 1.5px var(--ring);
      }
      @media (hover: hover) and (pointer: fine) {
        .role-toggle:hover {
          --box-shadow: inset 0 0 0 1.5px var(--ring);
        }
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
    this.viewer() ? 'Observer. Switch to voter.' : 'Voter. Switch to observer.',
  );

  constructor() {
    addIcons({ 'eye-outline': eyeOutline, 'hand-left-outline': handLeftOutline });
  }
}
