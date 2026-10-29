/**
 * The CLI's session adapter against a real relay: the run's, which
 * `vitest.relay-setup.ts` starts through the `@hnch/relay/testing` harness.
 *
 * How a live session behaves — rejoin, presence, the drivers, the gates,
 * teardown — is `@hnch/shared`'s `live-session` and is pinned once in its own
 * suite. What stays here is what the CLI adds on top: minting a room and
 * resolving one from its code, hashing the password, the settings patches the
 * TUI makes, changing the room's access, and `hnch resume`'s way in.
 *
 * Peers that must not see each other except through the relay reach it under
 * different hostnames: `y-websocket` links same-process providers on the
 * same URL over an in-memory channel.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createSession, joinSession, openSession, type SessionHandle } from './session.js';
import { FIBONACCI_SCALE, isActiveParticipant, TSHIRT_SCALE, type SyncStatus } from '@hnch/shared';
import { testRelayUrl } from '../vitest.relay-url.js';

/** The relay as the host reaches it: the run's, from vitest.relay-setup.ts. */
const relayUrl = testRelayUrl();
const relayPort = new URL(relayUrl).port;
if (relayPort === '') throw new Error(`test relay URL has no port: ${relayUrl}`);
/** The relay under another name, for a second peer. */
const otherRelayUrl = `http://127.0.0.1:${relayPort}`;

/** Wait timeout for cross-client CRDT propagation over a local loopback relay. */
const SYNC_TIMEOUT = 5_000;

const open: SessionHandle[] = [];

afterEach(() => {
  for (const session of open.splice(0)) session.teardown();
});

function track(session: SessionHandle): SessionHandle {
  open.push(session);
  return session;
}

describe('session integration', () => {
  it('create + join + vote + reveal', async () => {
    const host = track(
      await createSession({
        participantId: 'host-1',
        displayName: 'Alice',
        relayUrl,
        sessionName: 'Test Sprint',
        defaultScale: FIBONACCI_SCALE,
      }),
    );
    expect(host.roomCode).toHaveLength(6);
    await host.whenJoined();

    const joiner = track(
      await joinSession({
        participantId: 'joiner-1',
        displayName: 'Bob',
        relayUrl: otherRelayUrl,
        roomCode: host.roomCode,
      }),
    );
    await joiner.whenJoined();
    expect(joiner.hasJoined()).toBe(true);
    expect(joiner.projection().settings.name).toBe('Test Sprint');
    await vi.waitFor(() => expect(host.onlineIds()).toEqual(new Set(['host-1', 'joiner-1'])), {
      timeout: SYNC_TIMEOUT,
    });

    const started = host.commands.startRound({ title: 'Test Story' });
    if (!started.applied) throw new Error(`startRound refused: ${started.reason}`);
    await vi.waitFor(() => expect(joiner.current()?.id).toBe(started.id), {
      timeout: SYNC_TIMEOUT,
    });

    host.commands.toggleCurrentVote('5');
    joiner.commands.toggleCurrentVote('8');

    await vi.waitFor(
      () => {
        expect(host.current()?.status).toBe('revealed');
        expect(joiner.current()?.votes).toEqual({ 'host-1': '5', 'joiner-1': '8' });
      },
      { timeout: SYNC_TIMEOUT },
    );
  });

  it('onChange fires as presence changes and as the agenda changes', async () => {
    const host = track(
      await createSession({ participantId: 'host-oc', displayName: 'Alice', relayUrl }),
    );
    await host.whenJoined();
    const online: Array<ReadonlySet<string>> = [];
    const agenda: string[][] = [];
    host.onChange(() => {
      online.push(host.onlineIds());
      agenda.push(host.projection().agenda.map((item) => item.title ?? ''));
    });

    const joiner = track(
      await joinSession({
        participantId: 'joiner-oc',
        displayName: 'Bob',
        relayUrl: otherRelayUrl,
        roomCode: host.roomCode,
      }),
    );
    await vi.waitFor(() => expect(online.at(-1)).toEqual(new Set(['host-oc', 'joiner-oc'])), {
      timeout: SYNC_TIMEOUT,
    });

    expect(host.commands.addItem({ title: 'Mine' }).applied).toBe(true);
    expect(agenda.at(-1)).toEqual(['Mine']);
    // Appended after what the joiner has seen, so it must have seen 'Mine'.
    await vi.waitFor(() => expect(joiner.projection().agenda).toHaveLength(1), {
      timeout: SYNC_TIMEOUT,
    });
    expect(joiner.commands.addItem({ title: 'Theirs' }).applied).toBe(true);
    await vi.waitFor(() => expect(agenda.at(-1)).toEqual(['Mine', 'Theirs']), {
      timeout: SYNC_TIMEOUT,
    });

    joiner.teardown();
    await vi.waitFor(() => expect(online.at(-1)).toEqual(new Set(['host-oc'])), {
      timeout: SYNC_TIMEOUT,
    });
  });

  it('delivers session events to each listener until it unsubscribes', async () => {
    const host = track(
      await createSession({ participantId: 'host-ev', displayName: 'Alice', relayUrl }),
    );
    const kept: string[] = [];
    const dropped: string[] = [];
    host.onSessionEvent((event) => kept.push(event.message));
    const unsubscribe = host.onSessionEvent((event) => dropped.push(event.message));

    unsubscribe();
    expect(host.commands.endSession().applied).toBe(true);

    await vi.waitFor(() => expect(kept).toEqual(['Session ended.']));
    expect(dropped).toEqual([]);
  });

  it('create password-protected room + join with password', async () => {
    const host = track(
      await createSession({
        participantId: 'host-pw',
        displayName: 'Alice',
        relayUrl,
        password: 'secret123',
      }),
    );
    expect(host.passwordHash).toBeTypeOf('string');
    await host.whenJoined();

    await expect(
      joinSession({
        participantId: 'joiner-pw',
        displayName: 'Bob',
        relayUrl: otherRelayUrl,
        roomCode: host.roomCode,
      }),
    ).rejects.toThrow('Room requires a password');

    const joiner = track(
      await joinSession({
        participantId: 'joiner-pw',
        displayName: 'Bob',
        relayUrl: otherRelayUrl,
        roomCode: host.roomCode,
        password: 'secret123',
      }),
    );

    await joiner.whenJoined();
    expect(joiner.passwordHash).toBe(host.passwordHash);
  });

  it('updateName sets and removes room name', async () => {
    const host = track(
      await createSession({ participantId: 'host-name', displayName: 'Alice', relayUrl }),
    );

    host.updateName('Sprint 42');
    expect(host.projection().settings.name).toBe('Sprint 42');

    host.updateName('Sprint 43');
    expect(host.projection().settings.name).toBe('Sprint 43');

    host.updateName();
    expect(host.projection().settings.name).toBeUndefined();
  });

  it('updateScale changes default scale', async () => {
    const host = track(
      await createSession({
        participantId: 'host-scale',
        displayName: 'Alice',
        relayUrl,
        defaultScale: FIBONACCI_SCALE,
      }),
    );
    expect(host.projection().settings.defaultScale.id).toBe('fibonacci');

    host.updateScale(TSHIRT_SCALE);

    expect(host.projection().settings.defaultScale.id).toBe('t-shirt');
  });

  it('updateAccess protects the room, and the host stays in on the new password', async () => {
    const host = track(
      await createSession({ participantId: 'host-acc', displayName: 'Alice', relayUrl }),
    );
    await host.whenJoined();
    const statuses: SyncStatus[] = [];
    host.onStatusChange((status) => statuses.push(status));

    await host.updateAccess('password', 'new secret');

    // Its own socket re-handshakes with the new hash, and is taken.
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('connected'), { timeout: SYNC_TIMEOUT });
    await expect(
      joinSession({
        participantId: 'joiner-acc',
        displayName: 'Bob',
        relayUrl: otherRelayUrl,
        roomCode: host.roomCode,
      }),
    ).rejects.toThrow('Room requires a password');
    const joiner = track(
      await joinSession({
        participantId: 'joiner-acc',
        displayName: 'Bob',
        relayUrl: otherRelayUrl,
        roomCode: host.roomCode,
        password: 'new secret',
      }),
    );
    await joiner.whenJoined();

    await host.updateAccess('open');

    const third = track(
      await joinSession({
        participantId: 'third-acc',
        displayName: 'Cy',
        relayUrl: `http://LOCALHOST:${relayPort}`,
        roomCode: host.roomCode,
      }),
    );
    await third.whenJoined();
  });

  it('updateAccess refuses a blank password before reaching the relay', async () => {
    const host = track(
      await createSession({ participantId: 'host-blank', displayName: 'Alice', relayUrl }),
    );

    await expect(host.updateAccess('password', '   ')).rejects.toThrow();
  });

  it('a resumed session clears the leftAt its last visit left, like any join', async () => {
    const host = track(
      await createSession({ participantId: 'host-rejoin', displayName: 'Alice', relayUrl }),
    );
    const first = await joinSession({
      participantId: 'rejoiner',
      displayName: 'Bob',
      relayUrl: otherRelayUrl,
      roomCode: host.roomCode,
    });
    await first.whenJoined();
    expect(first.commands.leave().applied).toBe(true);
    await vi.waitFor(
      () => {
        const bob = host.projection().participants.find((p) => p.id === 'rejoiner');
        expect(bob?.leftAt).toBeDefined();
      },
      { timeout: SYNC_TIMEOUT },
    );
    first.teardown();

    // As `hnch resume` opens it: the room and hash it remembered.
    const resumed = track(
      openSession({
        participantId: 'rejoiner',
        displayName: 'Bob',
        relayUrl: otherRelayUrl,
        roomCode: host.roomCode,
        roomUuid: host.roomUuid,
      }),
    );

    await resumed.whenJoined();
    await vi.waitFor(
      () => {
        const bob = host.projection().participants.find((p) => p.id === 'rejoiner');
        expect(bob !== undefined && isActiveParticipant(bob)).toBe(true);
      },
      { timeout: SYNC_TIMEOUT },
    );
  });
});
