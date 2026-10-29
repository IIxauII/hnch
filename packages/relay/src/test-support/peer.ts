/**
 * Test-only: a y-websocket peer inside workerd, talking to the relay through
 * the Worker's fetch handler the way a client does over the network. It runs
 * the same y-protocols code clients ship, so what it sees is what they'd see.
 */

import { exports } from 'cloudflare:workers';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { vi } from 'vitest';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { clock } from '../clock';

export function call(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(new Request(`http://relay.test${path}`, init));
}

export async function createRoom(
  body: Record<string, unknown> = {},
): Promise<{ uuid: string; code: string }> {
  const res = await call('/rooms', { method: 'POST', body: JSON.stringify(body) });
  if (res.status !== 201) throw new Error(`POST /rooms answered ${res.status}`);
  return res.json();
}

/** The raw upgrade, for tests of what happens before a socket exists. */
export function upgrade(uuid: string, query = ''): Promise<Response> {
  return call(`/ws/${uuid}${query}`, { headers: { Upgrade: 'websocket' } });
}

/** Moves the relay's clock; `restoreClock` puts real time back. */
export function setNow(ms: number): void {
  clock.now = () => ms;
}
export function restoreClock(): void {
  clock.now = () => Date.now();
}

export interface Frame {
  readonly type: 'sync' | 'awareness' | 'other';
  readonly bytes: Uint8Array;
}

export class Peer {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly frames: Frame[] = [];
  closeEvent: { code: number; reason: string } | null = null;
  /** Whether the relay's answer to this peer's sync-step-1 (its whole doc) has arrived. */
  isSynced = false;
  /** Set by this peer's own `close()`; `send` drops frames from then on. */
  private closing = false;

  private constructor(
    readonly ws: WebSocket,
    awareness?: Awareness,
  ) {
    this.awareness = awareness ?? new Awareness(new Y.Doc());
    this.doc = this.awareness.doc;
    if (awareness === undefined) {
      clearInterval((this.awareness as unknown as { _checkInterval: number })._checkInterval);
      this.awareness.setLocalState(null);
    }
    // As y-websocket's provider: every awareness change, whatever its origin
    // (local, or applied from the relay), goes back out to the relay.
    this.awareness.on('update', this.onAwarenessUpdate);
    ws.addEventListener('message', (event) => this.receive(event.data as ArrayBuffer));
    ws.addEventListener('close', (event) => {
      this.closeEvent = { code: event.code, reason: event.reason };
    });
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'relay') return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0);
      syncProtocol.writeUpdate(encoder, update);
      this.send(encoding.toUint8Array(encoder));
    });
  }

  /**
   * Opens a socket to room `uuid`; throws unless the upgrade is accepted. Pass
   * an `awareness` kept from an earlier peer to reconnect as the same client.
   */
  static async join(uuid: string, query = '', awareness?: Awareness): Promise<Peer> {
    const res = await upgrade(uuid, query);
    if (res.status !== 101 || res.webSocket === null) {
      throw new Error(`upgrade answered ${res.status}`);
    }
    // Binary frames as ArrayBuffer, as browsers and y-websocket set it.
    res.webSocket.binaryType = 'arraybuffer';
    res.webSocket.accept();
    const peer = new Peer(res.webSocket, awareness);
    // As y-websocket's provider does on open: ask for what the relay holds.
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.writeSyncStep1(encoder, peer.doc);
    peer.send(encoding.toUint8Array(encoder));
    // And, as its `onopen` does, the local state at its current clock.
    if (awareness !== undefined && awareness.getLocalState() !== null) {
      peer.sendAwareness([awareness.clientID]);
    }
    return peer;
  }

  /**
   * Sends a frame. After this peer's own `close()` it drops it, as a browser
   * or Node's `ws` does. workerd's send() throws instead, and a throw from the
   * message listener (answering the relay's sync-step-1 after `close()`) fails
   * the socket: its close event never fires. Only the peer's own close counts:
   * a send after the relay closed the socket still throws, loudly.
   */
  send(frame: Uint8Array): void {
    if (this.closing) return;
    this.ws.send(frame);
  }

  /** Announces (or renews) this peer's awareness state. */
  announce(state: Record<string, unknown> | null): void {
    this.awareness.setLocalState(state);
  }

  /** Drops the socket without touching this peer's awareness, as a lost link does. */
  drop(): void {
    this.mute();
    this.close();
  }

  /** Stops echoing and renewing awareness, as a client that went quiet. */
  mute(): void {
    this.awareness.off('update', this.onAwarenessUpdate);
  }

  /** Remote awareness states that carry a participantId (what hnch clients keep). */
  participants(): unknown[] {
    return [...this.awareness.getStates().entries()]
      .filter(([id, s]) => id !== this.awareness.clientID && s && 'participantId' in s)
      .map(([, s]) => (s as { participantId: unknown }).participantId);
  }

  /** Frames received since `mark` (an index into `frames`). */
  since(mark: number): Frame[] {
    return this.frames.slice(mark);
  }

  close(code = 1000): void {
    this.closing = true;
    this.ws.close(code, 'bye');
  }

  /**
   * Resolves once the peer holds everything the relay had when it answered the
   * peer's sync-step-1, as y-websocket's `synced`. Read the doc after this, not
   * after a fixed wait: the answer may take any time to arrive.
   */
  async synced(timeout = 3_000): Promise<void> {
    await vi.waitFor(
      () => {
        if (!this.isSynced) throw new Error('not synced yet');
      },
      { timeout, interval: 10 },
    );
  }

  async closed(): Promise<{ code: number; reason: string }> {
    await vi.waitFor(() => {
      if (this.closeEvent === null) throw new Error('not closed yet');
    });
    return this.closeEvent!;
  }

  private readonly onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    _origin: unknown,
  ): void => {
    this.sendAwareness([...added, ...updated, ...removed]);
  };

  private sendAwareness(clientIds: number[]): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(this.awareness, clientIds));
    this.send(encoding.toUint8Array(encoder));
  }

  private receive(data: ArrayBuffer): void {
    const bytes = new Uint8Array(data);
    const decoder = decoding.createDecoder(bytes);
    const tag = decoding.readVarUint(decoder);
    if (tag === 0) {
      this.frames.push({ type: 'sync', bytes });
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0);
      const type = syncProtocol.readSyncMessage(decoder, encoder, this.doc, 'relay');
      if (type === syncProtocol.messageYjsSyncStep2) this.isSynced = true;
      if (encoding.length(encoder) > 1) this.send(encoding.toUint8Array(encoder));
    } else if (tag === 1) {
      this.frames.push({ type: 'awareness', bytes });
      applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), 'relay');
    } else {
      this.frames.push({ type: 'other', bytes });
    }
  }
}

/** Waits until `check` stops throwing (vi.waitFor with a test-friendly default). */
export function eventually(check: () => void, timeout = 2_000): Promise<void> {
  return vi.waitFor(check, { timeout, interval: 10 });
}
