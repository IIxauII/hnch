/**
 * `sessionExit` — the CLI's one way out of a live session.
 *
 * Each ending kind's order and outcome is pinned here, once: what is torn
 * down, what the device forgets, what is printed, and the exit code. The
 * rules it applies — `refusalVerdict` and `onSessionExpired` — keep their
 * own tests; the entry flows only say which ending it is.
 */

import { describe, expect, it, vi } from 'vitest';

import { sessionExit, type SessionExitOptions } from './session-exit.js';

function setup(opts: Partial<SessionExitOptions> = {}) {
  /** What happened, in order: the order is part of what is promised. */
  const calls: string[] = [];
  const session = {
    roomCode: 'ABC123',
    roomUuid: 'uuid-1',
    teardown: vi.fn(() => {
      calls.push('teardown');
    }),
  };
  const ui = {
    unmount: vi.fn(() => {
      calls.push('unmount');
    }),
  };
  const cache = {
    removeEntry: vi.fn((uuid: string) => {
      calls.push(`removeEntry:${uuid}`);
    }),
    clearPasswordHash: vi.fn((uuid: string) => {
      calls.push(`clearPasswordHash:${uuid}`);
    }),
  };
  const print = vi.fn((line: string) => {
    calls.push(`print:${line}`);
  });
  const exit = vi.fn((code: number): never => {
    calls.push(`exit:${code}`);
    return undefined as never;
  });

  const exiting = sessionExit({
    wasIn: () => true,
    typedPassword: false,
    print,
    exit,
    cache,
    ...opts,
  });
  return { exiting, calls, session, ui, cache, print, exit };
}

/** A session that is open, with its terminal UI up. */
function live(opts: Partial<SessionExitOptions> = {}) {
  const s = setup(opts);
  s.exiting.bind(s.session);
  s.exiting.attach(s.ui);
  return s;
}

describe('sessionExit — left', () => {
  it('takes the UI down, closes the session, forgets it, then exits 0', async () => {
    const { exiting, calls } = live();

    await exiting.end({ kind: 'left' });

    expect(calls).toEqual(['unmount', 'teardown', 'removeEntry:uuid-1', 'exit:0']);
  });

  // A cache that cannot be written is no reason to keep the user in the session.
  it('says so and still exits 0 when the cache cannot be written', async () => {
    const { exiting, calls, cache } = live();
    cache.removeEntry.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    await exiting.end({ kind: 'left' });

    expect(calls).toEqual([
      'unmount',
      'teardown',
      'print:Failed to clear cached session: disk full',
      'exit:0',
    ]);
  });
});

// The host ended the session for everyone, or removed this peer.
describe.each(['ended', 'removed'] as const)('sessionExit — %s', (kind) => {
  it('takes the UI down, closes the session, forgets it, prints why, then exits 0', async () => {
    const { exiting, calls } = live();

    await exiting.end({ kind, message: 'Session ended by Hana' });

    expect(calls).toEqual([
      'unmount',
      'teardown',
      'removeEntry:uuid-1',
      'print:Session ended by Hana',
      'exit:0',
    ]);
  });

  it('still prints why and exits 0 when the cache cannot be written', async () => {
    const { exiting, calls, cache } = live();
    cache.removeEntry.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    await exiting.end({ kind, message: 'Removed by host' });

    expect(calls.slice(-3)).toEqual([
      'print:Failed to clear cached session: disk full',
      'print:Removed by host',
      'exit:0',
    ]);
  });
});

// What a refusal forgets, says and exits with is `refusalVerdict`'s call
// (ADR-0044, ADR-0050); this applies it.
describe('sessionExit — refused', () => {
  it('a password changed mid-session: forgets only the hash and says how to get back in', async () => {
    const { exiting, calls } = live();

    await exiting.end({ kind: 'refused', reason: 'wrong-password' });

    expect(calls).toEqual([
      'unmount',
      'teardown',
      'clearPasswordHash:uuid-1',
      'print:Password changed — rejoin with: hnch join ABC123 --password',
      'exit:0',
    ]);
  });

  it('a password typed wrong at the door: forgets the attempt and exits 1', async () => {
    const { exiting, calls } = live({ wasIn: () => false, typedPassword: true });

    await exiting.end({ kind: 'refused', reason: 'wrong-password' });

    expect(calls.slice(2)).toEqual([
      'removeEntry:uuid-1',
      'print:That password is incorrect.',
      'exit:1',
    ]);
  });

  it('a full room, for someone who was in it: keeps the session and exits 1', async () => {
    const { exiting, calls, cache } = live();

    await exiting.end({ kind: 'refused', reason: 'room-full' });

    expect(calls).toEqual([
      'unmount',
      'teardown',
      'print:This room is full (max 20 participants).',
      'exit:1',
    ]);
    expect(cache.removeEntry).not.toHaveBeenCalled();
    expect(cache.clearPasswordHash).not.toHaveBeenCalled();
  });

  // `hnch join`'s "was in" is whether the session was ever got into, which a
  // closed session may no longer say.
  it('decides on what was true before the session closed', async () => {
    let open = true;
    const { exiting, calls, session } = setup({ wasIn: () => open, typedPassword: true });
    session.teardown.mockImplementation(() => {
      open = false;
      calls.push('teardown');
    });
    exiting.bind(session);

    await exiting.end({ kind: 'refused', reason: 'wrong-password' });

    expect(calls).toContain('clearPasswordHash:uuid-1');
  });

  it('still prints why and exits with the verdict when the cache cannot be written', async () => {
    const { exiting, calls, cache } = live();
    cache.clearPasswordHash.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    await exiting.end({ kind: 'refused', reason: 'wrong-password' });

    expect(calls.slice(-3)).toEqual([
      'print:Failed to clear cached session: disk full',
      'print:Password changed — rejoin with: hnch join ABC123 --password',
      'exit:0',
    ]);
  });

  // The relay no longer has the room (`onSessionExpired` words it).
  it('a room that is gone: forgets it, says so, exits 1', async () => {
    const { exiting, calls } = live();

    await exiting.end({ kind: 'refused', reason: 'unknown-room' });

    expect(calls).toEqual([
      'unmount',
      'teardown',
      'removeEntry:uuid-1',
      'print:Session expired (room no longer exists). Cached session cleared.',
      'exit:1',
    ]);
  });

  it('a room that is gone before the session is open: forgets it by the room it was opening', async () => {
    const { exiting, calls } = setup({ room: { roomCode: 'ABC123', roomUuid: 'uuid-0' } });

    await exiting.end({ kind: 'refused', reason: 'unknown-room' });

    expect(calls).toEqual([
      'removeEntry:uuid-0',
      'print:Session expired (room no longer exists). Cached session cleared.',
      'exit:1',
    ]);
  });

  it('a room that is gone before there is anything to forget: says so, exits 1', async () => {
    const { exiting, calls } = setup();

    await exiting.end({ kind: 'refused', reason: 'unknown-room' });

    expect(calls).toEqual([
      'print:Session expired (room no longer exists). Cached session cleared.',
      'exit:1',
    ]);
  });
});

describe('sessionExit — one way out', () => {
  // Ending the process is what stops the rest of the flow; until it has,
  // a second ending (the UI coming down, a session event) must not start
  // another exit.
  it('exits once: an ending that arrives while one is under way is dropped', async () => {
    const { exiting, exit, session } = live();

    const first = exiting.end({ kind: 'ended', message: 'Session ended.' });
    void exiting.end({ kind: 'left' });
    await first;

    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(session.teardown).toHaveBeenCalledOnce();
  });
});
