import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonInput } from '@ionic/angular/standalone';

import { DisplayNameService } from '../core/display-name.service';

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
  imports: [IonButton, IonContent, IonInput, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <div class="frame">
        <div class="hero">
          <h1 class="hero-mark">hnch</h1>
          <p class="hero-tag">Estimate by hunch.</p>
        </div>
        <div class="card">
          <span class="eyebrow">Welcome</span>
          <h2 class="prompt">What should the team call you?</h2>
          <ion-input
            [formControl]="displayName"
            class="name-input"
            fill="outline"
            shape="round"
            autocapitalize="words"
            autocomplete="name"
            enterkeyhint="done"
            maxlength="40"
            placeholder="Your name"
            (keydown.enter)="submit()"
          ></ion-input>
          <p class="hint">You can change this later in Settings.</p>
          <ion-button
            class="continue-btn"
            shape="round"
            size="large"
            [disabled]="!canContinue() || isSubmitting()"
            (click)="submit()"
          >
            Continue
          </ion-button>
        </div>
      </div>
    </ion-content>
  `,
  styles: [
    `
      ion-content {
        --background: var(--ion-background-color);
      }
      .frame {
        max-width: 560px;
        margin: 0 auto;
        padding: clamp(48px, 10vw, 120px) 24px clamp(32px, 5vw, 64px);
        display: flex;
        flex-direction: column;
        gap: clamp(32px, 6vw, 56px);
        min-height: 100%;
        box-sizing: border-box;
      }
      .hero {
        text-align: center;
      }
      .hero-mark {
        font-family: var(--hnch-font-display);
        font-weight: 800;
        font-size: clamp(64px, 12vw, 144px);
        line-height: 0.9;
        letter-spacing: -0.04em;
        margin: 0 0 8px;
        font-variation-settings: 'opsz' 144;
        color: var(--ion-text-color);
      }
      .hero-tag {
        font-family: var(--hnch-font-display);
        font-style: italic;
        font-weight: 400;
        font-size: clamp(15px, 1.4vw, 20px);
        color: var(--ion-color-step-600);
        margin: 0;
      }
      .card {
        background: var(--ion-background-color-step-50);
        border-radius: 22px;
        padding: clamp(28px, 4vw, 40px);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .eyebrow {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ion-color-step-600);
      }
      .prompt {
        font-family: var(--hnch-font-display);
        font-weight: 700;
        font-size: clamp(24px, 3vw, 32px);
        line-height: 1.15;
        letter-spacing: -0.02em;
        margin: 0 0 8px;
        color: var(--ion-text-color);
      }
      .name-input {
        --background: var(--ion-background-color);
        --border-radius: 12px;
        --padding-start: 16px;
        --padding-end: 16px;
        font-size: 17px;
      }
      .hint {
        font-size: 13px;
        color: var(--ion-color-step-600);
        margin: 4px 0 16px;
      }
      .continue-btn {
        align-self: stretch;
        --border-radius: 14px;
      }
    `,
  ],
})
export class OnboardingPage {
  private readonly displayNameService = inject(DisplayNameService);
  private readonly router = inject(Router);

  protected readonly displayName = new FormControl('', { nonNullable: true });

  private readonly rawValue = toSignal(this.displayName.valueChanges, {
    initialValue: this.displayName.value,
  });

  protected readonly canContinue = computed(() => this.rawValue().trim().length > 0);

  protected readonly isSubmitting = signal(false);

  protected async submit(): Promise<void> {
    if (!this.canContinue() || this.isSubmitting()) {
      return;
    }
    this.isSubmitting.set(true);
    try {
      const name = this.rawValue().trim();
      await this.displayNameService.setDisplayName(name);

      const pending = await this.displayNameService.getPendingJoinUrl();
      if (pending !== null && pending.length > 0) {
        await this.displayNameService.clearPendingJoinUrl();
        await this.router.navigateByUrl(pending);
        return;
      }
      await this.router.navigate(['/home']);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
