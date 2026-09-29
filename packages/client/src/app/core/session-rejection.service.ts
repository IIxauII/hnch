import { effect, inject, Injectable, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import type { JoinRejectionReason } from '@hnch/shared';
import { filter, map } from 'rxjs';

import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';
import { rejectionCopy } from './relay-copy';
import { ToastService } from '../services/toast.service';

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
 * user would be left on a screen that will never sync again. They are told
 * why, and sent where they can do something about it: to Join for a wrong
 * password, with the code filled in; Home for everything else.
 *
 * Only while on a session screen. A refusal during a join attempt belongs to
 * whoever is making the attempt (`RoomJoinService.waitForJoinOutcome`), and
 * is theirs to report.
 *
 * Eager-instantiated via `AppComponent`, like `SessionEndService`.
 */
@Injectable({ providedIn: 'root' })
export class SessionRejectionService {
  private readonly docService = inject(DocService);
  private readonly lastSession = inject(LastSessionService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

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
      untracked(() => void this.handle(reason));
    });
  }

  private async handle(reason: JoinRejectionReason): Promise<void> {
    const code = this.docService.roomCode();
    const uuid = this.docService.relayRoomUuid();
    // Clears `lastRejection` with everything else, so this runs once.
    this.docService.teardown();

    if (reason === 'wrong-password' && uuid !== null) {
      // ADR-0044 §6: the hash is wrong now; the rest of the entry stays.
      try {
        await this.lastSession.clearPasswordHash(uuid);
      } catch (err) {
        console.warn('Failed to clear the cached password hash:', err);
      }
    }

    await this.toastService.error(rejectionCopy(reason, 'rejoin'));

    if (reason === 'wrong-password' && code !== null) {
      await this.router.navigate(['/join'], { queryParams: { code } });
    } else {
      await this.router.navigate(['/home']);
    }
  }
}
