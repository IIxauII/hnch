import { effect, inject, Injectable, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { DocService } from './doc/doc.service';
import { SessionAccessService } from './session-access.service';
import { SessionExitService } from './session-exit.service';

/** True for the screens a user is on while *in* a session. */
export function isSessionUrl(url: string): boolean {
  return /^\/(?:lobby|estimating)(?:\/|$)/u.test(url);
}

/**
 * Handles the relay refusing a connection the user is already in a session
 * on — the host set or changed the password and this socket had to be
 * opened again, the session filled up or expired while this peer was away.
 *
 * The relay client stops retrying on such a refusal, so without a word the
 * user would be left on a screen that will never sync again. This leaves the
 * session as `refused`, with the reason: `SessionExitService` tells them why
 * and sends them where they can do something about it, and brings what the
 * device remembers in line with the relay (ADR-0044).
 *
 * Only while on a session screen. A refusal during a join attempt belongs to
 * whoever is making the attempt (`RoomJoinService.waitForJoinOutcome`), and
 * is theirs to report.
 *
 * Eager-instantiated via `AppComponent`, like `SessionEndService`.
 */
@Injectable({ providedIn: 'root' })
export class SessionRejectionService {
  private readonly access = inject(SessionAccessService);
  private readonly docService = inject(DocService);
  private readonly router = inject(Router);
  private readonly sessionExit = inject(SessionExitService);

  /** The URL the router has settled on. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  constructor() {
    effect(() => {
      const reason = this.docService.lastRejection();
      if (reason === null || !isSessionUrl(this.url())) return;
      // The password is being changed from here. The connection is about to
      // be made again with the new one, which takes the refusal back; if the
      // change fails, the refusal is still there when it has.
      if (this.access.saving()) return;
      // The exit's teardown clears `lastRejection` with everything else, so
      // this runs once.
      untracked(() => void this.sessionExit.exit({ kind: 'refused', reason }));
    });
  }
}
