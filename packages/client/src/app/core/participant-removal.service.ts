import { DestroyRef, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';
import { ToastService } from '../services/toast.service';

/**
 * The client's sink for the session events driver's `removed` event
 * (ADR-0036 §5): the host removed this participant — tear down, clear the
 * last-session cache, toast, navigate Home. Mirrors `SessionEndService`.
 *
 * Which `leftAt` counts as a removal is decided by the shared driver
 * (`startSessionEvents` in `@hnch/shared`): a voluntary leave never arrives
 * here — the Leave flow in LobbyPage / EstimatingPage handles its own
 * teardown — and neither does a stale `leftAt` carried in the snapshot
 * (ADR-0036 §6).
 *
 * Eager-instantiated via `AppComponent`.
 */
@Injectable({ providedIn: 'root' })
export class ParticipantRemovalService {
  private readonly docService = inject(DocService);
  private readonly lastSession = inject(LastSessionService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  constructor() {
    const off = this.docService.onSessionEvent((event) => {
      if (event.kind === 'removed') void this.handleKick(event.message);
    });
    inject(DestroyRef).onDestroy(off);
  }

  private async handleKick(message: string): Promise<void> {
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
