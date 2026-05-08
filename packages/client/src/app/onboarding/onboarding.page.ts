import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonFooter,
  IonInput,
  IonItem,
  IonList,
} from '@ionic/angular/standalone';

import { DisplayNameService } from '../core/display-name.service';

/**
 * First-run Onboarding: capture a display name and persist it before
 * the user can reach any other screen. The name is attached to the
 * ADR-0005 `participantId` later, once a session is created or joined.
 *
 * Continue is disabled while the trimmed input is empty. On tap the
 * name is persisted via `DisplayNameService`, and we resume any
 * pending /join deep-link (stashed by `displayNameGuard`) or
 * otherwise navigate to /home.
 *
 * Rail is hidden on /onboarding (Phase B). Page body is full-bleed centered.
 * No toolbar — hero fills the viewport.
 */
@Component({
  selector: 'app-onboarding',
  host: { class: 'ion-page' },
  imports: [IonButton, IonContent, IonFooter, IonInput, IonItem, IonList, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content>
      <div class="onboarding-wrap">
        <div class="hero">
          <p class="eyebrow" aria-hidden="true">welcome to</p>
          <h1 class="wordmark" aria-label="hnch">hnch</h1>
          <p class="hero-sub">Pick a name your team will see next to your votes.</p>
        </div>

        <ion-list inset="true" class="name-list">
          <ion-item lines="none">
            <ion-input
              [formControl]="displayName"
              label="Display name"
              labelPlacement="stacked"
              autocapitalize="words"
              autocomplete="name"
              enterkeyhint="done"
              maxlength="40"
              placeholder="Your name"
              aria-label="Display name"
              (keydown.enter)="submit()"
            ></ion-input>
          </ion-item>
        </ion-list>
        <p class="hint">You can change this later in Settings.</p>
      </div>
    </ion-content>

    <ion-footer>
      <div class="footer-inner">
        <ion-button
          expand="block"
          size="large"
          class="continue-btn"
          [disabled]="!canContinue() || isSubmitting()"
          (click)="submit()"
          aria-label="Continue to app"
        >
          Continue
        </ion-button>
      </div>
    </ion-footer>
  `,
  styles: [
    `
      ion-content {
        --background: var(--hnch-bg);
      }
      .onboarding-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--hnch-sp-9) var(--hnch-sp-5) var(--hnch-sp-6);
        max-width: 480px;
        margin: 0 auto;
      }
      .hero {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        width: 100%;
        gap: var(--hnch-sp-2);
        padding-block-end: var(--hnch-sp-7);
      }
      .eyebrow {
        margin: 0;
        font: var(--hnch-eyebrow);
        letter-spacing: var(--hnch-eyebrow-tracking);
        text-transform: uppercase;
        color: var(--hnch-muted);
      }
      .wordmark {
        margin: 0;
        font: var(--hnch-display-xl);
        letter-spacing: var(--hnch-display-tracking);
        color: var(--hnch-text);
        line-height: 1;
      }
      .hero-sub {
        margin: var(--hnch-sp-2) 0 0;
        font: var(--hnch-body);
        color: var(--hnch-muted);
      }
      .name-list {
        width: 100%;
        background: transparent;
        margin: 0;
        padding: 0;
      }
      ion-item {
        --background: var(--hnch-surface);
        --border-radius: var(--hnch-r-md);
        --border-color: var(--hnch-muted-2);
        --inner-padding-top: var(--hnch-sp-2);
        --inner-padding-bottom: var(--hnch-sp-2);
      }
      .hint {
        margin: var(--hnch-sp-2) var(--hnch-sp-5) 0;
        align-self: flex-start;
        font: var(--hnch-body-sm);
        color: var(--hnch-muted);
      }
      ion-footer {
        --background: var(--hnch-bg);
        box-shadow: none;
      }
      .footer-inner {
        display: flex;
        justify-content: center;
        padding: var(--hnch-sp-3) var(--hnch-sp-5) var(--hnch-sp-6);
      }
      .continue-btn {
        width: 100%;
        max-width: 320px;
        font: var(--hnch-title);
        --border-radius: var(--hnch-r-sm);
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
