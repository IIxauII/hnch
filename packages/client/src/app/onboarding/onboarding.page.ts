import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonToolbar,
} from '@ionic/angular/standalone';

import { DisplayNameService } from '../core/display-name.service';
import { BrandMarkComponent } from '../shared/brand-mark.component';
import { canContinue } from './onboarding.helpers';

/**
 * First-run Onboarding: capture a display name and persist it before
 * the user can reach any other screen (ux.md §1.1). The name is attached
 * to the ADR-0005 `participantId` later, once a session is created or
 * joined.
 *
 * Continue sits directly under the field it submits, on every surface, so it
 * stays in view above an on-screen keyboard and next to the input on a wide
 * one. It is disabled while the trimmed input is empty. On tap the name is
 * persisted via `DisplayNameService`, and we resume any pending /join
 * deep-link (stashed by `displayNameGuard`) or otherwise navigate to /home.
 */
@Component({
  selector: 'app-onboarding',
  host: { class: 'ion-page' },
  imports: [
    BrandMarkComponent,
    IonButton,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonList,
    IonToolbar,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Empty on purpose: the header only reserves the top safe area. -->
    <ion-header class="ion-no-border">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="page-container">
        <div class="hero">
          <app-brand-mark [size]="64" />
          <h1>Welcome to hnch</h1>
          <p class="subtitle">
            Planning poker for your team. Pick the name they'll see next to your votes.
          </p>
        </div>

        <ion-list inset="true" lines="none">
          <ion-item>
            <ion-input
              [formControl]="displayName"
              label="Display name"
              labelPlacement="stacked"
              autocapitalize="words"
              autocomplete="name"
              enterkeyhint="done"
              maxlength="40"
              placeholder="Your name"
              (keydown.enter)="submit()"
            ></ion-input>
          </ion-item>
        </ion-list>
        <p class="hint">You can change this later in Settings.</p>

        <ion-button
          expand="block"
          class="continue-btn"
          [disabled]="!canContinue() || isSubmitting()"
          (click)="submit()"
        >
          Continue
        </ion-button>
      </div>
    </ion-content>
  `,
  styles: [
    `
      @use '../../theme/page-container' as *;
      @include page-container(480px);

      .hero {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 24px 4px 28px;
      }
      h1 {
        margin: 0;
        color: var(--hnch-text);
        font-size: 34px;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.1;
      }
      .subtitle {
        margin: 0;
        color: var(--hnch-muted);
        font-size: 17px;
        line-height: 1.4;
      }
      ion-list {
        margin-block: 0;
      }
      .hint {
        margin: 8px 16px 0;
        color: var(--hnch-muted);
        font-size: 13px;
        line-height: 1.4;
      }
      .continue-btn {
        min-height: 50px;
        margin: 24px 0 0;
        font-size: 17px;
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

  protected readonly canContinue = computed(() => canContinue(this.rawValue()));

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
