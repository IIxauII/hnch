import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonCol,
  IonContent,
  IonFooter,
  IonGrid,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonRow,
  IonToolbar,
} from '@ionic/angular/standalone';

import { DisplayNameService } from '../core/display-name.service';
import { BrandMarkComponent } from '../shared/brand-mark.component';

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
    BrandMarkComponent,
    IonButton,
    IonCol,
    IonContent,
    IonFooter,
    IonGrid,
    IonHeader,
    IonInput,
    IonItem,
    IonList,
    IonNote,
    IonRow,
    IonToolbar,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-grid fixed class="page-container">
        <ion-row><ion-col>
          <div class="hero">
            <app-brand-mark [size]="64" />
            <h1>Welcome to hnch</h1>
            <p class="subtitle">Pick a name your team will see next to your votes.</p>
          </div>

          <ion-list inset="true">
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
                (keydown.enter)="submit()"
              ></ion-input>
            </ion-item>
            <ion-note class="footer-note">You can change this later in Settings.</ion-note>
          </ion-list>
        </ion-col></ion-row>
      </ion-grid>
    </ion-content>
    <ion-footer class="cta-bar">
      <ion-toolbar>
        <ion-button
          expand="block"
          size="large"
          class="continue-btn"
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
      @use '../../theme/breakpoints' as *;
      @use '../../theme/page-container' as *;
      @include page-container(480px);

      ion-header ion-toolbar {
        --background: transparent;
        --border-width: 0;
      }
      ion-content {
        --background: var(--hnch-bg);
        --padding-start: 24px;
        --padding-end: 24px;
        --padding-top: 64px;
        --padding-bottom: 24px;
      }
      .hero {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-block-end: 32px;
      }
      h1 {
        margin: 0;
        font-size: 34px;
        font-weight: 700;
        letter-spacing: 0.36px;
        line-height: 1.05;
        color: var(--hnch-text);
      }
      .subtitle {
        margin: 0;
        font-size: 17px;
        letter-spacing: -0.4px;
        color: var(--hnch-muted);
      }
      ion-list {
        background: transparent;
      }
      ion-item {
        --background: var(--hnch-surface);
        --border-color: var(--hnch-sep);
      }
      .footer-note {
        display: block;
        padding: 8px 16px 0;
        font-size: 13px;
        color: var(--hnch-muted);
      }
      ion-footer ion-toolbar {
        --background: transparent;
        --border-width: 0;
        padding: 12px 16px 16px;
      }
      ion-button.continue-btn {
        --background-disabled: var(--hnch-btn-disabled-bg);
        --color-disabled: var(--hnch-btn-disabled-fg);
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
