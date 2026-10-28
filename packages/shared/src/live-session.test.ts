/**
 * The live session at its interface, against a real relay.
 *
 * Every test opens sessions through `openLiveSession`, acts through the
 * handle, and asserts on what the readings say or on what another peer
 * observes — never on an observer, an awareness instance or a driver handle.
 * That is what lets this one suite stand for both surfaces: the client's
 * `DocService` and the CLI's session module are adapters over exactly this.
 *
 * The relay is the real server, started in this process and loaded from its
 * source by relative path. The relay resolves `@hnch/shared` through that
 * package's build output, so shared must be built first (the root
 * `pnpm test` does it).
 *
 * Two details of the harness matter:
 *
 *  - **One hostname per peer.** `y-websocket` links providers in the same
 *    process over an in-memory broadcast channel named after the socket URL.
 *    Two peers on the same URL would reach each other without the relay, and
 *    cutting one's socket would cut nothing. Each peer therefore reaches the
 *    relay under a hostname of its own.
 *  - **A link per peer.** Each peer's sockets go through a subclass of the
 *    `ws` package's `WebSocket` that the test can cut (close every socket and
 *    point new ones at a dead port) and restore. That is a dropped connection
 *    as the peer sees it: `y-websocket` reports the close and retries on its
 *    own. `ws` is what the CLI ships; on CI's Node 22 the built-in WebSocket
 *    left those retries hanging.
 */

import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { createCodePool } from '../../relay/src/code-pool.js';
import { createRoomStore } from '../../relay/src/room-store.js';
import { createRelayServer } from '../../relay/src/server.js';
import type { JoinRejectionReason } from './auth.js';
import { initDoc, type DocProjection } from './doc-projection.js';
import { FIBONACCI_SCALE, isActiveParticipant } from './doc.js';
import { HOST_ABSENCE_ELECTION_DEBOUNCE_MS } from './election.js';
import { hashPassword } from './password.js';
import {
  onlineIdsFrom,
  openLiveSession,
  type LiveSession,
  type LiveSessionSeed,
} from './live-session.js';
import {
  mintRoom,
  patchRoomAccess,
  type SyncStatus,
  type WebSocketConstructorLike,
} from './relay-client.js';
import type { SessionEvent } from './session-events.js';

/** Cross-peer propagation over loopback, reconnect backoff included. */
const SYNC_TIMEOUT = 8_000;

// A wait may take all of SYNC_TIMEOUT, and the host election waits out its
// 5 s debounce for real.
vi.setConfig({ testTimeout: 20_000 });

let server: Server;
let port: number;

beforeAll(async () => {
  server = createRelayServer({ roomStore: createRoomStore(createCodePool()) });
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

/**
 * The relay's base URL as peer `n` reaches it. The hostnames all land on the
 * same loopback listener; only the strings differ, and the string is what
 * names the in-memory channel.
 */
function relayUrl(n = 0): string {
  const hosts = ['localhost', '127.0.0.1', 'LOCALHOST', 'Localhost'];
  return `http://${hosts[n % hosts.length]}:${port}`;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Nothing listens here: a socket pointed at it fails at once. */
const DEAD_URL = 'ws://127.0.0.1:1';

interface Link {
  readonly WebSocketPolyfill: WebSocketConstructorLike;
  /** Sockets constructed through this link so far. */
  opened(): number;
  /** Drop every open socket and refuse new ones until {@link restore}. */
  cut(): void;
  restore(): void;
}

function makeLink(): Link {
  const sockets = new Set<WebSocket>();
  let opened = 0;
  let isCut = false;
  class LinkSocket extends WebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(isCut ? DEAD_URL : url, protocols);
      opened += 1;
      sockets.add(this);
      this.addEventListener('close', () => sockets.delete(this));
    }
  }
  return {
    WebSocketPolyfill: LinkSocket,
    opened: () => opened,
    cut() {
      isCut = true;
      for (const socket of sockets) {
        // A socket still connecting is dropped once it opens: a drop is a
        // connection that was up going down, not a handshake abandoned.
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.addEventListener('open', () => socket.close());
        } else {
          socket.close();
        }
      }
    },
    restore() {
      isCut = false;
    },
  };
}

/** A peer: one live session plus everything its readings have said. */
interface Peer {
  readonly id: string;
  readonly session: LiveSession;
  readonly link: Link;
  /** The last projection reported. */
  projection(): DocProjection;
  /** The last online set reported. */
  onlineIds(): ReadonlySet<string>;
  readonly statuses: SyncStatus[];
  readonly rejections: Array<JoinRejectionReason | null>;
  readonly events: SessionEvent[];
  synced(): boolean;
  firstSyncs(): number;
  autoReveals(): number;
  /** Every reading, in order, by name. */
  readonly log: string[];
}

const peers: Peer[] = [];

afterEach(() => {
  for (const peer of peers.splice(0)) peer.session.teardown();
});

interface OpenPeerOptions {
  readonly id: string;
  readonly room: { uuid: string; code: string };
  readonly seed: LiveSessionSeed;
  readonly displayName?: string;
  readonly url?: string;
  readonly passwordHash?: string;
  readonly beforeConnect?: (doc: Y.Doc) => Promise<void>;
  readonly link?: Link;
}

function openPeer(opts: OpenPeerOptions): Peer {
  const link = opts.link ?? makeLink();
  let projection: DocProjection | null = null;
  let onlineIds: ReadonlySet<string> = new Set();
  let synced = false;
  let firstSyncs = 0;
  let autoReveals = 0;
  const statuses: SyncStatus[] = [];
  const rejections: Array<JoinRejectionReason | null> = [];
  const events: SessionEvent[] = [];
  const log: string[] = [];

  const session = openLiveSession({
    httpBaseUrl: opts.url ?? relayUrl(peers.length),
    room: opts.room,
    credentials: {
      deviceId: opts.id,
      ...(opts.passwordHash !== undefined && { passwordHash: opts.passwordHash }),
    },
    self: { participantId: opts.id, displayName: opts.displayName ?? opts.id },
    seed: opts.seed,
    WebSocketPolyfill: link.WebSocketPolyfill,
    ...(opts.beforeConnect !== undefined && { beforeConnect: opts.beforeConnect }),
    onProjectionChange(next) {
      log.push('projection');
      projection = next;
    },
    onOnlineIdsChange(next) {
      log.push('online');
      onlineIds = next;
    },
    onStatusChange(status) {
      log.push(`status:${status}`);
      statuses.push(status);
    },
    onRejectionChange(reason) {
      log.push(`rejection:${String(reason)}`);
      rejections.push(reason);
    },
    onSyncedChange(next) {
      log.push(`synced:${String(next)}`);
      synced = next;
    },
    onFirstSync() {
      log.push('first-sync');
      firstSyncs += 1;
    },
    onAutoReveal() {
      log.push('auto-reveal');
      autoReveals += 1;
    },
    onSessionEvent(event) {
      log.push(`event:${event.kind}`);
      events.push(event);
    },
  });

  const peer: Peer = {
    id: opts.id,
    session,
    link,
    projection() {
      if (projection === null) throw new Error(`${opts.id}: no projection reported`);
      return projection;
    },
    onlineIds: () => onlineIds,
    statuses,
    rejections,
    events,
    synced: () => synced,
    firstSyncs: () => firstSyncs,
    autoReveals: () => autoReveals,
    log,
  };
  peers.push(peer);
  return peer;
}

const CREATE: LiveSessionSeed = { kind: 'create', defaultScale: FIBONACCI_SCALE };
const JOIN: LiveSessionSeed = { kind: 'join' };

/** A host who has created a fresh room and synced with the relay. */
async function hostedRoom(
  seed: LiveSessionSeed = CREATE,
): Promise<{ host: Peer; room: { uuid: string; code: string } }> {
  const room = await mintRoom(relayUrl());
  const host = openPeer({ id: 'host', displayName: 'Hana', room, seed });
  await vi.waitFor(() => expect(host.synced()).toBe(true), { timeout: SYNC_TIMEOUT });
  return { host, room };
}

/** A peer who has joined `room` and synced with the relay. */
async function joinedPeer(
  room: { uuid: string; code: string },
  id: string,
  displayName = id,
): Promise<Peer> {
  const peer = openPeer({ id, displayName, room, seed: JOIN });
  await vi.waitFor(() => expect(peer.synced()).toBe(true), { timeout: SYNC_TIMEOUT });
  return peer;
}

function participant(peer: Peer, id: string) {
  return peer.projection().participants.find((p) => p.id === id);
}

/** Whether `peer` counts `id` as in the session (ADR-0036). */
function isActive(peer: Peer, id: string): boolean {
  const record = participant(peer, id);
  return record !== undefined && isActiveParticipant(record);
}

describe('live session — create and join', () => {
  it('a joiner receives the room the host created, and each sees the other', async () => {
    const { host, room } = await hostedRoom({
      kind: 'create',
      defaultScale: FIBONACCI_SCALE,
      sessionName: 'Sprint 42',
    });

    const joiner = await joinedPeer(room, 'joiner', 'Jo');

    await vi.waitFor(
      () => {
        expect(joiner.projection().settings.name).toBe('Sprint 42');
        expect(joiner.projection().settings.hostParticipantId).toBe('host');
        expect(joiner.projection().meta.roomUuid).toBe(room.uuid);
        expect(participant(host, 'joiner')?.displayName).toBe('Jo');
        expect(host.onlineIds()).toEqual(new Set(['host', 'joiner']));
        expect(joiner.onlineIds()).toEqual(new Set(['host', 'joiner']));
      },
      { timeout: SYNC_TIMEOUT },
    );
    expect(host.firstSyncs()).toBe(1);
    expect(joiner.firstSyncs()).toBe(1);
    expect(host.rejections.filter((r) => r !== null)).toEqual([]);
  });
});

describe('live session — rejoin', () => {
  // A fresh doc's own record and the snapshot's old one race in the merge,
  // and either may win. The rejoin written after the first sync is what makes
  // the outcome certain (ADR-0036 §6), so the visit is repeated: an outcome
  // left to the race would not come out the same every time.
  it('a peer who left is active again once its first sync applies, every visit', async () => {
    const { host, room } = await hostedRoom();

    for (let visit = 0; visit < 4; visit += 1) {
      const peer = await joinedPeer(room, 'peer');
      expect(isActive(peer, 'peer')).toBe(true);
      await vi.waitFor(() => expect(isActive(host, 'peer')).toBe(true), {
        timeout: SYNC_TIMEOUT,
      });

      expect(peer.session.commands.leave().applied).toBe(true);
      await vi.waitFor(() => expect(isActive(host, 'peer')).toBe(false), {
        timeout: SYNC_TIMEOUT,
      });
      peer.session.teardown();
    }
  });
});

function roundStatus(peer: Peer): string | undefined {
  return peer.projection().rounds.at(-1)?.status;
}

describe('live session — presence', () => {
  it("a peer's own row is online in the first reading, reported while the session opens", () => {
    const peer = openPeer({ id: 'solo', room: { uuid: 'room-x', code: 'ABCDEF' }, seed: CREATE });

    // Nothing has come back from the relay yet: this is all synchronous.
    expect(peer.log).toEqual(['projection', 'online', 'status:connecting']);
    expect(peer.onlineIds()).toEqual(new Set(['solo']));
  });

  it('the online set follows peers as they connect and leave', async () => {
    const { host, room } = await hostedRoom();
    const peer = await joinedPeer(room, 'peer');
    await vi.waitFor(() => expect(host.onlineIds()).toEqual(new Set(['host', 'peer'])), {
      timeout: SYNC_TIMEOUT,
    });

    peer.session.teardown();

    await vi.waitFor(() => expect(host.onlineIds()).toEqual(new Set(['host'])), {
      timeout: SYNC_TIMEOUT,
    });
  });

  it('a voter whose socket drops does not take itself for the whole room', async () => {
    const { host, room } = await hostedRoom();
    const peer = await joinedPeer(room, 'peer');
    expect(host.session.commands.startRound({ title: 'Login' }).applied).toBe(true);
    await vi.waitFor(() => expect(roundStatus(peer)).toBe('voting'), { timeout: SYNC_TIMEOUT });
    expect(peer.session.commands.toggleCurrentVote('5').applied).toBe(true);

    peer.link.cut();

    await vi.waitFor(() => expect(peer.onlineIds()).toEqual(new Set(['peer'])), {
      timeout: SYNC_TIMEOUT,
    });
    expect(peer.synced()).toBe(false);
    expect(roundStatus(peer)).toBe('voting');

    peer.link.restore();

    await vi.waitFor(() => expect(peer.synced()).toBe(true), { timeout: SYNC_TIMEOUT });
    expect(roundStatus(peer)).toBe('voting');
    expect(roundStatus(host)).toBe('voting');
  });
});

describe('live session — auto-reveal', () => {
  it('a round that went unanimous while this peer was cut off reveals when it resyncs', async () => {
    const { host, room } = await hostedRoom();
    const peer = await joinedPeer(room, 'peer');
    expect(host.session.commands.startRound({ title: 'Login' }).applied).toBe(true);
    await vi.waitFor(() => expect(roundStatus(peer)).toBe('voting'), { timeout: SYNC_TIMEOUT });

    // The host goes, and stays gone; then this peer's own socket drops.
    host.link.cut();
    await vi.waitFor(() => expect(peer.onlineIds()).toEqual(new Set(['peer'])), {
      timeout: SYNC_TIMEOUT,
    });
    peer.link.cut();
    await vi.waitFor(() => expect(peer.synced()).toBe(false), { timeout: SYNC_TIMEOUT });

    // Cast while presence cannot be believed: nothing is decided yet.
    expect(peer.session.commands.toggleCurrentVote('5').applied).toBe(true);
    expect(roundStatus(peer)).toBe('voting');

    peer.link.restore();

    // Back in sync, the only online voter has voted.
    await vi.waitFor(() => expect(roundStatus(peer)).toBe('revealed'), { timeout: SYNC_TIMEOUT });
    expect(peer.autoReveals()).toBe(1);
  });

  it('a peer alone in its session reveals its own round without the relay', async () => {
    const link = makeLink();
    link.cut();
    const room = await mintRoom(relayUrl());
    const solo = openPeer({ id: 'solo', room, seed: CREATE, link });
    expect(solo.session.commands.startRound({ title: 'Solo' }).applied).toBe(true);

    expect(solo.session.commands.toggleCurrentVote('3').applied).toBe(true);

    expect(roundStatus(solo)).toBe('revealed');
    expect(solo.autoReveals()).toBe(1);
    expect(solo.synced()).toBe(false);
  });
});

describe('live session — projection', () => {
  it('reports a change in each of the five containers, agenda included', async () => {
    const { host } = await hostedRoom();

    expect(host.session.commands.addItem({ title: 'Queue me' }).applied).toBe(true);
    expect(host.projection().agenda.map((item) => item.title)).toEqual(['Queue me']);

    host.session.updateSettings({ name: 'Renamed' });
    expect(host.projection().settings.name).toBe('Renamed');

    expect(host.session.commands.rename('Hanna').applied).toBe(true);
    expect(participant(host, 'host')?.displayName).toBe('Hanna');

    const started = host.session.commands.startRound({ title: 'First' });
    if (!started.applied) throw new Error(`startRound refused: ${started.reason}`);
    host.session.updateRoundDescriptor(started.id, { title: 'First, retitled' });
    expect(host.projection().rounds.map((round) => round.title)).toEqual(['First, retitled']);

    expect(host.session.commands.endSession().applied).toBe(true);
    expect(host.projection().meta.sessionEndedAt).toBeTypeOf('number');
  });

  it('reports one projection for a write that touches two containers', async () => {
    const { host } = await hostedRoom();
    const item = host.session.commands.addItem({ title: 'Consumed' });
    if (!item.applied) throw new Error(`addItem refused: ${item.reason}`);
    expect(host.session.commands.startRound({ agendaItemId: item.id }).applied).toBe(true);
    const before = host.log.filter((entry) => entry === 'projection').length;

    // The reveal stamps the round and consumes the item, in one transaction.
    expect(host.session.commands.revealCurrentRound().applied).toBe(true);

    expect(host.log.filter((entry) => entry === 'projection').length).toBe(before + 1);
    expect(host.projection().agenda[0]?.state).toBe('consumed');
    expect(host.projection().rounds[0]?.status).toBe('revealed');
  });

  it("a peer's agenda edit reaches the host", async () => {
    const { host, room } = await hostedRoom();
    const peer = await joinedPeer(room, 'peer');

    expect(peer.session.commands.addItem({ title: 'From the peer' }).applied).toBe(true);

    await vi.waitFor(
      () => expect(host.projection().agenda.map((item) => item.title)).toEqual(['From the peer']),
      { timeout: SYNC_TIMEOUT },
    );
  });

  it('a last write flushed before teardown reaches the others', async () => {
    const { host, room } = await hostedRoom();
    const peer = await joinedPeer(room, 'peer');
    await vi.waitFor(() => expect(isActive(host, 'peer')).toBe(true), { timeout: SYNC_TIMEOUT });

    expect(peer.session.commands.leave().applied).toBe(true);
    await peer.session.flushUpdates(500);
    peer.session.teardown();

    await vi.waitFor(() => expect(isActive(host, 'peer')).toBe(false), { timeout: SYNC_TIMEOUT });
    // Torn down, there is nothing to wait for.
    await expect(peer.session.flushUpdates(500)).resolves.toBeUndefined();
  });
});

describe('live session — teardown', () => {
  it('commands refuse after teardown, readings stop, and peers see nothing written', async () => {
    const { host, room } = await hostedRoom();
    const peer = await joinedPeer(room, 'peer');
    const logged = peer.log.length;

    peer.session.teardown();

    expect(peer.session.commands.startRound({ title: 'Too late' })).toEqual({
      applied: false,
      reason: 'no-session',
    });
    expect(peer.session.commands.rename('Ghost').applied).toBe(false);
    expect(host.session.commands.startRound({ title: 'Next' }).applied).toBe(true);
    await vi.waitFor(() => expect(host.onlineIds()).toEqual(new Set(['host'])), {
      timeout: SYNC_TIMEOUT,
    });
    expect(peer.log.length).toBe(logged);
    expect(host.projection().rounds.map((r) => r.title)).toEqual(['Next']);
    expect(participant(host, 'peer')?.displayName).toBe('peer');
  });

  it('a second session gets a fresh command set of its own', async () => {
    const { host, room } = await hostedRoom();
    const first = await joinedPeer(room, 'peer');
    first.session.teardown();

    const second = await joinedPeer(room, 'peer');

    expect(second.session.commands.rename('Back again').applied).toBe(true);
    expect(first.session.commands.rename('Ghost').applied).toBe(false);
    await vi.waitFor(() => expect(participant(host, 'peer')?.displayName).toBe('Back again'), {
      timeout: SYNC_TIMEOUT,
    });
  });
});

/**
 * A `beforeConnect` that holds the socket back until released. The hook starts
 * a microtask after open, so a test that acts "while the hook runs" awaits
 * `started` first.
 */
function heldConnect(): {
  hook: (doc: Y.Doc) => Promise<void>;
  started: Promise<void>;
  release(): Promise<void>;
} {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  return {
    hook: () => {
      markStarted();
      return gate;
    },
    started,
    async release() {
      open();
      await gate;
      // Let whatever the session does after the hook run.
      await pause(50);
    },
  };
}

describe('live session — before connect', () => {
  it('what the hook loads into the doc is reported before the socket opens', async () => {
    const room = await mintRoom(relayUrl());
    // What a local cache would hold for this room (ADR-0004).
    const cached = new Y.Doc();
    initDoc(cached, {
      roomUuid: room.uuid,
      createdAt: 1,
      participantId: 'host',
      displayName: 'Hana',
      defaultScale: FIBONACCI_SCALE,
      sessionName: 'From the cache',
    });
    const link = makeLink();
    let socketsWhenLoaded = -1;

    const peer = openPeer({
      id: 'host',
      room,
      seed: JOIN,
      link,
      beforeConnect: (doc) => {
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(cached));
        socketsWhenLoaded = link.opened();
        return Promise.resolve();
      },
    });

    await vi.waitFor(() => expect(peer.synced()).toBe(true), { timeout: SYNC_TIMEOUT });
    expect(socketsWhenLoaded).toBe(0);
    // The cache's projection — after the first one — precedes any socket.
    expect(peer.log.indexOf('projection', 1)).toBeLessThan(peer.log.indexOf('status:connected'));
    expect(peer.projection().settings.name).toBe('From the cache');
  });

  it('a hook that fails, even at once, does not keep the session offline', async () => {
    const room = await mintRoom(relayUrl());

    const peer = openPeer({
      id: 'host',
      room,
      seed: CREATE,
      beforeConnect: () => {
        throw new Error('no local cache here');
      },
    });

    await vi.waitFor(() => expect(peer.synced()).toBe(true), { timeout: SYNC_TIMEOUT });
  });

  it('a teardown while the hook runs opens no socket', async () => {
    const room = await mintRoom(relayUrl());
    const held = heldConnect();
    const link = makeLink();
    const peer = openPeer({ id: 'peer', room, seed: JOIN, link, beforeConnect: held.hook });

    await held.started;
    peer.session.teardown();
    await held.release();

    expect(link.opened()).toBe(0);
    // Only the opening one: nothing from a socket.
    expect(peer.statuses).toEqual(['connecting']);
  });

  it('a teardown before the hook has started runs no hook', async () => {
    const room = await mintRoom(relayUrl());
    const hook = vi.fn(() => Promise.resolve());
    const link = makeLink();
    const peer = openPeer({ id: 'peer', room, seed: JOIN, link, beforeConnect: hook });

    peer.session.teardown();
    await pause(50);

    // A hook run now would load a cache into a destroyed doc.
    expect(hook).not.toHaveBeenCalled();
    expect(link.opened()).toBe(0);
  });

  it('credentials changed while the hook runs are the ones the socket opens with', async () => {
    const { room } = await hostedRoom();
    const passwordHash = await hashPassword('correct horse', room.uuid);
    await patchRoomAccess(relayUrl(), room.uuid, passwordHash);
    const held = heldConnect();
    const peer = openPeer({ id: 'peer', room, seed: JOIN, beforeConnect: held.hook });

    await held.started;
    peer.session.updateCredentials(passwordHash);
    await held.release();

    await vi.waitFor(() => expect(peer.synced()).toBe(true), { timeout: SYNC_TIMEOUT });
    expect(peer.rejections.filter((r) => r !== null)).toEqual([]);
  });

  it('a password taken off again while the hook runs is not sent', async () => {
    const { room } = await hostedRoom();
    const passwordHash = await hashPassword('correct horse', room.uuid);
    await patchRoomAccess(relayUrl(), room.uuid, passwordHash);
    const held = heldConnect();
    const peer = openPeer({ id: 'peer', room, seed: JOIN, passwordHash, beforeConnect: held.hook });

    await held.started;
    peer.session.updateCredentials(null);
    await held.release();

    // The room is protected and the socket brings no password: turned away.
    await vi.waitFor(() => expect(peer.rejections).toContain('wrong-password'), {
      timeout: SYNC_TIMEOUT,
    });
    expect(peer.synced()).toBe(false);
  });
});

describe('live session — credentials', () => {
  it('a host who sets a password keeps its own connection across a reconnect', async () => {
    const { host, room } = await hostedRoom();
    const passwordHash = await hashPassword('correct horse', room.uuid);
    await patchRoomAccess(relayUrl(), room.uuid, passwordHash);

    const syncs = (): number => host.log.filter((entry) => entry === 'synced:true').length;
    const before = syncs();

    // The socket re-handshakes with the new hash, and is taken.
    host.session.updateCredentials(passwordHash);
    await vi.waitFor(() => expect(syncs()).toBe(before + 1), { timeout: SYNC_TIMEOUT });
    // Then it drops, and comes back on the hash it now holds.
    host.link.cut();
    await vi.waitFor(() => expect(host.synced()).toBe(false), { timeout: SYNC_TIMEOUT });
    host.link.restore();

    await vi.waitFor(() => expect(syncs()).toBe(before + 2), { timeout: SYNC_TIMEOUT });
    expect(host.rejections.filter((r) => r !== null)).toEqual([]);
  });

  it('a peer without the new password is turned away', async () => {
    const { room } = await hostedRoom();
    const peer = await joinedPeer(room, 'peer');
    await patchRoomAccess(relayUrl(), room.uuid, await hashPassword('correct horse', room.uuid));

    peer.link.cut();
    await vi.waitFor(() => expect(peer.synced()).toBe(false), { timeout: SYNC_TIMEOUT });
    peer.link.restore();

    await vi.waitFor(() => expect(peer.rejections).toContain('wrong-password'), {
      timeout: SYNC_TIMEOUT,
    });
  });
});

describe('live session — host election', () => {
  it('a peer takes over as host once the host has been gone for the debounce', async () => {
    const { host, room } = await hostedRoom();
    const peer = await joinedPeer(room, 'peer');
    await vi.waitFor(() => expect(host.onlineIds()).toEqual(new Set(['host', 'peer'])), {
      timeout: SYNC_TIMEOUT,
    });

    host.session.teardown();

    await vi.waitFor(() => expect(peer.onlineIds()).toEqual(new Set(['peer'])), {
      timeout: SYNC_TIMEOUT,
    });
    expect(peer.projection().settings.hostParticipantId).toBe('host');
    await vi.waitFor(() => expect(peer.projection().settings.hostParticipantId).toBe('peer'), {
      timeout: HOST_ABSENCE_ELECTION_DEBOUNCE_MS + SYNC_TIMEOUT,
    });
    // In sync, this peer can vouch that the host's connection went.
    await vi.waitFor(
      () =>
        expect(peer.events).toContainEqual(
          expect.objectContaining({
            kind: 'host-changed',
            hostId: 'peer',
            isSelf: true,
            cause: 'disconnected',
            message: 'Hana disconnected. You are now the host.',
          }),
        ),
      { timeout: SYNC_TIMEOUT },
    );
  });
});

describe('live session — session events', () => {
  it('an end reaches every peer, and reads as their own to the host who ended it', async () => {
    const { host, room } = await hostedRoom();
    const peer = await joinedPeer(room, 'peer');
    // A refused end is not this peer's end: the host's still names the host.
    expect(peer.session.commands.endSession()).toEqual({ applied: false, reason: 'not-host' });

    expect(host.session.commands.endSession().applied).toBe(true);

    await vi.waitFor(
      () => {
        expect(host.events).toEqual([
          expect.objectContaining({ kind: 'ended', endedLocally: true, message: 'Session ended.' }),
        ]);
        expect(peer.events).toEqual([
          expect.objectContaining({
            kind: 'ended',
            endedLocally: false,
            message: 'Session ended by Hana',
          }),
        ]);
      },
      { timeout: SYNC_TIMEOUT },
    );
  });

  it('a peer the host removes is told so, and a hand-off reaches both', async () => {
    const { host, room } = await hostedRoom();
    const peer = await joinedPeer(room, 'peer');
    const other = await joinedPeer(room, 'other');
    await vi.waitFor(() => expect(host.onlineIds()).toEqual(new Set(['host', 'peer', 'other'])), {
      timeout: SYNC_TIMEOUT,
    });

    expect(host.session.commands.handoffHost('peer').applied).toBe(true);
    await vi.waitFor(
      () =>
        expect(peer.events).toContainEqual(
          expect.objectContaining({ kind: 'host-changed', previousHostId: 'host', isSelf: true }),
        ),
      { timeout: SYNC_TIMEOUT },
    );
    expect(peer.session.commands.kick('other').applied).toBe(true);

    await vi.waitFor(
      () =>
        expect(other.events).toContainEqual(
          expect.objectContaining({ kind: 'removed', removedBy: 'peer' }),
        ),
      { timeout: SYNC_TIMEOUT },
    );
    expect(host.events).toContainEqual(
      expect.objectContaining({ kind: 'host-changed', hostId: 'peer', wasSelf: true }),
    );
  });

  it('a removal carried in the snapshot is not news to a peer who joins again', async () => {
    const { host, room } = await hostedRoom();
    const peer = await joinedPeer(room, 'peer');
    expect(host.session.commands.kick('peer').applied).toBe(true);
    await vi.waitFor(() => expect(peer.events.map((e) => e.kind)).toEqual(['removed']), {
      timeout: SYNC_TIMEOUT,
    });
    peer.session.teardown();

    const back = await joinedPeer(room, 'peer');

    // Events are delivered a microtask late; give any that were raised time.
    await pause(50);
    expect(back.events).toEqual([]);
    expect(isActive(back, 'peer')).toBe(true);
  });
});

// The presence shape. Peers always publish a well-formed state, so what a
// malformed one does is pinned here rather than through a relay.
describe('onlineIdsFrom', () => {
  it('collects string participantIds from awareness states', () => {
    const states = new Map<number, unknown>([
      [1, { participantId: 'host' }],
      [2, { participantId: 'peer-a' }],
    ]);
    expect(onlineIdsFrom(states)).toEqual(new Set(['host', 'peer-a']));
  });

  it('skips entries with a missing participantId', () => {
    const states = new Map<number, unknown>([
      [1, { participantId: 'host' }],
      [2, {}],
      [3, { cursor: { x: 1 } }],
    ]);
    expect(onlineIdsFrom(states)).toEqual(new Set(['host']));
  });

  it('skips entries whose participantId is not a string', () => {
    const states = new Map<number, unknown>([
      [1, { participantId: 42 }],
      [2, { participantId: null }],
      [3, { participantId: ['peer-a'] }],
      [4, { participantId: 'peer-b' }],
    ]);
    expect(onlineIdsFrom(states)).toEqual(new Set(['peer-b']));
  });

  it('skips non-object states and returns an empty set for no states', () => {
    expect(
      onlineIdsFrom(
        new Map<number, unknown>([
          [1, null],
          [2, 'peer-a'],
        ]),
      ),
    ).toEqual(new Set());
    expect(onlineIdsFrom(new Map<number, unknown>())).toEqual(new Set());
  });
});
