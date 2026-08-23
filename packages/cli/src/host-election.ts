/**
 * Host-election driver for CLI (ADR-0010, ADR-0021, ADR-0048).
 *
 * The election rule itself is single-sourced in `@hnch/shared`
 * (`evaluateElection` / `resolvePromotion`). This driver holds only the
 * imperative glue: awareness→Set extraction, the debounce timer +
 * `missingHostId` state, the Y observers, and the doc write. No branch
 * logic, winner calc, or active-set filtering lives here.
 */

import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import {
  DOC_PARTICIPANTS_KEY,
  DOC_SETTINGS_KEY,
  evaluateElection,
  onlineIdsFrom,
  patchSettings,
  projectDoc,
  resolvePromotion,
  HOST_ABSENCE_ELECTION_DEBOUNCE_MS,
} from '@hnch/shared';

export { HOST_ABSENCE_ELECTION_DEBOUNCE_MS };

export interface ElectionHandle {
  stop(): void;
}

/**
 * Start watching for host absence and elect a replacement when needed.
 * Returns a handle to stop the watcher (call on disconnect).
 */
export function startElection(doc: Y.Doc, awareness: Awareness, myId: string): ElectionHandle {
  let missingHostId: string | null = null;
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  function getOnlineIds(): Set<string> {
    return onlineIdsFrom(awareness.getStates());
  }

  function cancelDebounce(): void {
    if (debounceTimeout !== null) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
    missingHostId = null;
  }

  function tryPromote(): void {
    debounceTimeout = null;
    const cachedMissing = missingHostId;
    missingHostId = null;

    const result = resolvePromotion(projectDoc(doc), getOnlineIds(), myId, cachedMissing);
    if (result.promote) {
      patchSettings(doc, { hostParticipantId: result.winner });
    }
  }

  function evaluate(): void {
    const result = evaluateElection(projectDoc(doc), getOnlineIds(), { missingHostId });

    switch (result.kind) {
      case 'cancel':
        cancelDebounce();
        break;
      case 'start-debounce':
        cancelDebounce();
        missingHostId = result.hostId;
        debounceTimeout = setTimeout(tryPromote, HOST_ABSENCE_ELECTION_DEBOUNCE_MS);
        break;
      case 'none':
        break;
    }
  }

  // Listen to awareness changes, settings map changes, and participant
  // changes. The last one matters: a kicked or departed host keeps its
  // awareness entry but gains `leftAt` (ADR-0036), which makes it ineligible
  // (ADR-0048) without emitting an awareness or settings event.
  awareness.on('change', evaluate);
  doc.getMap(DOC_SETTINGS_KEY).observe(evaluate);
  doc.getMap(DOC_PARTICIPANTS_KEY).observeDeep(evaluate);

  // Initial evaluation
  evaluate();

  return {
    stop(): void {
      cancelDebounce();
      awareness.off('change', evaluate);
      doc.getMap(DOC_SETTINGS_KEY).unobserve(evaluate);
      doc.getMap(DOC_PARTICIPANTS_KEY).unobserveDeep(evaluate);
    },
  };
}
