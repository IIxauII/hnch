import { DestroyRef, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';
import { ToastService } from '../services/toast.service';

/**
 * The client's sink for the session events driver's `ended` event — both
 * sides of the "End session for everyone" flow (ux.md §4.5, ADR-0023 §2):
 * tear down, forget the session, toast, navigate Home.
 *
 * Whether the end is this peer's own ("Session ended.") or a peer's
 * ("Session ended by [name]") is decided by the shared driver
 * (`startSessionEvents` in `@hnch/shared`), which also fires once per end and
 * only while a session runs. This service shows the event's message.
 *
 * Eager-instantiated via `AppComponent`.
 */
@Injectable({ providedIn: 'root' })
export class SessionEndService {
  private readonly docService = inject(DocService);
  private readonly lastSession = inject(LastSessionService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  constructor() {
    const off = this.docService.onSessionEvent((event) => {
      if (event.kind === 'ended') void this.handleSessionEnd(event.message);
    });
    inject(DestroyRef).onDestroy(off);
  }

  private async handleSessionEnd(message: string): Promise<void> {
    // The UUID the relay issued, which is what the entry was recorded under.
    // Not the one in the doc: any participant can rewrite that.
    const uuid = this.docService.relayRoomUuid();
    this.docService.teardown();

    try {
      if (uuid !== null) await this.lastSession.removeByUuid(uuid);
    } catch (err) {
      console.warn('Failed to clear lastSession cache:', err);
    }

    await this.toastService.info(message);

    await this.router.navigate(['/home']);
  }
}
