/**
 * Integration test: spin up relay, create + join session via CLI
 * session API, verify votes sync and reveal works.
 *
 * Uses `vi.waitFor` instead of fixed sleeps so tests are as fast as the
 * underlying WS sync allows rather than being gated on a worst-case
 * duration baked in at write-time.
 *
 * The round/vote/roster *rules* — descriptor carry-over, `parentRoundId`
 * linking, the terminal and active-round gates, the not-host refusal — are
 * pinned once in `@hnch/shared`'s `round-commands.test.ts`,
 * `vote-commands.test.ts` and `roster-commands.test.ts`; re-asserting them
 * here through a real relay would test the same gate twice while adding
 * nothing about the wire. What stays here is what only a real relay can
 * show: doc state actually propagating over a live WebSocket between two
 * independently-wired clients, and the CLI's own adapter-level wiring
 * (auto-reveal, rejoin) that `session.election.test.ts` /
 * `session.roster.test.ts` don't cover with a real socket.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createCodePool } from '../../relay/src/code-pool.js';
import { createRoomStore } from '../../relay/src/room-store.js';
import { createRelayServer } from '../../relay/src/server.js';
import { createSession, joinSession, wireSession, type SessionHandle } from './session.js';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import {
  AWARENESS_PARTICIPANT_ID_FIELD,
  FIBONACCI_SCALE,
  joinDoc,
  leave,
  TSHIRT_SCALE,
  type StartRoundInit,
} from '@hnch/shared';

let server: Server;
let port: number;
let relayUrl: string;

beforeAll(async () => {
  const codePool = createCodePool();
  const roomStore = createRoomStore(codePool);
  server = createRelayServer({ roomStore });

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      relayUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

/** Wait timeout for cross-client CRDT propagation over a local loopback relay. */
const SYNC_TIMEOUT = 5_000;

/**
 * Start a round through the bound command seam and return its id. Every
 * caller here is the session's own host, so a refusal would mean the test
 * fixture is wrong, not the code under test — throwing surfaces that loudly
 * instead of the id silently coming back `undefined`.
 */
function startRound(session: SessionHandle, init: StartRoundInit = {}): string {
  const result = session.commands.startRound(init);
  if (!result.applied) throw new Error(`startRound refused: ${result.reason}`);
  return result.id;
}

describe('session integration', () => {
  it('create + join + vote + reveal', async () => {
    // Host creates session
    const host = await createSession({
      participantId: 'host-1',
      displayName: 'Alice',
      relayUrl,
      sessionName: 'Test Sprint',
      defaultScale: FIBONACCI_SCALE,
    });

    expect(host.roomCode).toBeTruthy();
    expect(host.roomCode.length).toBe(6);

    // Wait for host's own doc sync to stabilise before joiner connects.
    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(1),
      { timeout: SYNC_TIMEOUT },
    );

    // Joiner joins
    const joiner = await joinSession({
      participantId: 'joiner-1',
      displayName: 'Bob',
      relayUrl,
      roomCode: host.roomCode,
    });

    // Wait until both clients are visible in each other's projection.
    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(2),
      { timeout: SYNC_TIMEOUT },
    );

    // Host starts a round
    const roundId = startRound(host, { title: 'Test Story' });

    // Wait until the round appears in the host projection.
    await vi.waitFor(
      () => expect(host.projection().rounds.find((x) => x.id === roundId)).toBeDefined(),
      { timeout: SYNC_TIMEOUT },
    );

    // Both vote
    host.commands.toggleCurrentVote('5');
    joiner.commands.toggleCurrentVote('8');

    // Wait for both votes to be visible to both clients.
    await vi.waitFor(
      () => {
        const r = host.projection().rounds.find((x) => x.id === roundId);
        expect(r?.votes['host-1']).toBe('5');
        expect(r?.votes['joiner-1']).toBe('8');
      },
      { timeout: SYNC_TIMEOUT },
    );
    await vi.waitFor(
      () => {
        const r = joiner.projection().rounds.find((x) => x.id === roundId);
        expect(r?.votes['host-1']).toBe('5');
        expect(r?.votes['joiner-1']).toBe('8');
      },
      { timeout: SYNC_TIMEOUT },
    );

    // Host reveals
    host.commands.revealCurrentRound();
    await vi.waitFor(
      () => expect(host.projection().rounds.find((x) => x.id === roundId)?.status).toBe('revealed'),
      { timeout: SYNC_TIMEOUT },
    );

    // Cleanup
    host.disconnect();
    joiner.disconnect();
  });

  it('create password-protected room + join with password', async () => {
    const host = await createSession({
      participantId: 'host-pw',
      displayName: 'Alice',
      relayUrl,
      password: 'secret123',
    });

    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(1),
      { timeout: SYNC_TIMEOUT },
    );

    const joiner = await joinSession({
      participantId: 'joiner-pw',
      displayName: 'Bob',
      relayUrl,
      roomCode: host.roomCode,
      password: 'secret123',
    });

    await vi.waitFor(
      () => expect(joiner.projection().participants.length).toBeGreaterThanOrEqual(1),
      { timeout: SYNC_TIMEOUT },
    );

    host.disconnect();
    joiner.disconnect();
  });

  it('updateName sets and removes room name', async () => {
    const host = await createSession({
      participantId: 'host-name',
      displayName: 'Alice',
      relayUrl,
    });

    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(1),
      { timeout: SYNC_TIMEOUT },
    );

    // Set a name
    host.updateName('Sprint 42');
    await vi.waitFor(() => expect(host.projection().settings.name).toBe('Sprint 42'), {
      timeout: SYNC_TIMEOUT,
    });

    // Update name
    host.updateName('Sprint 43');
    await vi.waitFor(() => expect(host.projection().settings.name).toBe('Sprint 43'), {
      timeout: SYNC_TIMEOUT,
    });

    // Remove name by passing undefined
    host.updateName();
    await vi.waitFor(() => expect(host.projection().settings.name).toBeUndefined(), {
      timeout: SYNC_TIMEOUT,
    });

    host.disconnect();
  });

  it('updateScale changes default scale', async () => {
    const host = await createSession({
      participantId: 'host-scale',
      displayName: 'Alice',
      relayUrl,
      defaultScale: FIBONACCI_SCALE,
    });

    await vi.waitFor(() => expect(host.projection().settings.defaultScale.id).toBe('fibonacci'), {
      timeout: SYNC_TIMEOUT,
    });

    host.updateScale(TSHIRT_SCALE);

    await vi.waitFor(() => expect(host.projection().settings.defaultScale.id).toBe('t-shirt'), {
      timeout: SYNC_TIMEOUT,
    });

    host.disconnect();
  });

  it('endSession writes meta.sessionEndedAt and propagates to joiner', async () => {
    const host = await createSession({
      participantId: 'host-es',
      displayName: 'Alice',
      relayUrl,
    });

    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(1),
      { timeout: SYNC_TIMEOUT },
    );

    const joiner = await joinSession({
      participantId: 'joiner-es',
      displayName: 'Bob',
      relayUrl,
      roomCode: host.roomCode,
    });

    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(2),
      { timeout: SYNC_TIMEOUT },
    );

    // Sanity: sessionEndedAt not set initially
    expect(host.projection().meta.sessionEndedAt).toBeUndefined();
    expect(joiner.projection().meta.sessionEndedAt).toBeUndefined();

    host.commands.endSession();

    // Both sides should see sessionEndedAt set
    await vi.waitFor(() => expect(host.projection().meta.sessionEndedAt).toBeTypeOf('number'), {
      timeout: SYNC_TIMEOUT,
    });
    await vi.waitFor(() => expect(joiner.projection().meta.sessionEndedAt).toBeTypeOf('number'), {
      timeout: SYNC_TIMEOUT,
    });

    host.disconnect();
    joiner.disconnect();
  });

  it('host skip propagates skippedAt to joiner', async () => {
    const host = await createSession({
      participantId: 'host-skip',
      displayName: 'Alice',
      relayUrl,
    });

    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(1),
      { timeout: SYNC_TIMEOUT },
    );

    const joiner = await joinSession({
      participantId: 'joiner-skip',
      displayName: 'Bob',
      relayUrl,
      roomCode: host.roomCode,
    });

    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(2),
      { timeout: SYNC_TIMEOUT },
    );

    const roundId = startRound(host, { title: 'Skip me' });

    await vi.waitFor(
      () => expect(host.projection().rounds.find((x) => x.id === roundId)).toBeDefined(),
      { timeout: SYNC_TIMEOUT },
    );

    host.commands.skipCurrentRound();

    await vi.waitFor(
      () => expect(host.projection().rounds.find((x) => x.id === roundId)?.status).toBe('skipped'),
      { timeout: SYNC_TIMEOUT },
    );
    await vi.waitFor(
      () =>
        expect(joiner.projection().rounds.find((x) => x.id === roundId)?.status).toBe('skipped'),
      { timeout: SYNC_TIMEOUT },
    );

    host.disconnect();
    joiner.disconnect();
  });

  it('unanimous vote auto-reveals without a manual reveal call', async () => {
    const host = await createSession({
      participantId: 'host-auto',
      displayName: 'Alice',
      relayUrl,
      defaultScale: FIBONACCI_SCALE,
    });

    const roundId = startRound(host, { title: 'Auto-reveal' });
    await vi.waitFor(
      () => expect(host.projection().rounds.find((x) => x.id === roundId)).toBeDefined(),
      { timeout: SYNC_TIMEOUT },
    );

    // Single online voter casts a numeric vote — unanimity. No manual reveal:
    // the 250ms auto-reveal interval must fire the terminal transition itself.
    host.commands.toggleCurrentVote('5');

    await vi.waitFor(
      () => expect(host.projection().rounds.find((x) => x.id === roundId)?.status).toBe('revealed'),
      { timeout: SYNC_TIMEOUT },
    );

    host.disconnect();
  });

  // -------------------------------------------------------------------------
  // ADR-0036 §6 — a rejoining participant comes back active
  // -------------------------------------------------------------------------

  /**
   * Build a joiner the way `hnch resume` does — the CLI's rejoin path calls
   * `wireSession` directly, so the flag under test is the one it passes.
   */
  function rejoin(roomUuid: string, roomCode: string) {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    joinDoc(doc, { participantId: 'rejoiner', displayName: 'Bob', joinedAt: Date.now() });
    awareness.setLocalStateField(AWARENESS_PARTICIPANT_ID_FIELD, 'rejoiner');
    return wireSession({
      doc,
      awareness,
      roomCode,
      roomUuid,
      participantId: 'rejoiner',
      relayUrl,
      clearLeftStatusOnSync: true,
    });
  }

  it('clears a stale leftAt after the snapshot syncs on rejoin', async () => {
    const host = await createSession({
      participantId: 'host-rejoin',
      displayName: 'Alice',
      relayUrl,
      defaultScale: FIBONACCI_SCALE,
    });

    const first = await joinSession({
      participantId: 'rejoiner',
      displayName: 'Bob',
      relayUrl,
      roomCode: host.roomCode,
    });
    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(2),
      { timeout: SYNC_TIMEOUT },
    );

    // Bob leaves deliberately — the host sees the soft-delete.
    leave(first.doc, 'rejoiner');
    await vi.waitFor(
      () => {
        const bob = host.projection().participants.find((p) => p.id === 'rejoiner');
        expect(bob).toBeDefined();
        expect(bob?.leftAt).toBeDefined();
      },
      { timeout: SYNC_TIMEOUT },
    );
    first.disconnect();

    const second = rejoin(host.roomUuid, host.roomCode);

    // The clear rides a higher Lamport clock than the snapshot's `leftAt`,
    // so the host sees Bob active again rather than greyed out.
    await vi.waitFor(
      () => {
        const bob = host.projection().participants.find((p) => p.id === 'rejoiner');
        expect(bob).toBeDefined();
        expect(bob?.leftAt).toBeUndefined();
      },
      { timeout: SYNC_TIMEOUT },
    );

    second.disconnect();
    host.disconnect();
  });
});
