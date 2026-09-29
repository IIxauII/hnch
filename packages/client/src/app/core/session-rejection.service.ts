import { effect, inject, Injectable, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import type { JoinRejectionReason } from '@hnch/shared';
import { NavController } from '@ionic/angular/standalone';
import { filter, map } from 'rxjs';

import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';
import { rejectionCopy } from './relay-copy';
import { SessionAccessService } from './session-access.service';
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
 * password, with the code filled in; Home for everything else. The session
 * screen they were on is taken out from under them — going back to it would
 * only be turned away again.
 *
 * What the device remembers follows the relay (ADR-0044): a password it no
 * longer takes is forgotten, and so is a session it no longer has.
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
  private readonly lastSession = inject(LastSessionService);
  private readonly nav = inject(NavController);
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
      // The password is being changed from here. The connection is about to
      // be made again with the new one, which takes the refusal back; if the
      // change fails, the refusal is still there when it has.
      if (this.access.saving()) return;
      untracked(() => void this.handle(reason));
    });
  }

  private async handle(reason: JoinRejectionReason): Promise<void> {
    const code = this.docService.roomCode();
    const uuid = this.docService.relayRoomUuid();
    // Clears `lastRejection` with everything else, so this runs once.
    this.docService.teardown();

    // Asked for before going anywhere, and not waited for: the page that is
    // showing has no session left to show. Home lists what the device
    // remembers, but the cache takes what is asked of it in turn — a list
    // read from now on is read after this.
    const forgotten = this.forget(reason, uuid);

    // As the root, in place of the session screen: there is no session to
    // go back to, and Back must not lead to one.
    if (reason === 'wrong-password' && code !== null) {
      await this.nav.navigateRoot(['/join'], { queryParams: { code }, replaceUrl: true });
    } else {
      await this.nav.navigateRoot(['/home'], { replaceUrl: true });
    }
    await this.toastService.error(rejectionCopy(reason, 'rejoin'));
    await forgotten;
  }

  /**
   * Bring what the device remembers of the session in line with the refusal
   * (ADR-0044). A cache that cannot be written is no reason to keep the user
   * where they are: it does not reject.
   */
  private async forget(reason: JoinRejectionReason, uuid: string | null): Promise<void> {
    if (uuid === null) return;
    try {
      if (reason === 'wrong-password') {
        // §6: the hash is wrong now; the rest of the entry stays.
        await this.lastSession.clearPasswordHash(uuid);
      } else if (reason === 'unknown-room') {
        // The session can never be got into again.
        await this.lastSession.removeByUuid(uuid);
      }
    } catch (err) {
      console.warn('Failed to update the remembered session:', err);
    }
  }
}
