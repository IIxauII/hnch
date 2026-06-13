import { effect, inject, Injectable } from '@angular/core';
import {
  evaluateElection,
  resolvePromotion,
  HOST_ABSENCE_ELECTION_DEBOUNCE_MS,
} from '@hnch/shared';

import { DocService } from './doc/doc.service';
import { ParticipantIdService } from './participant-id.service';

/**
 * Debounce before promoting a new host after the current one drops from
 * awareness. Single-sourced in `@hnch/shared` (ADR-0048); re-exported here
 * for the connection chip and tests that reference the client-side value.
 *
 * Intentionally separate from `DISCONNECTED_WARNING_DELAY_MS` in the
 * connection chip — they're semantically different timers that happen
 * to share a value.
 */
export { HOST_ABSENCE_ELECTION_DEBOUNCE_MS };

/**
 * Host-election state machine (ADR-0010).
 *
 * When the current `settings.hostParticipantId` vanishes from awareness,
 * this service starts a 5 s debounce. If the host is still absent after
 * the debounce, the lexicographically-lowest online participantId wins.
 * If the winner is *this* client, it writes the promotion to the doc;
 * otherwise it no-ops (the winning peer handles it).
 *
 * Reconnection by the prior host does **not** reclaim the role — the
 * algorithm only ever writes forward, never restores.
 *
 * The service is `providedIn: 'root'` and no-ops when no session is
 * live. Eager-instantiated via `AppComponent`.
 */
@Injectable({ providedIn: 'root' })
export class HostElectionService {
  private readonly docService = inject(DocService);
  private readonly participantIdService = inject(ParticipantIdService);

  /** The host ID that triggered the current debounce, or `null`. */
  private missingHostId: string | null = null;
  private debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.evaluate();
    });
  }

  private evaluate(): void {
    // Read both tracked signals up front so the effect re-runs on any
    // projection or awareness change. `null` projection ⇒ no session.
    const projection = this.docService.projectionSnapshot();
    const onlineIds = this.docService.onlineParticipantIds();
    if (!projection) return;

    // The election rule — including the online ∩ active intersection — lives
    // in `@hnch/shared` (ADR-0048). This driver only applies the action.
    const result = evaluateElection(projection, onlineIds, { missingHostId: this.missingHostId });

    switch (result.kind) {
      case 'cancel':
        this.cancelDebounce();
        break;
      case 'start-debounce':
        this.cancelDebounce();
        this.missingHostId = result.hostId;
        this.debounceTimeout = setTimeout(() => {
          this.debounceTimeout = null;
          this.tryPromote();
        }, HOST_ABSENCE_ELECTION_DEBOUNCE_MS);
        break;
      case 'none':
        break;
    }
  }

  private tryPromote(): void {
    const projection = this.docService.projectionSnapshot();
    const myId = this.participantIdService.id();
    const cachedMissing = this.missingHostId;
    this.missingHostId = null;
    if (!projection || !myId) return;

    // Only the winner writes — other clients see the doc update and stand
    // down. If two clients compute different winners (awareness drift), Yjs
    // merges deterministically; the loser re-reads and stands down
    // (ADR-0010 §Consequences).
    const result = resolvePromotion(
      projection,
      this.docService.onlineParticipantIds(),
      myId,
      cachedMissing,
    );
    if (result.promote) {
      this.docService.updateSettings({ hostParticipantId: result.winner });
    }
  }

  private cancelDebounce(): void {
    if (this.debounceTimeout !== null) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
    this.missingHostId = null;
  }
}
