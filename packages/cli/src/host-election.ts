/**
 * Host-election state machine for CLI (ADR-0010).
 *
 * Ported from packages/client HostElectionService — same algorithm,
 * driven by awareness + Yjs map observers instead of Angular effects.
 *
 * When the current host vanishes from awareness for 5 seconds, the
 * lex-lowest online participantId wins. Only the winner writes.
 */

import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { patchSettings, DOC_SETTINGS_KEY } from '@hnch/shared';

export const HOST_ABSENCE_ELECTION_DEBOUNCE_MS = 5_000;

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
    const ids = new Set<string>();
    awareness.getStates().forEach((state) => {
      const pid = (state as Record<string, unknown>)['participantId'];
      if (typeof pid === 'string') ids.add(pid);
    });
    return ids;
  }

  function getHostId(): string | undefined {
    return doc.getMap(DOC_SETTINGS_KEY).get('hostParticipantId') as string | undefined;
  }

  function cancelDebounce(): void {
    if (debounceTimeout !== null) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
    missingHostId = null;
  }

  function tryPromote(): void {
    const hostId = getHostId();
    const cachedMissing = missingHostId;
    missingHostId = null;

    if (!cachedMissing || hostId !== cachedMissing) return;

    const onlineIds = getOnlineIds();
    if (onlineIds.has(hostId!)) return;

    const sorted = [...onlineIds].sort();
    if (sorted.length === 0) return;

    const winner = sorted[0]!;
    if (winner === myId) {
      patchSettings(doc, { hostParticipantId: winner });
    }
  }

  function evaluate(): void {
    const hostId = getHostId();
    if (!hostId) return;

    const onlineIds = getOnlineIds();

    // Host online → cancel any pending debounce
    if (onlineIds.has(hostId)) {
      cancelDebounce();
      return;
    }

    // Host offline — start or restart debounce
    if (missingHostId !== hostId) {
      cancelDebounce();
      missingHostId = hostId;
      debounceTimeout = setTimeout(() => {
        debounceTimeout = null;
        tryPromote();
      }, HOST_ABSENCE_ELECTION_DEBOUNCE_MS);
    }
  }

  // Listen to awareness changes and settings map changes
  awareness.on('change', evaluate);
  doc.getMap(DOC_SETTINGS_KEY).observe(evaluate);

  // Initial evaluation
  evaluate();

  return {
    stop(): void {
      cancelDebounce();
      awareness.off('change', evaluate);
      doc.getMap(DOC_SETTINGS_KEY).unobserve(evaluate);
    },
  };
}
