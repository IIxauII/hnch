/**
 * Integration tests for the WebSocket sync path (ADR-0012 snapshot
 * rehydration, ADR-0001 content-blind relay).
 *
 * The relay is spun up on an ephemeral port; test peers are modeled as
 * `Y.Doc` instances talking to a `ws` `WebSocket` using the same
 * `y-protocols` + `lib0` primitives as the relay's server-side handler.
 * Exercising the wire protocol directly (rather than pulling in
 * `y-websocket`'s client provider) keeps this test focused on the
 * relay's guarantee: *any* conformant peer sees the relay's
 * in-memory doc state when it connects.
 *
 * The §3.10 two-peer + rehydration scenario lives here:
 *
 *   1. Peer A connects, applies a local mutation.
 *   2. Peer B connects, observes A's mutation (forwarding works).
 *   3. Both peers disconnect.
 *   4. Peer C connects after a short delay, observes the accumulated
 *      state via a fresh sync-step-1/2 exchange (snapshot rehydrates).
 *
 * Awareness forwarding is also covered:
 *
 *   5. Peer A publishes presence; peer B receives it via live forwarding.
 *   6. Peer C connects after A has presence; relay sends the initial
 *      awareness push so C sees A without further messages from A.
 */

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { createCodePool } from './code-pool.js';
import { createRoomStore, type RoomStore } from './room-store.js';
import { createRelayServer } from './server.js';

const messageSync = 0;
const messageAwareness = 1;

/**
 * Minimal test peer. Wraps a `Y.Doc` + `Awareness` around a `ws`
 * socket, translating Yjs events into the y-websocket wire protocol.
 * The shape mirrors what the Phase-5 client sync provider will do, but
 * without any of its bells (reconnect, backoff, status events).
 */
interface TestPeer {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  socket: WebSocket;
  /** Resolves once the socket has observed a sync-step-2 from the server. */
  whenSynced: Promise<void>;
  close(): Promise<void>;
}

function connectPeer(baseWsUrl: string, uuid: string): Promise<TestPeer> {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const socket = new WebSocket(`${baseWsUrl}/ws/${uuid}`);
  socket.binaryType = 'arraybuffer';

  let markSynced: () => void = () => {};
  const whenSynced = new Promise<void>((resolve) => {
    markSynced = resolve;
  });

  socket.on('message', (data) => {
    const buf =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : Array.isArray(data)
          ? new Uint8Array(Buffer.concat(data as readonly Uint8Array[]))
          : new Uint8Array(data as Buffer);
    const decoder = decoding.createDecoder(buf);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case messageSync: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        const syncType = syncProtocol.readSyncMessage(decoder, encoder, doc, socket);
        if (encoding.length(encoder) > 1) {
          socket.send(encoding.toUint8Array(encoder));
        }
        // syncType 1 = sync-step-2 from server — our initial state has
        // been delivered. Resolve the sync promise so the test can move
        // on deterministically instead of polling the doc.
        if (syncType === syncProtocol.messageYjsSyncStep2) {
          markSynced();
        }
        break;
      }
      case messageAwareness: {
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(decoder),
          socket,
        );
        break;
      }
      default:
        break;
    }
  });

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === socket) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    socket.send(encoding.toUint8Array(encoder));
  });

  const opened = new Promise<void>((resolve, reject) => {
    socket.once('open', () => {
      // Client-initiated sync-step-1 is also useful: the relay will
      // reply with its state (which is the point of this test).
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeSyncStep1(encoder, doc);
      socket.send(encoding.toUint8Array(encoder));
      resolve();
    });
    socket.once('error', reject);
  });

  return opened.then(() => ({
    doc,
    awareness,
    socket,
    whenSynced,
    async close(): Promise<void> {
      if (socket.readyState === socket.CLOSED) return;
      await new Promise<void>((resolve) => {
        socket.once('close', () => resolve());
        socket.close();
      });
    },
  }));
}

/** Poll-based wait with a generous default budget. */
async function waitFor(cond: () => boolean, { timeoutMs = 1_000, pollMs = 5 } = {}): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error('waitFor: condition not met within timeout');
}

describe('relay ws connection', () => {
  let server: Server;
  let baseHttpUrl: string;
  let baseWsUrl: string;
  let roomStore: RoomStore;

  beforeEach(async () => {
    roomStore = createRoomStore(createCodePool());
    server = createRelayServer({ roomStore });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address() as AddressInfo;
    baseHttpUrl = `http://127.0.0.1:${address.port}`;
    baseWsUrl = `ws://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it('rejects an upgrade on an unknown uuid with HTTP 404', async () => {
    const ws = new WebSocket(`${baseWsUrl}/ws/00000000-0000-0000-0000-000000000000`);
    const err = await new Promise<Error>((resolve) => {
      ws.once('error', resolve);
    });
    // ws throws "Unexpected server response: 404" on a denied upgrade.
    expect(err.message).toMatch(/404/);
  });

  it('rejects an upgrade on a malformed path', async () => {
    const ws = new WebSocket(`${baseWsUrl}/ws/not-a-uuid`);
    const err = await new Promise<Error>((resolve) => {
      ws.once('error', resolve);
    });
    expect(err.message).toMatch(/404/);
  });

  it('forwards doc updates between two connected peers', async () => {
    const record = roomStore.createRoom();
    const a = await connectPeer(baseWsUrl, record.uuid);
    const b = await connectPeer(baseWsUrl, record.uuid);
    await Promise.all([a.whenSynced, b.whenSynced]);

    // A writes; B should observe the write via the relay's forwarding.
    a.doc.getMap('root').set('from-a', 1);

    await waitFor(() => b.doc.getMap('root').get('from-a') === 1);

    // And the relay's own authoritative doc carries the update too — the
    // snapshot this test exercises in the next case depends on this.
    expect(record.doc.getMap('root').get('from-a')).toBe(1);

    await a.close();
    await b.close();
  });

  /**
   * Sends an awareness update from a test peer to the relay.
   *
   * `connectPeer` wires up doc updates automatically but not awareness
   * updates (they are initiated by the application layer, not by the
   * sync protocol). This helper encodes and sends the peer's current
   * local awareness state over its raw WebSocket so the relay can
   * forward it to other connected peers.
   */
  function sendAwarenessUpdate(peer: TestPeer): void {
    const clientId = peer.awareness.clientID;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(peer.awareness, [clientId]),
    );
    peer.socket.send(encoding.toUint8Array(encoder));
  }

  it('snapshots state so a later peer rehydrates after everyone left (ADR-0012)', async () => {
    // Mint via the HTTP API to mirror the real client flow end-to-end.
    const createRes = await fetch(`${baseHttpUrl}/rooms`, { method: 'POST' });
    expect(createRes.status).toBe(201);
    const { uuid } = (await createRes.json()) as { uuid: string; code: string };

    const a = await connectPeer(baseWsUrl, uuid);
    const b = await connectPeer(baseWsUrl, uuid);
    await Promise.all([a.whenSynced, b.whenSynced]);

    a.doc.getMap('root').set('lineage', 'first-round');
    b.doc.getMap('root').set('participant', 'xau');
    await waitFor(
      () =>
        b.doc.getMap('root').get('lineage') === 'first-round' &&
        a.doc.getMap('root').get('participant') === 'xau',
    );

    await a.close();
    await b.close();

    // Small delay to let the close handlers flush on the server side —
    // not strictly required for correctness but makes the test read
    // more like the real "closed the tab, opened it again after lunch"
    // scenario ADR-0012 calls out.
    await new Promise((r) => setTimeout(r, 25));

    const c = await connectPeer(baseWsUrl, uuid);
    await c.whenSynced;
    // The whole point of the TTL snapshot: peer C never talked to A or B
    // yet sees the full state the room held when they left.
    expect(c.doc.getMap('root').get('lineage')).toBe('first-round');
    expect(c.doc.getMap('root').get('participant')).toBe('xau');

    await c.close();
  });

  it('forwards awareness updates from one peer to another peer (live)', async () => {
    const record = roomStore.createRoom();
    const a = await connectPeer(baseWsUrl, record.uuid);
    const b = await connectPeer(baseWsUrl, record.uuid);
    await Promise.all([a.whenSynced, b.whenSynced]);

    // A publishes a presence state and pushes it to the relay.
    a.awareness.setLocalState({ displayName: 'Alice', status: 'idle' });
    sendAwarenessUpdate(a);

    // B should receive A's awareness via the relay's forwarding path.
    await waitFor(() => {
      const states = b.awareness.getStates();
      const aState = states.get(a.awareness.clientID) as { displayName: string } | undefined;
      return aState?.displayName === 'Alice';
    });

    await a.close();
    await b.close();
  });

  it('pushes existing awareness states to a newly connecting peer', async () => {
    // Mint the room via the HTTP API so we exercise the full create path.
    const createRes = await fetch(`${baseHttpUrl}/rooms`, { method: 'POST' });
    const { uuid } = (await createRes.json()) as { uuid: string; code: string };

    // A connects first and publishes presence.
    const a = await connectPeer(baseWsUrl, uuid);
    await a.whenSynced;
    a.awareness.setLocalState({ displayName: 'Alice' });
    sendAwarenessUpdate(a);

    // Give the relay a tick to store A's awareness in the room state.
    await new Promise((r) => setTimeout(r, 20));

    // B connects after A has already published. The relay must push A's
    // current awareness to B in the initial connection burst (the "existing
    // states" push in setupWSConnection).
    const b = await connectPeer(baseWsUrl, uuid);
    await b.whenSynced;

    await waitFor(() => {
      const states = b.awareness.getStates();
      const aState = states.get(a.awareness.clientID) as { displayName: string } | undefined;
      return aState?.displayName === 'Alice';
    });

    await a.close();
    await b.close();
  });

  it('clears a disconnected peer awareness on close', async () => {
    const record = roomStore.createRoom();
    const a = await connectPeer(baseWsUrl, record.uuid);
    const b = await connectPeer(baseWsUrl, record.uuid);
    await Promise.all([a.whenSynced, b.whenSynced]);

    // A publishes presence.
    a.awareness.setLocalState({ displayName: 'Alice' });
    sendAwarenessUpdate(a);
    await waitFor(() => b.awareness.getStates().has(a.awareness.clientID));

    // A disconnects — the relay should remove A's awareness from the
    // room and forward the removal to B.
    await a.close();

    await waitFor(() => !b.awareness.getStates().has(a.awareness.clientID));

    await b.close();
  });
});
