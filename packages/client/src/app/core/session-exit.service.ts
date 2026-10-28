import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import type { JoinRejectionReason } from '@hnch/shared';
import { NavController } from '@ionic/angular/standalone';

import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';
import { ParticipantIdService } from './participant-id.service';
import { rejectionCopy } from './relay-copy';
import { ToastService } from '../services/toast.service';

/**
 * Why a live session is being left. It is all a caller says: the way out
 * itself belongs to {@link SessionExitService}.
 *
 * - `left`: this user's own Leave.
 * - `ended`: the host ended the session for everyone.
 * - `removed`: the host removed this peer.
 * - `refused`: the relay turned this peer's connection away.
 *
 * `ended` and `removed` carry the session events driver's message.
 */
export type SessionEnding =
  | { readonly kind: 'left' }
  | { readonly kind: 'ended' | 'removed'; readonly message: string }
  | { readonly kind: 'refused'; readonly reason: JoinRejectionReason };

/** What the device forgets of the session on the way out. */
type Forgetting = 'session' | 'password-hash' | 'nothing';

/**
 * What the device keeps of a session the relay refused follows the relay
 * (ADR-0044): a password it no longer takes is forgotten (§6), and so is a
 * session it no longer has. Any other refusal keeps the entry.
 */
function refusalForgets(reason: JoinRejectionReason): Forgetting {
  if (reason === 'wrong-password') return 'password-hash';
  if (reason === 'unknown-room') return 'session';
  return 'nothing';
}

/**
 * The client's one way out of a live session: the user's own Leave (Lobby
 * and Estimating), the session ended for everyone (`SessionEndService`),
 * removed by the host (`ParticipantRemovalService`) and refused by the relay
 * (`SessionRejectionService`). Each caller says why; this owns the steps and
 * their order.
 *
 * - `left`: write `leave` and flush it, tear down, forget the session, Home.
 * - `ended` / `removed`: tear down, forget the session, say why, Home.
 * - `refused`: tear down, start forgetting what ADR-0044 says to, go as the
 *   root to Join (wrong password, code filled in) or Home, say why, then
 *   wait for the forget.
 *
 * The cache is told by the UUID the relay issued, which is what the entry
 * was recorded under, never the doc's copy: any participant can rewrite
 * that. A cache that cannot be written is no reason to keep the user in a
 * session that is gone: forgetting never rejects.
 */
@Injectable({ providedIn: 'root' })
export class SessionExitService {
  private readonly docService = inject(DocService);
  private readonly lastSession = inject(LastSessionService);
  private readonly nav = inject(NavController);
  private readonly participantId = inject(ParticipantIdService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  async exit(ending: SessionEnding): Promise<void> {
    if (ending.kind === 'refused') return this.exitRefused(ending.reason);

    // Read before anything is waited for: the session may be gone by then.
    const uuid = this.docService.relayRoomUuid();
    if (ending.kind === 'left' && this.participantId.id()) {
      // Written before the socket closes, so peers see the leave (ADR-0036).
      this.docService.commands.leave();
      // Best-effort: the teardown does not wait on it past its cap.
      await this.docService.flushUpdates();
    }
    this.docService.teardown();
    // Home does not offer the session again (ADR-0044).
    await this.forget('session', uuid);
    if (ending.kind !== 'left') await this.toastService.info(ending.message);
    await this.router.navigate(['/home']);
  }

  private async exitRefused(reason: JoinRejectionReason): Promise<void> {
    const code = this.docService.roomCode();
    const uuid = this.docService.relayRoomUuid();
    this.docService.teardown();

    // Asked for before going anywhere, and not waited for: the page that is
    // showing has no session left to show. Home lists what the device
    // remembers, but the cache takes what is asked of it in turn — a list
    // read from now on is read after this.
    const forgotten = this.forget(refusalForgets(reason), uuid);

    if (reason === 'wrong-password' && code !== null) {
      await this.nav.navigateRoot(['/join'], { queryParams: { code }, replaceUrl: true });
    } else {
      await this.nav.navigateRoot(['/home'], { replaceUrl: true });
    }
    await this.toastService.error(rejectionCopy(reason, 'rejoin'));
    await forgotten;
  }

  private async forget(what: Forgetting, uuid: string | null): Promise<void> {
    if (uuid === null || what === 'nothing') return;
    try {
      if (what === 'password-hash') await this.lastSession.clearPasswordHash(uuid);
      else await this.lastSession.removeByUuid(uuid);
    } catch (err) {
      console.warn('Failed to update the remembered session:', err);
    }
  }
}
