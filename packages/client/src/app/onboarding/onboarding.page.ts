import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import {
  IonButton,
  IonContent,
  IonFooter,
  IonHeader,
  IonInput,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'

import { DisplayNameService } from '../core/display-name.service'

/**
 * First-run Onboarding: capture a display name and persist it before
 * the user can reach any other screen. Wireframe in ux.md §5.1; flow
 * in §4.1. The name is attached to the ADR-0005 `participantId`
 * later, once a session is created or joined.
 *
 * Continue is disabled while the trimmed input is empty. On tap the
 * name is persisted via `DisplayNameService`, and we resume any
 * pending /join deep-link (stashed by `displayNameGuard`) or
 * otherwise navigate to /home.
 */
@Component({
  selector: 'app-onboarding',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonContent,
    IonFooter,
    IonHeader,
    IonInput,
    IonTitle,
    IonToolbar,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Welcome</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <h1 class="ion-no-margin">Welcome to hnch</h1>
      <p>Pick a name your team will see next to your votes.</p>
      <ion-input
        [formControl]="displayName"
        label="Display name"
        labelPlacement="floating"
        fill="solid"
        autocapitalize="words"
        autocomplete="name"
        enterkeyhint="done"
        maxlength="40"
        (keydown.enter)="submit()"
      ></ion-input>
      <p class="helper">You can change this later in Settings.</p>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-button
          expand="block"
          color="primary"
          [disabled]="!canContinue() || isSubmitting()"
          (click)="submit()"
        >
          Continue
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  `,
  styles: [
    `
      h1 {
        font-size: 2rem;
        font-weight: 700;
        margin-block-end: 0.75rem;
      }
      p {
        color: var(--ion-color-medium);
        margin-block-end: 1.25rem;
      }
      p.helper {
        font-size: 0.875rem;
        margin-block-start: 1rem;
      }
      ion-footer ion-toolbar {
        --background: transparent;
        --border-width: 0;
      }
    `,
  ],
})
export class OnboardingPage {
  private readonly displayNameService = inject(DisplayNameService)
  private readonly router = inject(Router)

  protected readonly displayName = new FormControl('', { nonNullable: true })

  private readonly rawValue = toSignal(this.displayName.valueChanges, {
    initialValue: this.displayName.value,
  })

  protected readonly canContinue = computed(
    () => this.rawValue().trim().length > 0,
  )

  protected readonly isSubmitting = signal(false)

  protected async submit(): Promise<void> {
    if (!this.canContinue() || this.isSubmitting()) {
      return
    }
    this.isSubmitting.set(true)
    try {
      const name = this.rawValue().trim()
      await this.displayNameService.setDisplayName(name)

      const pending = await this.displayNameService.getPendingJoinUrl()
      if (pending !== null && pending.length > 0) {
        await this.displayNameService.clearPendingJoinUrl()
        await this.router.navigateByUrl(pending)
        return
      }
      await this.router.navigate(['/home'])
    } finally {
      this.isSubmitting.set(false)
    }
  }
}
