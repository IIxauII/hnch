/**
 * `SessionAccessService` — whether the session asks for a password, as the
 * relay last said, and the two ways of changing that.
 */

// Exercises: core/session-access.service:SessionAccessService

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The relay, as far as this service can tell. Plain functions on a hoisted
 * object rather than `vi.fn()`s: `restoreMocks` would strip the
 * implementations between tests.
 */
const relay = vi.hoisted(() => ({
  accessMode: 'open' as 'open' | 'password',
  uuid: 'uuid-1',
  unreachable: false,
  /** Set to hold the next answer back until the test lets it go. */
  hold: null as null | Promise<void>,
  /** What the relay says the mode is after a change, whatever was asked for. */
  answersWith: null as null | 'open' | 'password',
  lookups: [] as string[],
  patches: [] as { uuid: string; hash: string | null }[],
}));

vi.mock('@hnch/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hnch/shared')>();
  return {
    ...actual,
    // The real one is 100 000 rounds of PBKDF2; what it returns is not the
    // point here, only that the password went through it with the right salt.
    hashPassword: (password: string, salt: string) =>
      Promise.resolve(`hash(${actual.normalizePassword(password)},${salt})`),
    resolveRoom: async (_url: string, code: string) => {
      relay.lookups.push(code);
      const mode = relay.accessMode;
      if (relay.hold !== null) await relay.hold;
      if (relay.unreachable) throw new Error('relay unreachable');
      return { uuid: relay.uuid, accessMode: mode };
    },
    patchRoomAccess: async (_url: string, uuid: string, hash: string | null) => {
      if (relay.hold !== null) await relay.hold;
      if (relay.unreachable) throw new Error('relay unreachable');
      relay.patches.push({ uuid, hash });
      relay.accessMode = relay.answersWith ?? (hash === null ? 'open' : 'password');
      return { accessMode: relay.accessMode };
    },
  };
});

vi.mock('@ionic/angular/standalone', () => ({}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: () => Promise.resolve({ value: null }),
    set: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  },
}));

beforeEach(() => {
  relay.accessMode = 'open';
  relay.answersWith = null;
  relay.uuid = 'uuid-1';
  relay.unreachable = false;
  relay.hold = null;
  relay.lookups = [];
  relay.patches = [];
});

/** A promise and the way to settle it. */
function gate(): { promise: Promise<void>; open: () => void } {
  let open = (): void => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

async function mount() {
  const { SessionAccessService } = await import('./session-access.service');
  const { DocService } = await import('./doc/doc.service');
  const { AppPreferenceService } = await import('./app-preference.service');
  const { LastSessionService } = await import('./last-session.service');

  const roomCode = signal<string | null>('ABC123');
  const relayRoomUuid = signal<string | null>('uuid-1');
  const relaySynced = signal(false);
  const sessionEpoch = signal(1);
  const updateCredentials = vi.fn();
  const rememberPasswordHash = vi.fn().mockResolvedValue(undefined);
  const clearPasswordHash = vi.fn().mockResolvedValue(undefined);

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: DocService,
        useValue: {
          roomCode: roomCode.asReadonly(),
          relayRoomUuid: relayRoomUuid.asReadonly(),
          relaySynced: relaySynced.asReadonly(),
          sessionEpoch: sessionEpoch.asReadonly(),
          updateCredentials,
        },
      },
      {
        provide: AppPreferenceService,
        useValue: { resolvedRelayHttpUrl: () => 'http://relay.test' },
      },
      { provide: LastSessionService, useValue: { rememberPasswordHash, clearPasswordHash } },
    ],
  });
  const service = TestBed.inject(SessionAccessService);
  TestBed.flushEffects();

  return {
    service,
    roomCode,
    relayRoomUuid,
    relaySynced,
    updateCredentials,
    rememberPasswordHash,
    clearPasswordHash,
    /** The session is torn down, or another takes its place. */
    sessionChanges: () => {
      sessionEpoch.update((n) => n + 1);
      TestBed.flushEffects();
    },
  };
}

describe('SessionAccessService — what the relay says', () => {
  it('starts out open, without having asked', async () => {
    const { service } = await mount();

    expect(service.mode()).toBe('open');
    expect(relay.lookups).toEqual([]);
  });

  it('asks once the connection has synced', async () => {
    relay.accessMode = 'password';
    const { service, relaySynced } = await mount();

    relaySynced.set(true);
    TestBed.flushEffects();
    await vi.waitFor(() => expect(service.mode()).toBe('password'));

    expect(relay.lookups).toEqual(['ABC123']);
  });

  // The mode may have changed while this peer was away.
  it('asks again after every reconnect', async () => {
    const { service, relaySynced } = await mount();
    relaySynced.set(true);
    TestBed.flushEffects();
    await vi.waitFor(() => expect(relay.lookups).toHaveLength(1));

    relaySynced.set(false);
    TestBed.flushEffects();
    relay.accessMode = 'password';
    relaySynced.set(true);
    TestBed.flushEffects();

    await vi.waitFor(() => expect(service.mode()).toBe('password'));
    expect(relay.lookups).toHaveLength(2);
  });

  it('keeps what it knows when the relay cannot be reached', async () => {
    relay.accessMode = 'password';
    const { service } = await mount();
    await service.refresh();
    expect(service.mode()).toBe('password');

    relay.unreachable = true;
    await service.refresh();

    expect(service.mode()).toBe('password');
  });

  it('asks once at a time for the same code', async () => {
    const { service } = await mount();
    const held = gate();
    relay.hold = held.promise;

    const first = service.refresh();
    const second = service.refresh();
    held.open();
    await Promise.all([first, second]);

    expect(relay.lookups).toEqual(['ABC123']);
  });

  it('does nothing without a session', async () => {
    const { service, roomCode } = await mount();
    roomCode.set(null);

    await service.refresh();

    expect(relay.lookups).toEqual([]);
  });

  // Codes are handed out again once a session has expired.
  it('ignores an answer about another session that has the same code', async () => {
    relay.accessMode = 'password';
    relay.uuid = 'uuid-of-a-later-session';
    const { service } = await mount();

    await service.refresh();

    expect(service.mode()).toBe('open');
  });

  it('forgets what it knew when the session changes', async () => {
    relay.accessMode = 'password';
    const { service, sessionChanges } = await mount();
    await service.refresh();
    expect(service.mode()).toBe('password');

    sessionChanges();

    expect(service.mode()).toBe('open');
  });

  it('drops an answer that was asked for before the session changed', async () => {
    relay.accessMode = 'password';
    const { service, sessionChanges } = await mount();
    const held = gate();
    relay.hold = held.promise;
    const lookup = service.refresh();

    sessionChanges();
    held.open();
    await lookup;

    expect(service.mode()).toBe('open');
  });
});

describe('SessionAccessService — setting a password', () => {
  it('hashes with the relay-issued id, patches, re-handshakes and keeps the hash', async () => {
    const { service, updateCredentials, rememberPasswordHash } = await mount();

    const result = await service.setPassword('hunter2');

    expect(result).toBe('applied');
    expect(relay.patches).toEqual([{ uuid: 'uuid-1', hash: 'hash(hunter2,uuid-1)' }]);
    expect(updateCredentials).toHaveBeenCalledWith('hash(hunter2,uuid-1)');
    expect(rememberPasswordHash).toHaveBeenCalledWith('uuid-1', 'hash(hunter2,uuid-1)');
    expect(service.mode()).toBe('password');
  });

  it('takes no notice of the whitespace around a password', async () => {
    const { service } = await mount();

    await service.setPassword('  hunter2 ');

    expect(relay.patches[0]!.hash).toBe('hash(hunter2,uuid-1)');
  });

  it('sends nothing for a blank password: it never opens a protected session', async () => {
    relay.accessMode = 'password';
    const { service, updateCredentials } = await mount();
    await service.refresh();

    expect(await service.setPassword('')).toBe('skipped');
    expect(await service.setPassword('   ')).toBe('skipped');

    expect(relay.patches).toEqual([]);
    expect(updateCredentials).not.toHaveBeenCalled();
    expect(service.mode()).toBe('password');
  });

  it('changes nothing when the relay refuses, so no lock is shown that is not there', async () => {
    relay.unreachable = true;
    const { service, updateCredentials, rememberPasswordHash } = await mount();

    const result = await service.setPassword('hunter2');

    expect(result).toBe('failed');
    expect(service.mode()).toBe('open');
    expect(updateCredentials).not.toHaveBeenCalled();
    expect(rememberPasswordHash).not.toHaveBeenCalled();
  });

  it('shows nothing of the change before the relay has answered', async () => {
    const { service } = await mount();
    const held = gate();
    relay.hold = held.promise;
    const change = service.setPassword('hunter2');
    expect(service.mode()).toBe('open');

    held.open();
    await change;

    expect(service.mode()).toBe('password');
  });

  // A relay that says something other than what it was asked: what it says
  // is what it enforces.
  it('shows what the relay answered, not what was asked for', async () => {
    const { service } = await mount();
    relay.answersWith = 'open';

    await service.setPassword('hunter2');

    expect(service.mode()).toBe('open');
  });

  it('is busy while the change is on its way, and not after', async () => {
    const { service } = await mount();
    const held = gate();
    relay.hold = held.promise;

    const change = service.setPassword('hunter2');
    await vi.waitFor(() => expect(service.saving()).toBe(true));
    // A second change does not start while the first is in flight.
    expect(await service.removePassword()).toBe('skipped');

    held.open();
    await change;
    expect(service.saving()).toBe(false);
    expect(relay.patches).toHaveLength(1);
  });

  it('is not busy after a failure either', async () => {
    relay.unreachable = true;
    const { service } = await mount();

    await service.setPassword('hunter2');

    expect(service.saving()).toBe(false);
  });

  it('counts a change as made even when the cache cannot be written', async () => {
    const { service, rememberPasswordHash } = await mount();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rememberPasswordHash.mockRejectedValue(new Error('storage is full'));

    const result = await service.setPassword('hunter2');

    expect(result).toBe('applied');
    expect(service.mode()).toBe('password');
    expect(warn).toHaveBeenCalled();
  });

  // A lookup started before the change says "open"; the change says
  // "password". The change is the later word.
  it('is not undone by a lookup that was already on its way', async () => {
    const { service } = await mount();
    const held = gate();
    relay.hold = held.promise;
    const lookup = service.refresh();
    await vi.waitFor(() => expect(relay.lookups).toHaveLength(1));

    const change = service.setPassword('hunter2');
    held.open();
    await Promise.all([lookup, change]);

    expect(service.mode()).toBe('password');
  });

  it('does nothing without a connection', async () => {
    const { service, relayRoomUuid } = await mount();
    relayRoomUuid.set(null);

    expect(await service.setPassword('hunter2')).toBe('skipped');
    expect(relay.patches).toEqual([]);
  });

  it('leaves a session alone that came after the one it was changing', async () => {
    const { service, sessionChanges, updateCredentials } = await mount();
    const held = gate();
    relay.hold = held.promise;
    const change = service.setPassword('hunter2');

    sessionChanges();
    held.open();
    const result = await change;

    expect(result).toBe('applied');
    expect(service.mode()).toBe('open');
    expect(service.saving()).toBe(false);
    expect(updateCredentials).not.toHaveBeenCalled();
  });

  // The relay has the password, whatever became of the session on this
  // device. Without the hash the host is asked, on the way back in, for
  // the password they have just set.
  it('remembers the hash for a session that was left while it was being set', async () => {
    const { service, sessionChanges, rememberPasswordHash } = await mount();
    const held = gate();
    relay.hold = held.promise;
    const change = service.setPassword('hunter2');

    sessionChanges();
    held.open();
    await change;

    expect(rememberPasswordHash).toHaveBeenCalledExactlyOnceWith('uuid-1', 'hash(hunter2,uuid-1)');
  });

  it('does not let a change that ended late mark a newer one as done', async () => {
    const { service, sessionChanges } = await mount();
    const first = gate();
    relay.hold = first.promise;
    const early = service.setPassword('hunter2');
    // Let it get as far as the relay, where it is held
    for (let i = 0; i < 5; i++) await Promise.resolve();
    sessionChanges();

    // A change in the session that came after, still on its way
    const second = gate();
    relay.hold = second.promise;
    const late = service.setPassword('another');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(service.saving()).toBe(true);

    first.open();
    await early;
    expect(service.saving()).toBe(true);

    second.open();
    await late;
    expect(service.saving()).toBe(false);
  });
});

describe('SessionAccessService — removing the password', () => {
  it('opens the session on the relay and gives up the hash', async () => {
    relay.accessMode = 'password';
    const { service, updateCredentials, clearPasswordHash, rememberPasswordHash } = await mount();
    await service.refresh();

    const result = await service.removePassword();

    expect(result).toBe('applied');
    expect(relay.patches).toEqual([{ uuid: 'uuid-1', hash: null }]);
    expect(updateCredentials).toHaveBeenCalledWith(null);
    expect(clearPasswordHash).toHaveBeenCalledWith('uuid-1');
    expect(rememberPasswordHash).not.toHaveBeenCalled();
    expect(service.mode()).toBe('open');
  });

  it('keeps the lock on when the relay refuses', async () => {
    relay.accessMode = 'password';
    const { service, clearPasswordHash } = await mount();
    await service.refresh();
    relay.unreachable = true;

    const result = await service.removePassword();

    expect(result).toBe('failed');
    expect(service.mode()).toBe('password');
    expect(clearPasswordHash).not.toHaveBeenCalled();
  });
});
