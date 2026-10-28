import { DestroyRef, inject, Injectable } from '@angular/core';

import { DocService } from './doc/doc.service';
import { SessionExitService } from './session-exit.service';

/**
 * The client's sink for the session events driver's `ended` event — both
 * sides of the "End session for everyone" flow (ux.md §4.5, ADR-0023 §2).
 * It leaves the session as `ended`; `SessionExitService` owns the way out
 * (tear down, forget the session, toast, Home).
 *
 * Whether the end is this peer's own ("Session ended.") or a peer's
 * ("Session ended by [name]") is decided by the shared driver
 * (`startSessionEvents` in `@hnch/shared`), which also fires once per end and
 * only while a session runs. This service passes the event's message on.
 *
 * Eager-instantiated via `AppComponent`.
 */
@Injectable({ providedIn: 'root' })
export class SessionEndService {
  private readonly docService = inject(DocService);
  private readonly sessionExit = inject(SessionExitService);

  constructor() {
    const off = this.docService.onSessionEvent((event) => {
      if (event.kind === 'ended') {
        void this.sessionExit.exit({ kind: 'ended', message: event.message });
      }
    });
    inject(DestroyRef).onDestroy(off);
  }
}
