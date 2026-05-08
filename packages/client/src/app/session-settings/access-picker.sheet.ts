import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonRadio,
  IonRadioGroup,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

/** Access modes per ADR-0009. Invite-only dropped from v1 (ADR-0017). */
export type AccessMode = 'open' | 'password';

/**
 * What the picker emits on change. `password` is only populated when
 * `mode === 'password'`; container decides whether to persist it (the
 * Phase 2 container just keeps it in a local signal since ADR-0009 is
 * a relay-side enforcement story).
 */
export interface AccessSelection {
  readonly mode: AccessMode;
  readonly password: string | null;
}

interface AccessOption {
  readonly mode: AccessMode;
  readonly label: string;
  readonly hint: string;
}

const OPTIONS: readonly AccessOption[] = [
  { mode: 'open', label: 'Open', hint: 'Anyone with the code' },
  { mode: 'password', label: 'Password', hint: 'Set a shared password' },
];

/**
 * Access picker half-sheet
 *
 * Phase 2 scope per plan §3.6: the component *renders* the picker and
 * the conditional password input, but the container doesn't write
 * anything to the Yjs doc — access control is a relay concern
 * (ADR-0009 / roadmap §7) that lands in Phase 5. Selection is still
 * emitted so the container can hold it in local state; this keeps the
 * full picker flow testable without Phase 5 infrastructure in place.
 */
@Component({
  selector: 'app-access-picker-sheet',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonRadio,
    IonRadioGroup,
    IonTitle,
    IonToolbar,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Access</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="closeRequested.emit()">Done</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding-top">
      <ion-list lines="inset">
        <ion-radio-group
          [value]="currentMode()"
          (ionChange)="onModeChange($event.detail.value)"
        >
          @for (option of options; track option.mode) {
            <ion-item>
              <ion-radio [value]="option.mode" justify="space-between">
                <ion-label>
                  <h3>{{ option.label }}</h3>
                  <ion-note>{{ option.hint }}</ion-note>
                </ion-label>
              </ion-radio>
            </ion-item>
          }
        </ion-radio-group>
      </ion-list>

      @if (currentMode() === 'password') {
        <ion-list lines="inset" class="password-list">
          <ion-item>
            <ion-label position="stacked">Password</ion-label>
            <ion-input
              [formControl]="passwordControl"
              type="password"
              autocomplete="off"
              placeholder="Required"
              (ionBlur)="onPasswordCommit()"
              (keydown.enter)="onPasswordCommit()"
            ></ion-input>
          </ion-item>
        </ion-list>
      }

    </ion-content>
  `,
  styles: [
    `
      ion-note {
        font-size: 0.85rem;
      }
      .password-list {
        margin-top: 1rem;
      }
    `,
  ],
})
export class AccessPickerSheetComponent {
  readonly currentMode = input.required<AccessMode>();

  /**
   * Seed value for the password input when the sheet opens in
   * `password` mode. Phase 2 keeps this in the container's local
   * signal so switching modes and back doesn't drop the typed value.
   */
  readonly currentPassword = input<string>('');

  readonly selected = output<AccessSelection>();
  readonly closeRequested = output<void>();

  protected readonly options = OPTIONS;

  protected readonly passwordControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.maxLength(120)],
  });

  constructor() {
    // input()s aren't available until after construction; seed the
    // form control on first ngOnInit-equivalent by listening once to
    // the initial value through a microtask. input.required is
    // computed-y, so read it inside a queueMicrotask.
    queueMicrotask(() => {
      this.passwordControl.setValue(this.currentPassword(), { emitEvent: false });
    });
  }

  protected onModeChange(mode: AccessMode | null | undefined): void {
    if (!mode) return;
    if (mode === this.currentMode()) return;
    this.selected.emit({
      mode,
      password: mode === 'password' ? this.passwordControl.value : null,
    });
  }

  /**
   * Password updates commit on blur / Enter rather than on every
   * keystroke. Container sees a single `selected` event per edit,
   * which matches the sheet's "commit on leave" pattern and keeps
   * doc writes (Phase 5) coarse-grained.
   */
  protected onPasswordCommit(): void {
    if (this.currentMode() !== 'password') return;
    this.selected.emit({
      mode: 'password',
      password: this.passwordControl.value,
    });
  }
}
