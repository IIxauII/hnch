/**
 * Integration test: spin up relay, create + join session via CLI
 * session API, verify votes sync and reveal works.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
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

    // Wait for sync
    await sleep(500);

    // Joiner joins
    const joiner = await joinSession({
      participantId: 'joiner-1',
      displayName: 'Bob',
      relayUrl,
      roomCode: host.roomCode,
    });

    // Wait for sync
    await sleep(1000);

    // Host starts a round
    const roundId = host.newRound('Test Story');

    // Wait for round to propagate
    await sleep(500);

    // Both vote
    host.vote('5');
    joiner.vote('8');

    // Wait for votes to propagate
    await sleep(500);

    // Verify both see votes
    const hostProjection = host.projection();
    const joinerProjection = joiner.projection();

    const hostRound = hostProjection.rounds.find((r) => r.id === roundId);
    const joinerRound = joinerProjection.rounds.find((r) => r.id === roundId);

    expect(hostRound).toBeDefined();
    expect(hostRound!.votes['host-1']).toBe('5');
    expect(hostRound!.votes['joiner-1']).toBe('8');

    expect(joinerRound).toBeDefined();
    expect(joinerRound!.votes['host-1']).toBe('5');
    expect(joinerRound!.votes['joiner-1']).toBe('8');

    // Host reveals
    host.reveal();
    await sleep(500);

    const revealedRound = host.projection().rounds.find((r) => r.id === roundId);
    expect(revealedRound!.revealedAt).toBeDefined();

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

    await sleep(500);

    const joiner = await joinSession({
      participantId: 'joiner-pw',
      displayName: 'Bob',
      relayUrl,
      roomCode: host.roomCode,
      password: 'secret123',
    });

    await sleep(500);

    // Both should be connected
    expect(joiner.projection().participants.length).toBeGreaterThanOrEqual(1);

    host.disconnect();
    joiner.disconnect();
  });

  it('new round and re-vote', async () => {
    const host = await createSession({
      participantId: 'host-rv',
      displayName: 'Alice',
      relayUrl,
    });

    await sleep(500);

    // Start round, vote, reveal
    const round1Id = host.newRound('Story 1');
    host.vote('3');
    await sleep(300);
    host.reveal();
    await sleep(300);

    // Re-vote should create new round linked to original
    const round2Id = host.revote();
    await sleep(300);

    const p = host.projection();
    const round2 = p.rounds.find((r) => r.id === round2Id);
    expect(round2).toBeDefined();
    expect(round2!.parentRoundId).toBe(round1Id);

    host.disconnect();
  });

  it('revote inherits title, description, and ticketId from parent round', async () => {
    const host = await createSession({
      participantId: 'host-revote-inherit',
      displayName: 'Alice',
      relayUrl,
    });

    await sleep(500);

    // Start round with title, description, and ticketId
    const round1Id = host.newRound('Story 2');
    await sleep(300);

    // Manually set description and ticketId on the parent round
    const roundsArray = host.doc.getArray('rounds');
    const roundsList = roundsArray.toArray() as any[];
    const parentRound = roundsList.find((r: any) => r.get('id') === round1Id);
    if (parentRound) {
      parentRound.set('description', 'Some context about the story');
      parentRound.set('ticketId', 'https://github.com/foo/bar/issues/1');
    }
    await sleep(300);

    host.vote('5');
    await sleep(300);
    host.reveal();
    await sleep(300);

    // Re-vote should inherit title, description, and ticketId
    const round2Id = host.revote();
    await sleep(300);

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

    await sleep(300);

    // Set a name
    host.updateName('Sprint 42');
    await sleep(300);
    expect(host.projection().settings.name).toBe('Sprint 42');

    // Update name
    host.updateName('Sprint 43');
    await sleep(300);
    expect(host.projection().settings.name).toBe('Sprint 43');

    // Remove name by passing undefined
    host.updateName();
    await sleep(300);
    expect(host.projection().settings.name).toBeUndefined();

    host.disconnect();
  });

  it('updateScale changes default scale', async () => {
    const host = await createSession({
      participantId: 'host-scale',
      displayName: 'Alice',
      relayUrl,
      defaultScale: FIBONACCI_SCALE,
    });

    await sleep(300);

    expect(host.projection().settings.defaultScale.id).toBe('fibonacci');

    host.updateScale(TSHIRT_SCALE);
    await sleep(300);

    expect(host.projection().settings.defaultScale.id).toBe('t-shirt');

    host.disconnect();
  });

  it('endSessionForEveryone throws if caller is not host', async () => {
    const host = await createSession({
      participantId: 'host-es-guard',
      displayName: 'Alice',
      relayUrl,
    });

    await sleep(500);

    const joiner = await joinSession({
      participantId: 'joiner-es-guard',
      displayName: 'Bob',
      relayUrl,
      roomCode: host.roomCode,
    });

    await sleep(500);

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

    await sleep(500);

    const joiner = await joinSession({
      participantId: 'joiner-es',
      displayName: 'Bob',
      relayUrl,
      roomCode: host.roomCode,
    });

    await sleep(500);

    // Sanity: sessionEndedAt not set initially
    expect(host.projection().meta.sessionEndedAt).toBeUndefined();
    expect(joiner.projection().meta.sessionEndedAt).toBeUndefined();

    host.endSessionForEveryone();
    await sleep(500);

    // Both sides should see sessionEndedAt set
    expect(host.projection().meta.sessionEndedAt).toBeTypeOf('number');
    expect(joiner.projection().meta.sessionEndedAt).toBeTypeOf('number');

    host.disconnect();
    joiner.disconnect();
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
