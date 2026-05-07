import type { Doc } from 'yjs';

export interface SessionEndObserverOptions {
  doc: Doc;
  localParticipantId: string;
  onEnded: (info: {
    isLocal: boolean;
    hostName: string;
    timestamp: number;
  }) => Promise<void> | void;
}

export function observeSessionEnd(opts: SessionEndObserverOptions): () => void {
  const meta = opts.doc.getMap('meta');
  let lastHandledTimestamp: number | null = null;
  let disposed = false;

  function handler() {
    if (disposed) return;
    const ts = meta.get('sessionEndedAt') as number | undefined;
    if (ts == null) return;
    if (ts === lastHandledTimestamp) return;

    lastHandledTimestamp = ts;

    const createdBy = meta.get('createdBy') as string | undefined;
    const isLocal = createdBy === opts.localParticipantId;

    const participants = opts.doc.getMap('participants');
    const hostId =
      (opts.doc.getMap('settings').get('hostParticipantId') as string | undefined) ?? createdBy;
    let hostName = 'host';
    if (hostId) {
      const hostMap = participants.get(hostId) as Map<string, unknown> | undefined;
      const name = hostMap?.get('displayName');
      if (typeof name === 'string' && name.length > 0) hostName = name;
    }

    setImmediate(() => {
      if (disposed) return;
      void opts.onEnded({ isLocal, hostName, timestamp: ts });
    });
  }

  meta.observe(handler);
  handler(); // cover snapshot-borne already-ended case (F11)

  return () => {
    disposed = true;
    meta.unobserve(handler);
  };
}
