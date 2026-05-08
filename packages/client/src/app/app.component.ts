import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { IonApp, IonMenu, IonRouterOutlet, IonSplitPane } from '@ionic/angular/standalone';
import { filter } from 'rxjs/operators';

import { SideNavComponent } from './shared/side-nav.component';

import { DocService } from './core/doc/doc.service';
import { formatHostChangeMessage } from './core/host-change-message';
import { HapticService } from './core/haptic.service';
import { HostElectionService } from './core/host-election.service';
import { ParticipantIdService } from './core/participant-id.service';
import { ParticipantRemovalService } from './core/participant-removal.service';
import { SessionEndService } from './core/session-end.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './services/toast.service';

/**
 * Root shell. Provides the `ion-app` container and the single nav stack
 * (`ion-router-outlet`). Per ux.md §2 the app uses a single nav stack —
 * no tabs, no side menu — so this shell stays deliberately minimal.
 *
 * Services that run global effects (host election, host-change toast)
 * are injected here so Angular instantiates them at app start. Each
 * service no-ops internally when no session is active.
 */
@Component({
  selector: 'app-root',
  imports: [IonApp, IonMenu, IonRouterOutlet, IonSplitPane, SideNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-app>
      <ion-split-pane
        contentId="main"
        when="lg"
        [disabled]="!isInSession()"
        style="--side-min-width: 240px; --side-max-width: 280px; --side-width: 260px;"
      >
        @if (isInSession()) {
          <ion-menu contentId="main" type="overlay">
            <app-side-nav />
          </ion-menu>
        }
        <ion-router-outlet id="main"></ion-router-outlet>
      </ion-split-pane>
    </ion-app>
  `,
})
export class AppComponent {
  private readonly docService = inject(DocService);
  private readonly haptic = inject(HapticService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  /**
   * True when the current route is an in-session screen (lobby/estimating).
   * Public screens (home, onboarding, join, settings) get a fullscreen
   * shell with no side rail.
   */
  protected readonly isInSession = signal(false);

  // Eager-instantiate global effect services. The inject() calls
  // ensure Angular creates these singletons; each service's effect
  // self-gates on `docService.hasSession()`.
  private readonly hostElection = inject(HostElectionService);
  private readonly sessionEnd = inject(SessionEndService);
  private readonly participantRemoval = inject(ParticipantRemovalService);
  private readonly theme = inject(ThemeService);

  /**
   * Scratch signal tracking the previous `hostParticipantId` so we can
   * detect transitions without comparing against `undefined` at boot.
   * `null` means "no previous value observed yet" — suppress the toast
   * on first render / session creation.
   */
  private readonly previousHostId = signal<string | null>(null);

  constructor() {
    // Consume effect services to mark them as used
    void this.hostElection;
    void this.sessionEnd;
    void this.participantRemoval;
    void this.theme;

    // Drive isInSession from router URL — split-pane visible only on
    // /lobby and /estimating. Initial value reflects the current URL so
    // a deep-link refresh shows the correct shell from first paint.
    this.isInSession.set(matchSessionUrl(this.router.url));
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.isInSession.set(matchSessionUrl(event.urlAfterRedirects));
      });

    effect(() => {
      const hostId = this.docService.settings()?.hostParticipantId ?? null;
      const prev = this.previousHostId();

      if (hostId === null) {
        // No session or no host yet — reset tracking.
        if (prev !== null) this.previousHostId.set(null);
        return;
      }

      if (prev === null) {
        // First observation (session just started) — seed without toast.
        this.previousHostId.set(hostId);
        return;
      }

      if (hostId !== prev) {
        this.previousHostId.set(hostId);
        void this.showHostChangeToast(prev, hostId);
      }
    });
  }

  private async showHostChangeToast(prevHostId: string | null, newHostId: string): Promise<void> {
    const myId = this.participantIdService.id();
    const participants = this.docService.participants();

    // Resolve previous host name if available
    let prevName: string | null = null;
    if (prevHostId !== null) {
      const prevParticipant = participants.find((p) => p.id === prevHostId);
      if (prevParticipant !== undefined) {
        prevName = prevParticipant.displayName || prevHostId;
      }
      // If record missing, leave prevName = null → drop disconnect prefix.
    }

    // Resolve new host name
    const newParticipant = participants.find((p) => p.id === newHostId);
    const newName = newParticipant?.displayName || newHostId;

    const message = formatHostChangeMessage({
      prevName,
      newName,
      isSelf: newHostId === myId,
    });

    this.haptic.notificationWarning();
    await this.toastService.info(message);
  }
}

/**
 * URL → in-session predicate. Anything starting with /lobby or /estimating
 * is in-session; everything else is a public/marketing screen.
 */
function matchSessionUrl(url: string): boolean {
  const path = url.split('?')[0]?.split('#')[0] ?? '';
  return /^\/(lobby|estimating)(\/|$)/.test(path);
}
