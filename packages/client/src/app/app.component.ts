import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

import { DocService } from './core/doc/doc.service';
import { HapticService } from './core/haptic.service';
import { ParticipantRemovalService } from './core/participant-removal.service';
import { SessionEndService } from './core/session-end.service';
import { SessionRejectionService } from './core/session-rejection.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './services/toast.service';

/**
 * Root shell. Provides the `ion-app` container and the single nav stack
 * (`ion-router-outlet`). Per ux.md §2 the app uses a single nav stack —
 * no tabs, no side menu — so this shell stays deliberately minimal.
 *
 * The app-level services (session end, session rejection, participant
 * removal, theme) are injected here so Angular creates them at app start.
 * Session end and participant removal are listeners on
 * `DocService.onSessionEvent`, which delivers only while a session's driver
 * runs. Host election and session events are *not* among them: they are
 * session-scoped drivers owned by `DocService` (see `startElection` and
 * `startSessionEvents` in `@hnch/shared`).
 *
 * The host-change toast is the sink for the session events driver's
 * `host-changed` event: the driver decides when the host has changed and
 * what to say; this shell gives the haptic and shows the text.
 */
@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent {
  private readonly docService = inject(DocService);
  private readonly haptic = inject(HapticService);
  private readonly toastService = inject(ToastService);

  // Eager-instantiate the app-level services. The inject() calls make Angular
  // create these singletons. Session end and participant removal register a
  // session-events listener. Session rejection's effect is gated on the relay
  // having refused a session.
  private readonly sessionEnd = inject(SessionEndService);
  private readonly sessionRejection = inject(SessionRejectionService);
  private readonly participantRemoval = inject(ParticipantRemovalService);
  private readonly theme = inject(ThemeService);

  constructor() {
    // Consume effect services to mark them as used
    void this.sessionEnd;
    void this.sessionRejection;
    void this.participantRemoval;
    void this.theme;

    const off = this.docService.onSessionEvent((event) => {
      if (event.kind !== 'host-changed') return;
      this.haptic.notificationWarning();
      void this.toastService.info(event.message);
    });
    inject(DestroyRef).onDestroy(off);
  }
}
