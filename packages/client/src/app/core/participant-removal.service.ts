import { DestroyRef, inject, Injectable } from '@angular/core';

import { DocService } from './doc/doc.service';
import { SessionExitService } from './session-exit.service';

/**
 * The client's sink for the session events driver's `removed` event
 * (ADR-0036 §5): the host removed this participant. It leaves the session
 * as `removed`; `SessionExitService` owns the way out (tear down, forget the
 * session, toast, Home). Mirrors `SessionEndService`.
 *
 * Which `leftAt` counts as a removal is decided by the shared driver
 * (`startSessionEvents` in `@hnch/shared`): a voluntary leave never arrives
 * here — the Leave flow in LobbyPage / EstimatingPage leaves as `left` — and
 * neither does a stale `leftAt` carried in the snapshot (ADR-0036 §6).
 *
 * Eager-instantiated via `AppComponent`.
 */
@Injectable({ providedIn: 'root' })
export class ParticipantRemovalService {
  private readonly docService = inject(DocService);
  private readonly sessionExit = inject(SessionExitService);

  constructor() {
    const off = this.docService.onSessionEvent((event) => {
      if (event.kind === 'removed') {
        void this.sessionExit.exit({ kind: 'removed', message: event.message });
      }
    });
    inject(DestroyRef).onDestroy(off);
  }
}
