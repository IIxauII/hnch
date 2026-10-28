/**
 * y-websocket wire format, relay side (contract item 7). Ported from the Node
 * relay's `ws-connection.ts`.
 *
 * One varUint tag per frame:
 *
 *   0  sync       — sync-step-1, sync-step-2, or an incremental update
 *   1  awareness  — an awareness update
 *
 * Other tags are ignored, so a newer client's additions don't break the relay.
 * Tag 2 (auth) is unused: access is checked before the upgrade (ADR-0016) and
 * refused with close codes after it.
 */

import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import type * as Y from 'yjs';

export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;

/** The relay's opening frame: its state vector, asking the client for what it lacks. */
export function syncStep1Message(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

/** A doc update, as fanned out to every socket but its sender. */
export function updateMessage(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

/** An awareness update (see `Presence.encode`). */
export function awarenessMessage(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
}

export type Inbound =
  | { readonly type: 'sync'; readonly decoder: decoding.Decoder }
  | { readonly type: 'awareness'; readonly update: Uint8Array }
  | { readonly type: 'other' };

/** Splits an inbound frame into its tag and payload. Throws on a truncated frame. */
export function readMessage(frame: Uint8Array): Inbound {
  const decoder = decoding.createDecoder(frame);
  switch (decoding.readVarUint(decoder)) {
    case MESSAGE_SYNC:
      return { type: 'sync', decoder };
    case MESSAGE_AWARENESS:
      return { type: 'awareness', update: decoding.readVarUint8Array(decoder) };
    default:
      return { type: 'other' };
  }
}

/**
 * Applies a sync frame to `doc`, tagging any change with `origin` so it is not
 * echoed back. Returns the reply (sync-step-2 to a step 1), or null.
 */
export function answerSync(
  decoder: decoding.Decoder,
  doc: Y.Doc,
  origin: string,
): Uint8Array | null {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.readSyncMessage(decoder, encoder, doc, origin);
  // Only step 1 writes a reply; otherwise the encoder holds just the tag.
  return encoding.length(encoder) > 1 ? encoding.toUint8Array(encoder) : null;
}
