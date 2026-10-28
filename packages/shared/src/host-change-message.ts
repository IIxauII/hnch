/**
 * Why there is a new host, where this client can tell:
 *
 *  - `left` — the host that was has left the session. That is in the doc.
 *  - `disconnected` — their connection is gone, and the others elected a
 *    new host (ADR-0010). That is this client's own view of who is online,
 *    and worth something only while it is in sync itself.
 *
 * A host who is still here is no reason at all, and none is given. They may
 * have handed the role over — or a peer that lost sight of the room for a
 * moment has elected itself, and the host that was did nothing.
 */
export type HostChangeCause = 'left' | 'disconnected';

export interface HostChangeMessageInput {
  /** Previous host's resolved display name. `null` means initial assignment (no prior host). */
  prevName: string | null;
  /** New host's resolved display name. */
  newName: string;
  /** Whether the new host is the local participant. */
  isSelf: boolean;
  /** Whether the previous host is the local participant: they know what happened. */
  wasSelf?: boolean;
  /** `null` when this client cannot tell. Read only with a previous host. */
  cause?: HostChangeCause | null;
}

/**
 * What the toast says when the host changes: who the host is now, and why —
 * when there is a reason this client can vouch for. "Bob disconnected."
 * about a host who is sitting right there is a false alarm.
 */
export function formatHostChangeMessage(input: HostChangeMessageInput): string {
  const { prevName, newName, isSelf, wasSelf = false, cause = null } = input;
  const newClause = isSelf ? 'You are now the host' : `${newName} is now the host`;
  if (!prevName || wasSelf || cause === null) return newClause;
  switch (cause) {
    case 'left':
      return `${prevName} left. ${newClause}.`;
    case 'disconnected':
      return `${prevName} disconnected. ${newClause}.`;
  }
}
