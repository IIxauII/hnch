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
import { randomBytes } from 'node:crypto';
import { testRelayUrl } from '../vitest.relay-url.js';

/** The relay as the host reaches it: the run's, from vitest.relay-setup.ts. */
const relayUrl = testRelayUrl();
const relayPort = new URL(relayUrl).port;
if (relayPort === '') throw new Error(`test relay URL has no port: ${relayUrl}`);
/** The relay under another name, for a second peer. */
const otherRelayUrl = `http://127.0.0.1:${relayPort}`;

/** Wait timeout for cross-client CRDT propagation over a local loopback relay. */
const SYNC_TIMEOUT = 5_000;

/** Each participant's device key: one per id, so a resume presents the key the first visit did. */
const deviceKeys = new Map<string, string>();
function keyOf(participantId: string): string {
  let key = deviceKeys.get(participantId);
  if (key === undefined) {
    key = randomBytes(32).toString('hex');
    deviceKeys.set(participantId, key);
  }
  return key;
}

const open: SessionHandle[] = [];

afterEach(() => {
  vi.restoreAllMocks();
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
        deviceKey: keyOf('host-1'),
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
        deviceKey: keyOf('joiner-1'),
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
      await createSession({
        participantId: 'host-oc',
        deviceKey: keyOf('host-oc'),
        displayName: 'Alice',
        relayUrl,
      }),
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
        deviceKey: keyOf('joiner-oc'),
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
      await createSession({
        participantId: 'host-ev',
        deviceKey: keyOf('host-ev'),
        displayName: 'Alice',
        relayUrl,
      }),
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
        deviceKey: keyOf('host-pw'),
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
        deviceKey: keyOf('joiner-pw'),
        displayName: 'Bob',
        relayUrl: otherRelayUrl,
        roomCode: host.roomCode,
      }),
    ).rejects.toThrow('Room requires a password');

    const joiner = track(
      await joinSession({
        participantId: 'joiner-pw',
        deviceKey: keyOf('joiner-pw'),
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
      await createSession({
        participantId: 'host-name',
        deviceKey: keyOf('host-name'),
        displayName: 'Alice',
        relayUrl,
      }),
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
        deviceKey: keyOf('host-scale'),
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
      await createSession({
        participantId: 'host-acc',
        deviceKey: keyOf('host-acc'),
        displayName: 'Alice',
        relayUrl,
      }),
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
        deviceKey: keyOf('joiner-acc'),
        displayName: 'Bob',
        relayUrl: otherRelayUrl,
        roomCode: host.roomCode,
      }),
    ).rejects.toThrow('Room requires a password');
    const joiner = track(
      await joinSession({
        participantId: 'joiner-acc',
        deviceKey: keyOf('joiner-acc'),
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
        deviceKey: keyOf('third-acc'),
        displayName: 'Cy',
        relayUrl: `http://LOCALHOST:${relayPort}`,
        roomCode: host.roomCode,
      }),
    );
    await third.whenJoined();
  });

  it('updateAccess refuses a blank password before reaching the relay', async () => {
    const host = track(
      await createSession({
        participantId: 'host-blank',
        deviceKey: keyOf('host-blank'),
        displayName: 'Alice',
        relayUrl,
      }),
    );

    await expect(host.updateAccess('password', '   ')).rejects.toThrow();
  });

  it('a resumed session clears the leftAt its last visit left, like any join', async () => {
    const host = track(
      await createSession({
        participantId: 'host-rejoin',
        deviceKey: keyOf('host-rejoin'),
        displayName: 'Alice',
        relayUrl,
      }),
    );
    const first = await joinSession({
      participantId: 'rejoiner',
      deviceKey: keyOf('rejoiner'),
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
      await openSession({
        participantId: 'rejoiner',
        deviceKey: keyOf('rejoiner'),
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

describe('session integration — host-only access (ADR-0059)', () => {
  async function hostAndJoiner(prefix: string): Promise<{
    host: SessionHandle;
    joiner: SessionHandle;
  }> {
    const host = track(
      await createSession({
        participantId: `${prefix}-host`,
        deviceKey: keyOf(`${prefix}-host`),
        displayName: 'Alice',
        relayUrl,
      }),
    );
    await host.whenJoined();
    const joiner = track(
      await joinSession({
        participantId: `${prefix}-joiner`,
        deviceKey: keyOf(`${prefix}-joiner`),
        displayName: 'Bob',
        relayUrl: otherRelayUrl,
        roomCode: host.roomCode,
      }),
    );
    await joiner.whenJoined();
    await vi.waitFor(
      () => {
        expect(host.onlineIds()).toEqual(new Set([`${prefix}-host`, `${prefix}-joiner`]));
        // Presence can arrive before the joiner's row: a handoff needs both.
        expect(host.projection().participants.map((p) => p.id)).toContain(`${prefix}-joiner`);
      },
      { timeout: SYNC_TIMEOUT },
    );
    return { host, joiner };
  }

  it('create --password leaves the creator able to change access once the socket is up', async () => {
    const host = track(
      await createSession({
        participantId: 'pw-later',
        deviceKey: keyOf('pw-later'),
        displayName: 'Alice',
        relayUrl,
        password: 'secret123',
      }),
    );
    await host.whenJoined();

    await expect(host.updateAccess('open')).resolves.toBeUndefined();
  });

  it('tells a participant who is not the host that only the host can change the password', async () => {
    const { joiner } = await hostAndJoiner('nh');

    await expect(joiner.updateAccess('password', 'mine now')).rejects.toThrow(
      'Only the host can change the password',
    );
  });

  it.each([
    [
      'the room is gone',
      () => Response.json({ reason: 'unknown-room' }, { status: 404 }),
      'The relay no longer knows this room',
    ],
    [
      'the relay does not take the key',
      () => Response.json({ reason: 'unauthenticated' }, { status: 401 }),
      'The relay did not accept this device as the host',
    ],
    [
      'no answer comes',
      () => {
        throw new TypeError('fetch failed');
      },
      'The relay could not be reached',
    ],
  ])('says so in words when an access change fails because %s', async (_case, answer, message) => {
    const host = track(
      await createSession({
        participantId: `acc-${message.length}`,
        deviceKey: keyOf(`acc-${message.length}`),
        displayName: 'Alice',
        relayUrl,
      }),
    );
    await host.whenJoined();
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
      String(input).endsWith('/access') ? answer() : realFetch(input, init),
    );

    await expect(host.updateAccess('open')).rejects.toThrow(message);
  });

  it('says the room was made but left open when create cannot set its password', async () => {
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).endsWith('/access')) throw new TypeError('fetch failed');
      return realFetch(input, init);
    });

    const created = createSession({
      participantId: 'cr-unset',
      deviceKey: keyOf('cr-unset'),
      displayName: 'Alice',
      relayUrl,
      password: 'secret123',
    });

    await expect(created).rejects.toThrow(
      /^Room [A-Z0-9]{6} was created, but its password was not set: The relay could not be reached\. The room is open to anyone with the code and was not joined\. Run `hnch create --password` again\.$/,
    );
    await expect(created).rejects.toHaveProperty('cause.cause', expect.any(TypeError));
  });

  it('keeps the doc-only handoff out of the session commands, torn down or not', async () => {
    const host = await createSession({
      participantId: 'no-ho',
      deviceKey: keyOf('no-ho'),
      displayName: 'Alice',
      relayUrl,
    });
    await host.whenJoined();

    expect('handoffHost' in host.commands).toBe(false);
    expect(host.commands).toBe(host.commands);
    const live = host.commands;

    host.teardown();

    expect('handoffHost' in host.commands).toBe(false);
    expect(host.commands).not.toBe(live);
    expect(host.commands).toBe(host.commands);
    expect(host.commands.endSession()).toMatchObject({ applied: false });
  });

  it('a handoff moves the power to change access along with the host', async () => {
    const { host, joiner } = await hostAndJoiner('ho');

    await expect(host.handoffHost('ho-joiner')).resolves.toEqual({ applied: true });
    await vi.waitFor(() => expect(joiner.isHost()).toBe(true), { timeout: SYNC_TIMEOUT });

    await expect(joiner.updateAccess('password', 'handed over')).resolves.toBeUndefined();
    await expect(host.updateAccess('open')).rejects.toThrow(
      'Only the host can change the password',
    );
  });

  it('a handoff the relay refuses leaves the host unchanged', async () => {
    const { host, joiner } = await hostAndJoiner('rf');
    // The host's id on a second device, with that device's own key: the doc
    // calls it host, the relay does not take its key.
    const elsewhere = track(
      await openSession({
        participantId: 'rf-host',
        deviceKey: randomBytes(32).toString('hex'),
        displayName: 'Alice',
        relayUrl: `http://LOCALHOST:${relayPort}`,
        roomCode: host.roomCode,
        roomUuid: host.roomUuid,
      }),
    );
    await elsewhere.whenJoined();
    await vi.waitFor(() => expect(elsewhere.onlineIds().has('rf-joiner')).toBe(true), {
      timeout: SYNC_TIMEOUT,
    });

    await expect(elsewhere.handoffHost('rf-joiner')).resolves.toEqual({
      applied: false,
      reason: 'unauthenticated',
    });
    expect(elsewhere.projection().settings.hostParticipantId).toBe('rf-host');
    // A later write from the same socket: once the joiner has it, it would have
    // any handoff written before it too.
    elsewhere.updateName('after the refusal');
    await vi.waitFor(() => expect(joiner.projection().settings.name).toBe('after the refusal'), {
      timeout: SYNC_TIMEOUT,
    });
    expect(joiner.projection().settings.hostParticipantId).toBe('rf-host');
    expect(host.isHost()).toBe(true);
  });

  it('a resumed host still holds access: the resume presents its key', async () => {
    const first = await createSession({
      participantId: 'rs-host',
      deviceKey: keyOf('rs-host'),
      displayName: 'Alice',
      relayUrl,
    });
    await first.whenJoined();
    await first.flushUpdates();
    first.teardown();

    const resumed = track(
      await openSession({
        participantId: 'rs-host',
        deviceKey: keyOf('rs-host'),
        displayName: 'Alice',
        relayUrl,
        roomCode: first.roomCode,
        roomUuid: first.roomUuid,
      }),
    );
    await resumed.whenJoined();

    await expect(resumed.updateAccess('password', 'still mine')).resolves.toBeUndefined();
  });
});
