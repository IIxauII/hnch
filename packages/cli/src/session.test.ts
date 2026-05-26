/**
 * Integration test: spin up relay, create + join session via CLI
 * session API, verify votes sync and reveal works.
 *
 * Uses `vi.waitFor` instead of fixed sleeps so tests are as fast as the
 * underlying WS sync allows rather than being gated on a worst-case
 * duration baked in at write-time.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createCodePool } from '../../relay/src/code-pool.js';
import { createRoomStore } from '../../relay/src/room-store.js';
import { createRelayServer } from '../../relay/src/server.js';
import { createSession, joinSession } from './session.js';
import { FIBONACCI_SCALE, TSHIRT_SCALE } from '@hnch/shared';

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
    const roundId = host.newRound('Test Story');

    // Wait until the round appears in the host projection.
    await vi.waitFor(
      () => expect(host.projection().rounds.find((r) => r.id === roundId)).toBeDefined(),
      { timeout: SYNC_TIMEOUT },
    );

    // Both vote
    host.vote('5');
    joiner.vote('8');

    // Wait for both votes to be visible to both clients.
    await vi.waitFor(
      () => {
        const r = host.projection().rounds.find((r) => r.id === roundId);
        expect(r?.votes['host-1']).toBe('5');
        expect(r?.votes['joiner-1']).toBe('8');
      },
      { timeout: SYNC_TIMEOUT },
    );
    await vi.waitFor(
      () => {
        const r = joiner.projection().rounds.find((r) => r.id === roundId);
        expect(r?.votes['host-1']).toBe('5');
        expect(r?.votes['joiner-1']).toBe('8');
      },
      { timeout: SYNC_TIMEOUT },
    );

    // Host reveals
    host.reveal();
    await vi.waitFor(
      () =>
        expect(host.projection().rounds.find((r) => r.id === roundId)?.revealedAt).toBeDefined(),
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

  it('new round and re-vote', async () => {
    const host = await createSession({
      participantId: 'host-rv',
      displayName: 'Alice',
      relayUrl,
    });

    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(1),
      { timeout: SYNC_TIMEOUT },
    );

    // Start round, vote, reveal
    const round1Id = host.newRound('Story 1');
    host.vote('3');

    await vi.waitFor(
      () => {
        const r = host.projection().rounds.find((r) => r.id === round1Id);
        expect(r?.votes['host-rv']).toBe('3');
      },
      { timeout: SYNC_TIMEOUT },
    );

    host.reveal();

    await vi.waitFor(
      () =>
        expect(host.projection().rounds.find((r) => r.id === round1Id)?.revealedAt).toBeDefined(),
      { timeout: SYNC_TIMEOUT },
    );

    // Re-vote should create new round linked to original
    const round2Id = host.revote();

    await vi.waitFor(
      () => expect(host.projection().rounds.find((r) => r.id === round2Id)).toBeDefined(),
      { timeout: SYNC_TIMEOUT },
    );

    const round2 = host.projection().rounds.find((r) => r.id === round2Id);
    expect(round2).toBeDefined();
    expect(round2!.parentRoundId).toBe(round1Id);

    host.disconnect();
  });

  it('newRound writes ticketId when provided and omits it when undefined', async () => {
    const host = await createSession({
      participantId: 'host-new-round-ticket',
      displayName: 'Alice',
      relayUrl,
    });

    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(1),
      { timeout: SYNC_TIMEOUT },
    );

    // Round with both title and ticketId
    const r1 = host.newRound('Auth migration', 'PROJ-42');
    // Round with ticketId only
    const r2 = host.newRound(undefined, 'PROJ-77');
    // Round with neither (skip prompts)
    const r3 = host.newRound();

    await vi.waitFor(
      () => {
        const p = host.projection();
        expect(p.rounds.find((r) => r.id === r1)).toBeDefined();
        expect(p.rounds.find((r) => r.id === r2)).toBeDefined();
        expect(p.rounds.find((r) => r.id === r3)).toBeDefined();
      },
      { timeout: SYNC_TIMEOUT },
    );

    const p = host.projection();
    const round1 = p.rounds.find((r) => r.id === r1);
    const round2 = p.rounds.find((r) => r.id === r2);
    const round3 = p.rounds.find((r) => r.id === r3);

    expect(round1?.title).toBe('Auth migration');
    expect(round1?.ticketId).toBe('PROJ-42');
    expect(round2?.title).toBeUndefined();
    expect(round2?.ticketId).toBe('PROJ-77');
    expect(round3?.title).toBeUndefined();
    expect(round3?.ticketId).toBeUndefined();

    host.disconnect();
  });

  it('revote inherits title, description, and ticketId from parent round', async () => {
    const host = await createSession({
      participantId: 'host-revote-inherit',
      displayName: 'Alice',
      relayUrl,
    });

    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(1),
      { timeout: SYNC_TIMEOUT },
    );

    // Start round with title, description, and ticketId
    const round1Id = host.newRound('Story 2');

    await vi.waitFor(
      () => expect(host.projection().rounds.find((r) => r.id === round1Id)).toBeDefined(),
      { timeout: SYNC_TIMEOUT },
    );

    // Manually set description and ticketId on the parent round
    const roundsArray = host.doc.getArray('rounds');
    const roundsList = roundsArray.toArray() as any[];
    const parentRound = roundsList.find((r: any) => r.get('id') === round1Id);
    if (parentRound) {
      parentRound.set('description', 'Some context about the story');
      parentRound.set('ticketId', 'https://github.com/foo/bar/issues/1');
    }

    await vi.waitFor(
      () => {
        const r = host.projection().rounds.find((r) => r.id === round1Id);
        expect(r?.ticketId).toBe('https://github.com/foo/bar/issues/1');
      },
      { timeout: SYNC_TIMEOUT },
    );

    host.vote('5');

    await vi.waitFor(
      () => {
        const r = host.projection().rounds.find((r) => r.id === round1Id);
        expect(r?.votes['host-revote-inherit']).toBe('5');
      },
      { timeout: SYNC_TIMEOUT },
    );

    host.reveal();

    await vi.waitFor(
      () =>
        expect(host.projection().rounds.find((r) => r.id === round1Id)?.revealedAt).toBeDefined(),
      { timeout: SYNC_TIMEOUT },
    );

    // Re-vote should inherit title, description, and ticketId
    const round2Id = host.revote();

    await vi.waitFor(
      () => expect(host.projection().rounds.find((r) => r.id === round2Id)).toBeDefined(),
      { timeout: SYNC_TIMEOUT },
    );

    const p = host.projection();
    const round1 = p.rounds.find((r) => r.id === round1Id);
    const round2 = p.rounds.find((r) => r.id === round2Id);

    expect(round2).toBeDefined();
    expect(round2!.title).toBe('Story 2');
    expect(round2!.description).toBe('Some context about the story');
    expect(round2!.ticketId).toBe('https://github.com/foo/bar/issues/1');
    expect(round2!.title).toBe(round1!.title);
    expect(round2!.description).toBe(round1!.description);
    expect(round2!.ticketId).toBe(round1!.ticketId);
    expect(round2!.parentRoundId).toBe(round1Id);

    host.disconnect();
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

  it('endSessionForEveryone throws if caller is not host', async () => {
    const host = await createSession({
      participantId: 'host-es-guard',
      displayName: 'Alice',
      relayUrl,
    });

    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(1),
      { timeout: SYNC_TIMEOUT },
    );

    const joiner = await joinSession({
      participantId: 'joiner-es-guard',
      displayName: 'Bob',
      relayUrl,
      roomCode: host.roomCode,
    });

    await vi.waitFor(
      () => expect(host.projection().participants.length).toBeGreaterThanOrEqual(2),
      { timeout: SYNC_TIMEOUT },
    );

    // Joiner is not host — must throw
    expect(() => joiner.endSessionForEveryone()).toThrow(
      'Only the current host can end the session',
    );

    host.disconnect();
    joiner.disconnect();
  });

  it('endSessionForEveryone writes meta.sessionEndedAt and propagates to joiner', async () => {
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

    host.endSessionForEveryone();

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

    const roundId = host.newRound('Skip me');

    await vi.waitFor(
      () => expect(host.projection().rounds.find((r) => r.id === roundId)).toBeDefined(),
      { timeout: SYNC_TIMEOUT },
    );

    host.skip();

    await vi.waitFor(
      () =>
        expect(host.projection().rounds.find((r) => r.id === roundId)?.skippedAt).toBeTypeOf(
          'number',
        ),
      { timeout: SYNC_TIMEOUT },
    );
    await vi.waitFor(
      () =>
        expect(joiner.projection().rounds.find((r) => r.id === roundId)?.skippedAt).toBeTypeOf(
          'number',
        ),
      { timeout: SYNC_TIMEOUT },
    );

    host.disconnect();
    joiner.disconnect();
  });
});
