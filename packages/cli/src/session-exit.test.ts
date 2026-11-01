/**
 * `sessionExit` — the CLI's one way out of a live session.
 *
 * Each ending kind's order and outcome is pinned here, once: what is torn
 * down, what the device forgets, what is printed, and the exit code. The
 * rules it applies — `refusalVerdict` and `onSessionExpired` — keep their
 * own tests; the entry flows only say which ending it is (`onRejectionFor`,
 * `runUntilExit`, tested below for exactly that).
 */

import type { SessionEvent } from '@hnch/shared';
import { describe, expect, it, vi } from 'vitest';

import { watchForRefusal } from './refusal.js';
import {
  onRejectionFor,
  runUntilExit,
  sessionExit,
  type SessionExitOptions,
} from './session-exit.js';

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
    exitProcess: exit,
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

    await exiting.exit({ kind: 'left' });

    expect(calls).toEqual(['unmount', 'teardown', 'removeEntry:uuid-1', 'exit:0']);
  });

  // A cache that cannot be written is no reason to keep the user in the session.
  it('says so and still exits 0 when the cache cannot be written', async () => {
    const { exiting, calls, cache } = live();
    cache.removeEntry.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    await exiting.exit({ kind: 'left' });

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

    await exiting.exit({ kind, message: 'Session ended by Hana' });

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

    await exiting.exit({ kind, message: 'Removed by host' });

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

    await exiting.exit({ kind: 'refused', reason: 'wrong-password' });

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

    await exiting.exit({ kind: 'refused', reason: 'wrong-password' });

    expect(calls.slice(2)).toEqual([
      'removeEntry:uuid-1',
      'print:That password is incorrect.',
      'exit:1',
    ]);
  });

  it('a full room, for someone who was in it: keeps the session and exits 1', async () => {
    const { exiting, calls, cache } = live();

    await exiting.exit({ kind: 'refused', reason: 'room-full' });

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

    await exiting.exit({ kind: 'refused', reason: 'wrong-password' });

    expect(calls).toContain('clearPasswordHash:uuid-1');
  });

  it('still prints why and exits with the verdict when the cache cannot be written', async () => {
    const { exiting, calls, cache } = live();
    cache.clearPasswordHash.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    await exiting.exit({ kind: 'refused', reason: 'wrong-password' });

    expect(calls.slice(-3)).toEqual([
      'print:Failed to clear cached session: disk full',
      'print:Password changed — rejoin with: hnch join ABC123 --password',
      'exit:0',
    ]);
  });

  // The relay no longer has the room (`onSessionExpired` words it).
  it('a room that is gone: forgets it, says so, exits 1', async () => {
    const { exiting, calls } = live();

    await exiting.exit({ kind: 'refused', reason: 'unknown-room' });

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

    await exiting.exit({ kind: 'refused', reason: 'unknown-room' });

    expect(calls).toEqual([
      'removeEntry:uuid-0',
      'print:Session expired (room no longer exists). Cached session cleared.',
      'exit:1',
    ]);
  });

  it('a room that is gone before there is anything to forget: says so, exits 1', async () => {
    const { exiting, calls } = setup();

    await exiting.exit({ kind: 'refused', reason: 'unknown-room' });

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

    const first = exiting.exit({ kind: 'ended', message: 'Session ended.' });
    void exiting.exit({ kind: 'left' });
    await first;

    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(session.teardown).toHaveBeenCalledOnce();
  });

  // The room is gone: taking the UI down ends `runUntilExit`'s wait, which
  // then asks for `left` while the expired exit is still under way. The
  // user must still be told, and the exit code be 1.
  it('a room that is gone is not overtaken by the quit its own UI teardown sets off', async () => {
    const { exiting, exit, calls } = live();

    const first = exiting.exit({ kind: 'refused', reason: 'unknown-room' });
    void exiting.exit({ kind: 'left' });
    await first;

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(calls).toContain(
      'print:Session expired (room no longer exists). Cached session cleared.',
    );
  });
});

describe('onRejectionFor', () => {
  it('ends the session at once for a room the relay no longer has', () => {
    const refusal = { note: vi.fn() };
    const exiting = { exit: vi.fn(async () => undefined as never) };

    onRejectionFor(refusal, exiting)('unknown-room');

    expect(exiting.exit).toHaveBeenCalledExactlyOnceWith({
      kind: 'refused',
      reason: 'unknown-room',
    });
    expect(refusal.note).not.toHaveBeenCalled();
  });

  it('hands any other refusal to the watch', () => {
    const refusal = { note: vi.fn() };
    const exiting = { exit: vi.fn(async () => undefined as never) };

    onRejectionFor(refusal, exiting)('wrong-password');

    expect(refusal.note).toHaveBeenCalledExactlyOnceWith('wrong-password');
    expect(exiting.exit).not.toHaveBeenCalled();
  });
});

describe('runUntilExit', () => {
  /** A session, a UI and an exit as the entry flows hand them over. */
  function mount() {
    let listener: ((event: SessionEvent) => void) | null = null;
    const session = {
      onSessionEvent: (l: (event: SessionEvent) => void) => {
        listener = l;
        return () => {};
      },
    };
    let closed: () => void = () => {};
    const exited = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const ui = { unmount: vi.fn(() => closed()), waitUntilExit: () => exited };
    const exiting = { attach: vi.fn(), exit: vi.fn(async () => undefined as never) };
    const refusal = watchForRefusal();
    const running = runUntilExit(session, ui, refusal, exiting);
    return { running, ui, exiting, refusal, push: (event: SessionEvent) => listener?.(event) };
  }

  it('hands the exit the UI to take down', () => {
    const { exiting, ui } = mount();

    expect(exiting.attach).toHaveBeenCalledExactlyOnceWith(ui);
  });

  it('leaves as ended or removed on those session events, with their message', () => {
    const { exiting, push } = mount();

    push({
      kind: 'removed',
      leftAt: 10,
      removedBy: 'p-host',
      removedByName: 'Hana',
      message: 'Removed by host',
    });

    expect(exiting.exit).toHaveBeenCalledExactlyOnceWith({
      kind: 'removed',
      message: 'Removed by host',
    });
  });

  it('does not leave on a host change', () => {
    const { exiting, push } = mount();

    push({
      kind: 'host-changed',
      previousHostId: 'p-host',
      previousHostName: 'Hana',
      hostId: 'p-me',
      hostName: 'Cleo',
      cause: null,
      wasSelf: false,
      isSelf: true,
      message: 'You are now the host',
    });

    expect(exiting.exit).not.toHaveBeenCalled();
  });

  it('leaves as left once the UI comes down on its own (quit, Ctrl-C)', async () => {
    const { running, ui, exiting } = mount();

    ui.unmount();
    await running;

    expect(exiting.exit).toHaveBeenCalledExactlyOnceWith({ kind: 'left' });
  });

  it('leaves as refused, with the reason, when a refusal took the UI down', async () => {
    const { running, ui, exiting, refusal } = mount();

    refusal.note('room-full');
    await running;

    expect(ui.unmount).toHaveBeenCalled();
    expect(exiting.exit).toHaveBeenCalledExactlyOnceWith({ kind: 'refused', reason: 'room-full' });
  });
});
