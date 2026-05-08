/**
 * y-websocket protocol server.
 *
 * Implements the content-blind forwarding described in ADR-0001 on top
 * of the y-websocket *wire* format using the same `y-protocols` +
 * `lib0` primitives that `y-websocket` itself is built on. The upstream
 * y-websocket package ships a client provider only (the `bin/utils.js`
 * server helper was removed in v3); this module is the relay-side
 * counterpart, intentionally kept minimal.
 *
 * Wire format (one byte per inbound/outbound frame header):
 *
 *   0  messageSync        — sync-step-1, sync-step-2, or incremental update
 *   1  messageAwareness   — awareness update payload
 *
 * Message type 2 (auth) is not used: access control for the relay is
 * enforced pre-upgrade per ADR-0016 (HTTP 400/404 on malformed join)
 * and via the close-code table post-upgrade. There is nothing left to
 * authenticate on a live socket.
 *
 * Snapshot rehydration (ADR-0012) needs no bespoke handling: the doc
 * held by the room already has every applied update, so a returning
 * peer's sync-step-1 naturally receives a sync-step-2 covering the
 * state it's missing.
 */

import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import type { WebSocket } from 'ws';

/** y-websocket message-type tags. */
const messageSync = 0;
const messageAwareness = 1;

/**
 * The per-room state exposed by the relay to the WS handler. A room's
 * doc + awareness outlive any single connection — that's what enables
 * the ADR-0012 snapshot to survive "everyone disconnects, one returns".
 */
export interface WsRoom {
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  /**
   * Called when a new connection is accepted; the relay uses this to
   * bump its `connections` counter and reset `lastEmptyAt`.
   */
  onConnectionOpen(): void;
  /**
   * Called when a connection closes (after awareness cleanup). The
   * relay uses this to decrement the counter and, if the count hits
   * zero, stamp `lastEmptyAt` for the TTL sweeper.
   */
  onConnectionClose(): void;
}

/**
 * Wires a WebSocket into a room's doc + awareness. Mirrors the
 * `setupWSConnection` helper from y-websocket v1 / v2 — same wire
 * protocol, but without the coupling to that package's deprecated
 * server entrypoint.
 */
export function setupWSConnection(ws: WebSocket, room: WsRoom): void {
  room.onConnectionOpen();
  ws.binaryType = 'arraybuffer';

  // Track which awareness client IDs were contributed by this socket
  // so we can clear them on close. Origin on awareness events is `ws`.
  const controlledClientIds = new Set<number>();

  const docUpdateHandler = (update: Uint8Array, origin: unknown): void => {
    if (origin === ws) return; // don't echo the peer's own update back
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    send(ws, encoding.toUint8Array(encoder));
  };

  const awarenessUpdateHandler = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === ws) {
      // Remote-origin changes that arrived via *this* socket belong to it.
      for (const id of changes.added) controlledClientIds.add(id);
      for (const id of changes.removed) controlledClientIds.delete(id);
      return; // don't bounce back to the sender
    }
    const changedClients = [...changes.added, ...changes.updated, ...changes.removed];
    if (changedClients.length === 0) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, changedClients),
    );
    send(ws, encoding.toUint8Array(encoder));
  };

  room.doc.on('update', docUpdateHandler);
  room.awareness.on('update', awarenessUpdateHandler);

  ws.on('message', (data) => {
    try {
      handleMessage(ws, room, toUint8Array(data));
    } catch (err) {
      console.error('relay: ws message handling failed', err);
      ws.close();
    }
  });

  const cleanup = (): void => {
    room.doc.off('update', docUpdateHandler);
    room.awareness.off('update', awarenessUpdateHandler);
    if (controlledClientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(room.awareness, [...controlledClientIds], null);
    }
    room.onConnectionClose();
  };
  ws.on('close', cleanup);
  ws.on('error', () => {
    ws.close();
  });

  // Kick off sync: server sends sync-step-1; client replies with
  // sync-step-2, which includes any updates the server is missing.
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, room.doc);
    send(ws, encoding.toUint8Array(encoder));
  }

  // If the room already has awareness states, proactively push them
  // to the new peer so it sees current presence immediately.
  const states = room.awareness.getStates();
  if (states.size > 0) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]),
    );
    send(ws, encoding.toUint8Array(encoder));
  }
}

function handleMessage(ws: WebSocket, room: WsRoom, payload: Uint8Array): void {
  const decoder = decoding.createDecoder(payload);
  const messageType = decoding.readVarUint(decoder);
  switch (messageType) {
    case messageSync: {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
      // Only reply if the sync handler actually wrote a sync-step-2
      // into the encoder — otherwise we'd be sending just the header.
      if (encoding.length(encoder) > 1) {
        send(ws, encoding.toUint8Array(encoder));
      }
      break;
    }
    case messageAwareness: {
      awarenessProtocol.applyAwarenessUpdate(
        room.awareness,
        decoding.readVarUint8Array(decoder),
        ws,
      );
      break;
    }
    default:
      // Unknown message type — ignore rather than tear down the socket,
      // so forward-compat additions from a newer client don't blow up
      // older relays.
      break;
  }
}

function send(ws: WebSocket, msg: Uint8Array): void {
  // If the socket is already CLOSING/CLOSED, `ws.send` throws synchronously;
  // a catch is simpler and safer than a readyState gate, because the gate
  // would need to be tight enough to handle racy transitions mid-tick.
  // The async `err` path covers network-level failures after accept.
  try {
    ws.send(msg, (err) => {
      if (err !== undefined && err !== null) ws.close();
    });
  } catch {
    // Socket has dropped between the update fire and our send — nothing
    // to do. The `close` handler has already run (or will run) and the
    // per-room bookkeeping is driven from that event.
  }
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) {
    // ws can deliver a message as an array of buffers if it was
    // fragmented across frames.
    return Buffer.concat(data as readonly Uint8Array[]);
  }
  if (Buffer.isBuffer(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new Error('unsupported ws message payload');
}
