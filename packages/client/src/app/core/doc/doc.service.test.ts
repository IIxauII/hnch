/**
 * Unit tests for DocService behavior.
 *
 * Vitest-on-Node, no Angular TestBed. Angular signals work as plain
 * reactive primitives in Node — no zone or DI context needed.
 *
 * Because DocService uses inject() for AppPreferenceService and
 * createSyncProvider for sync, we test via a standalone harness that
 * mirrors the service's logic against a real Y.Doc. This verifies the
 * projection signals, session lifecycle, `commands` binding, and
 * awareness plumbing — the parts that matter for correctness.
 *
 * What is NOT tested here (covered elsewhere):
 *  - Sync-provider WS state machine → sync-provider.test.ts
 *  - Host election behaviour → @hnch/shared election.test.ts
 *  - Host election wiring → doc.service.election.test.ts
 *  - The rules behind every writer act reachable through `commands` → each
 *    command's own test file (round/vote/agenda/roster-commands.test.ts) and
 *    the binding itself → session-commands.test.ts (#516). Re-asserting a
 *    gate or a refusal reason here would test it twice; what belongs here is
 *    only what binding adds on the client side — see the "commands binding"
 *    describe block below.
 *  - SessionEndService observer → tested via the harness's sessionEndedAt signal
 */

import { computed, signal, type Signal, type WritableSignal } from '@angular/core';
import {
  bindSessionCommands,
  initDoc,
  isActiveParticipant,
  joinDoc,
  patchRoundDescriptor,
  patchSettings,
  projectDoc,
  promoteHost as promoteHostCommand,
  UNBOUND_SESSION_COMMANDS,
  type DocProjection,
  type PublicSettingsPatch,
  type RosterResult,
  type Round,
  type Scale,
  type SessionCommands,
} from '@hnch/shared';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Fixtures

const FIBONACCI: Scale = {
  id: 'fibonacci',
  cards: ['1', '2', '3', '5', '8', '13'],
};

const NOW = 1_700_000_000_000;

function makeInit(
  overrides: Partial<{
    participantId: string;
    displayName: string;
    roomUuid: string;
    roomCode: string;
    now: number;
  }> = {},
) {
  return {
    participantId: overrides.participantId ?? 'p-host',
    displayName: overrides.displayName ?? 'Host',
    defaultScale: FIBONACCI,
    roomUuid: overrides.roomUuid ?? 'room-uuid-1',
    roomCode: overrides.roomCode ?? 'ABC123',
    now: () => overrides.now ?? NOW,
  };
}

// DocServiceHarness
//
// Replicates DocService's signal-projection wiring against a real Y.Doc.
// Does NOT replicate connect/sync (those belong in sync-provider.test.ts).

class DocServiceHarness {
  private doc: Y.Doc | null = null;
  private boundCommands: SessionCommands | null = null;
  private observers: Array<() => void> = [];
  private awareness: Awareness | null = null;

  readonly projection: WritableSignal<DocProjection | null> = signal(null);
  readonly roomCodeSignal: WritableSignal<string | null> = signal(null);
  readonly endingSessionLocally: WritableSignal<boolean> = signal(false);
  readonly onlineParticipantIdsSignal: WritableSignal<ReadonlySet<string>> = signal(new Set());
  readonly hasFirstSyncCompletedSignal: WritableSignal<boolean> = signal(false);

  readonly hasSession: Signal<boolean> = computed(() => this.projection() !== null);
  readonly hasFirstSyncCompleted: Signal<boolean> = this.hasFirstSyncCompletedSignal.asReadonly();
  readonly meta = computed(() => this.projection()?.meta ?? null);
  readonly settings = computed(() => this.projection()?.settings ?? null);
  readonly participants = computed(() => this.projection()?.participants ?? []);
  readonly rounds = computed(() => this.projection()?.rounds ?? []);
  readonly activeParticipants = computed(() => this.participants().filter(isActiveParticipant));
  readonly onlineParticipants = computed(() => {
    const online = this.onlineParticipantIdsSignal();
    return this.activeParticipants().filter((p) => online.has(p.id));
  });
  readonly offlineParticipants = computed(() => {
    const online = this.onlineParticipantIdsSignal();
    return this.activeParticipants().filter((p) => !online.has(p.id));
  });

  /**
   * The bound writer seam, or `UNBOUND_SESSION_COMMANDS` before a session and
   * after {@link teardown} — mirrors `DocService.commands` exactly (#516).
   */
  get commands(): SessionCommands {
    return this.boundCommands ?? UNBOUND_SESSION_COMMANDS;
  }

  createSession(init: ReturnType<typeof makeInit>): void {
    if (this.doc !== null) throw new Error('session already active');
    const doc = new Y.Doc();
    initDoc(doc, {
      roomUuid: init.roomUuid!,
      createdAt: init.now(),
      participantId: init.participantId,
      displayName: init.displayName,
      defaultScale: init.defaultScale,
    });
    // Awareness before attach, as production orders it: `attach` starts the
    // election driver, whose first evaluation reads the online set.
    this.initAwareness(doc, init.participantId);
    this.attach(doc, init.participantId);
    this.roomCodeSignal.set(init.roomCode ?? null);
  }

  joinSession(params: { participantId: string; displayName: string; roomCode?: string }): void {
    if (this.doc !== null) throw new Error('session already active');
    const doc = new Y.Doc();
    joinDoc(doc, {
      participantId: params.participantId,
      displayName: params.displayName,
      joinedAt: NOW,
    });
    // Awareness before attach, as production orders it: `attach` starts the
    // election driver, whose first evaluation reads the online set.
    this.initAwareness(doc, params.participantId);
    this.attach(doc, params.participantId);
    this.roomCodeSignal.set(params.roomCode ?? null);
  }

  teardown(): void {
    this.teardownAwareness();
    this.detach();
    this.doc?.destroy();
    this.doc = null;
    this.projection.set(null);
    this.roomCodeSignal.set(null);
    this.endingSessionLocally.set(false);
    this.hasFirstSyncCompletedSignal.set(false);
    this.onlineParticipantIdsSignal.set(new Set());
  }

  /**
   * Sets client state after the shared command applies — this is the one
   * act that is genuinely not a forward, so it stays named rather than
   * folding into `commands` (#516).
   */
  endSessionForEveryone(): RosterResult {
    const result = this.commands.endSession();
    if (result.applied) this.endingSessionLocally.set(true);
    return result;
  }

  updateSettings(patch: PublicSettingsPatch): void {
    patchSettings(this.requireDoc(), patch);
  }

  promoteHost(winnerId: string): RosterResult {
    return promoteHostCommand(this.requireDoc(), winnerId);
  }

  /**
   * Test-only roster seeding. Production never writes a *peer's* record —
   * peers arrive through their own `joinDoc` — so there is no roster command
   * for it and the raw writer is package-internal. `joinDoc` is the public
   * seam that mints a record, so the harness uses it directly.
   */
  seedParticipant(id: string, params: { displayName: string; joinedAt: number }): void {
    joinDoc(this.requireDoc(), { participantId: id, ...params });
  }

  updateRoundDescriptor(roundId: string, fields: { title?: string; description?: string }): void {
    patchRoundDescriptor(this.requireDoc(), roundId, fields);
  }

  /** Merge another doc's state into this one (simulate peer sync). */
  mergeFrom(other: Y.Doc): void {
    const encoded = Y.encodeStateAsUpdate(other);
    Y.applyUpdate(this.requireDoc(), encoded);
  }

  getDoc(): Y.Doc {
    return this.requireDoc();
  }

  private attach(doc: Y.Doc, participantId: string): void {
    this.doc = doc;
    this.boundCommands = bindSessionCommands({
      doc,
      participantId,
      onlineIds: () => this.onlineParticipantIdsSignal(),
    });
    this.rebuildProjection();
    const rebuild = () => this.rebuildProjection();

    const meta = doc.getMap('meta');
    const settings = doc.getMap('settings');
    const participants = doc.getMap('participants');
    const rounds = doc.getArray('rounds');

    meta.observeDeep(rebuild);
    settings.observeDeep(rebuild);
    participants.observeDeep(rebuild);
    rounds.observeDeep(rebuild);

    this.observers = [
      () => meta.unobserveDeep(rebuild),
      () => settings.unobserveDeep(rebuild),
      () => participants.unobserveDeep(rebuild),
      () => rounds.unobserveDeep(rebuild),
    ];
  }

  private detach(): void {
    for (const off of this.observers) off();
    this.observers = [];
    this.boundCommands = null;
  }

  private rebuildProjection(): void {
    if (!this.doc) return;
    this.projection.set(projectDoc(this.doc));
  }

  private initAwareness(doc: Y.Doc, participantId: string): void {
    const awareness = new Awareness(doc);
    awareness.setLocalStateField('participantId', participantId);
    const refresh = () => {
      const next = new Set<string>();
      for (const state of awareness.getStates().values()) {
        const v = (state as Record<string, unknown>)['participantId'];
        if (typeof v === 'string') next.add(v);
      }
      this.onlineParticipantIdsSignal.set(next);
    };
    awareness.on('change', refresh);
    refresh();
    this.awareness = awareness;
  }

  private teardownAwareness(): void {
    this.awareness?.destroy();
    this.awareness = null;
    this.onlineParticipantIdsSignal.set(new Set());
  }

  private requireDoc(): Y.Doc {
    if (!this.doc) throw new Error('no active session');
    return this.doc;
  }
}

// Helpers

function makeHarness(): DocServiceHarness {
  return new DocServiceHarness();
}

// Tests

describe('DocService — createSession', () => {
  let h: DocServiceHarness;

  beforeEach(() => {
    h = makeHarness();
  });
  afterEach(() => {
    h.teardown();
  });

  it('hasSession flips to true', () => {
    expect(h.hasSession()).toBe(false);
    h.createSession(makeInit());
    expect(h.hasSession()).toBe(true);
  });

  it('meta is populated with roomUuid and createdBy', () => {
    h.createSession(makeInit({ participantId: 'p-host', roomUuid: 'room-1' }));
    expect(h.meta()?.roomUuid).toBe('room-1');
    expect(h.meta()?.createdBy).toBe('p-host');
  });

  it('meta.createdAt matches the injected clock', () => {
    h.createSession(makeInit({ now: NOW }));
    expect(h.meta()?.createdAt).toBe(NOW);
  });

  it('settings.hostParticipantId is the creator', () => {
    h.createSession(makeInit({ participantId: 'p-host' }));
    expect(h.settings()?.hostParticipantId).toBe('p-host');
  });

  it('settings.defaultScale matches init', () => {
    h.createSession(makeInit());
    expect(h.settings()?.defaultScale.id).toBe('fibonacci');
  });

  it('creator appears in participants', () => {
    h.createSession(makeInit({ participantId: 'p-host', displayName: 'Host' }));
    expect(h.participants()).toHaveLength(1);
    expect(h.participants()[0]?.displayName).toBe('Host');
    expect(h.participants()[0]?.id).toBe('p-host');
  });

  it('roomCode signal is populated', () => {
    h.createSession(makeInit({ roomCode: 'XYZ999' }));
    expect(h.roomCodeSignal()).toBe('XYZ999');
  });

  it('creator is in onlineParticipantIds from awareness', () => {
    h.createSession(makeInit({ participantId: 'p-host' }));
    expect(h.onlineParticipantIdsSignal().has('p-host')).toBe(true);
  });

  it('throws if called when session already active', () => {
    h.createSession(makeInit());
    expect(() => h.createSession(makeInit())).toThrow();
  });
});

describe('DocService — joinSession', () => {
  let h: DocServiceHarness;

  beforeEach(() => {
    h = makeHarness();
  });
  afterEach(() => {
    h.teardown();
  });

  it('hasSession flips to true', () => {
    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });
    expect(h.hasSession()).toBe(true);
  });

  it('participant appears in participants list', () => {
    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });
    expect(h.participants()).toHaveLength(1);
    expect(h.participants()[0]?.id).toBe('p-joiner');
  });

  it('meta is null before sync (join-only doc has no meta)', () => {
    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });
    // No initDoc was called so meta fields are absent
    expect(h.meta()?.roomUuid).toBeUndefined();
  });

  it('after merging host doc, meta is visible', () => {
    const host = makeHarness();
    host.createSession(makeInit({ roomUuid: 'room-sync' }));

    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });
    h.mergeFrom(host.getDoc());

    expect(h.meta()?.roomUuid).toBe('room-sync');
    host.teardown();
  });

  it('joiner is in onlineParticipantIds', () => {
    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });
    expect(h.onlineParticipantIdsSignal().has('p-joiner')).toBe(true);
  });

  it('throws if called when session active', () => {
    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });
    expect(() => h.joinSession({ participantId: 'p-2', displayName: 'P2' })).toThrow();
  });
});

describe('DocService — teardown', () => {
  let h: DocServiceHarness;

  beforeEach(() => {
    h = makeHarness();
  });

  it('hasSession flips back to false', () => {
    h.createSession(makeInit());
    h.teardown();
    expect(h.hasSession()).toBe(false);
  });

  it('projection is null after teardown', () => {
    h.createSession(makeInit());
    h.teardown();
    expect(h.projection()).toBeNull();
  });

  it('roomCode is cleared', () => {
    h.createSession(makeInit({ roomCode: 'ABC123' }));
    h.teardown();
    expect(h.roomCodeSignal()).toBeNull();
  });

  it('onlineParticipantIds is empty after teardown', () => {
    h.createSession(makeInit({ participantId: 'p-host' }));
    h.teardown();
    expect(h.onlineParticipantIdsSignal().size).toBe(0);
  });

  it('endingSessionLocally resets to false', () => {
    h.createSession(makeInit());
    h.endSessionForEveryone();
    expect(h.endingSessionLocally()).toBe(true);
    h.teardown();
    expect(h.endingSessionLocally()).toBe(false);
  });

  it('is idempotent — calling twice does not throw', () => {
    h.createSession(makeInit());
    h.teardown();
    expect(() => h.teardown()).not.toThrow();
  });
});

// commands binding (#516) — what binding adds on the client side. The rules
// behind every member are pinned in shared's command-module tests and in
// session-commands.test.ts; this is only the adapter's own contract.

describe('DocService — commands binding', () => {
  let h: DocServiceHarness;

  afterEach(() => {
    if (h.hasSession()) h.teardown();
  });

  it('is the unbound adapter before a session exists', () => {
    h = makeHarness();
    expect(h.commands.rename('X')).toEqual({ applied: false, reason: 'not-found' });
  });

  it('is bound once a session is attached — the same call now applies', () => {
    h = makeHarness();
    h.createSession(makeInit({ participantId: 'p-host' }));
    expect(h.commands.rename('New Name')).toEqual({ applied: true });
    expect(h.participants()[0]?.displayName).toBe('New Name');
  });

  it('reverts to the unbound adapter after teardown', () => {
    h = makeHarness();
    h.createSession(makeInit({ participantId: 'p-host' }));
    h.teardown();
    expect(h.commands.rename('X')).toEqual({ applied: false, reason: 'not-found' });
  });

  it('a second session rebinds rather than reusing a stale set', () => {
    h = makeHarness();
    h.createSession(makeInit({ participantId: 'p-host', roomUuid: 'room-a' }));
    const first = h.commands;
    h.teardown();

    h.createSession(makeInit({ participantId: 'p-host-2', roomUuid: 'room-b' }));
    const second = h.commands;

    // A fresh binding, not the same closures kept alive across teardown...
    expect(second).not.toBe(first);
    // ...and it writes to the new doc under the new session's own id.
    expect(second.rename('Rebound')).toEqual({ applied: true });
    expect(h.participants()[0]?.id).toBe('p-host-2');
    expect(h.participants()[0]?.displayName).toBe('Rebound');
  });
});

describe('DocService — updateSettings', () => {
  let h: DocServiceHarness;

  beforeEach(() => {
    h = makeHarness();
    h.createSession(makeInit());
  });
  afterEach(() => {
    h.teardown();
  });

  it('patches name and projection reflects it', () => {
    h.updateSettings({ name: 'Sprint 42' });
    expect(h.settings()?.name).toBe('Sprint 42');
  });

  it('patches defaultScale and projection reflects it', () => {
    const tShirt: Scale = { id: 't-shirt', cards: ['XS', 'S', 'M', 'L', 'XL'] };
    h.updateSettings({ defaultScale: tShirt });
    expect(h.settings()?.defaultScale.id).toBe('t-shirt');
  });

  it('cannot express a host change — promoteHost is the seam for that', () => {
    h.promoteHost('p-joiner');
    expect(h.settings()?.hostParticipantId).toBe('p-joiner');
  });
});

describe('DocService — participant projection ordering', () => {
  let h: DocServiceHarness;

  beforeEach(() => {
    h = makeHarness();
    h.createSession(makeInit({ participantId: 'p-host', displayName: 'Host' }));
  });
  afterEach(() => {
    h.teardown();
  });

  it('participants sorted by joinedAt', () => {
    h.seedParticipant('p-late', { displayName: 'Late', joinedAt: NOW + 1000 });
    h.seedParticipant('p-early', { displayName: 'Early', joinedAt: NOW - 1 });
    const ids = h.participants().map((p) => p.id);
    expect(ids.indexOf('p-early')).toBeLessThan(ids.indexOf('p-host'));
  });
});

describe('DocService — updateRoundDescriptor', () => {
  let h: DocServiceHarness;
  let roundId: string;

  beforeEach(() => {
    h = makeHarness();
    h.createSession(makeInit({ participantId: 'p-host' }));
    const result = h.commands.startRound({});
    if (!result.applied) throw new Error('unreachable');
    roundId = result.id;
  });
  afterEach(() => {
    h.teardown();
  });

  it('patches title and description', () => {
    h.updateRoundDescriptor(roundId, { title: 'New title', description: 'Some desc' });
    const r = h.rounds().find((round) => round.id === roundId);
    expect(r?.title).toBe('New title');
    expect(r?.description).toBe('Some desc');
  });
});

describe('DocService — endSessionForEveryone', () => {
  let h: DocServiceHarness;

  beforeEach(() => {
    h = makeHarness();
    h.createSession(makeInit());
  });
  afterEach(() => {
    if (h.hasSession()) h.teardown();
  });

  it('sets endingSessionLocally to true once the command applies', () => {
    expect(h.endingSessionLocally()).toBe(false);
    h.endSessionForEveryone();
    expect(h.endingSessionLocally()).toBe(true);
  });

  it('leaves endingSessionLocally false when the host gate refuses', () => {
    // A non-host caller needs its own bound session — endSessionForEveryone
    // takes no actor parameter now that the caller's id is bound at attach.
    const joiner = makeHarness();
    joiner.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });
    joiner.mergeFrom(h.getDoc());

    expect(joiner.endSessionForEveryone()).toEqual({ applied: false, reason: 'not-host' });
    expect(joiner.endingSessionLocally()).toBe(false);
    expect(h.meta()?.sessionEndedAt).toBeUndefined();

    joiner.teardown();
  });

  it('remote endingSessionLocally stays false when remote peer receives the update', () => {
    const remote = makeHarness();
    remote.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });
    remote.mergeFrom(h.getDoc());

    // Remote harness did NOT call endSessionForEveryone() itself.
    h.endSessionForEveryone();
    remote.mergeFrom(h.getDoc());

    expect(remote.endingSessionLocally()).toBe(false);
    remote.teardown();
  });
});

describe('DocService — projection signal updates reactively', () => {
  let h: DocServiceHarness;

  beforeEach(() => {
    h = makeHarness();
    h.createSession(makeInit({ participantId: 'p-host', displayName: 'Host' }));
  });
  afterEach(() => {
    h.teardown();
  });

  it('computed participants() reflects a new peer without manual rebuild', () => {
    expect(h.participants()).toHaveLength(1);
    h.seedParticipant('p-2', { displayName: 'P2', joinedAt: NOW + 1 });
    expect(h.participants()).toHaveLength(2);
  });

  it('computed rounds() reflects startRound without manual rebuild', () => {
    expect(h.rounds()).toHaveLength(0);
    h.commands.startRound({});
    expect(h.rounds()).toHaveLength(1);
  });

  it('computed settings() reflects patchSettings without manual rebuild', () => {
    h.updateSettings({ name: 'My Session' });
    expect(h.settings()?.name).toBe('My Session');
  });

  it('rounds() signal value updates synchronously after each startRound', () => {
    expect(h.rounds().length).toBe(0);
    h.commands.startRound({});
    expect(h.rounds().length).toBe(1);
    h.commands.startRound({});
    expect(h.rounds().length).toBe(2);
  });
});

describe('DocService — multi-peer merge via Y.Doc', () => {
  let host: DocServiceHarness;
  let joiner: DocServiceHarness;

  beforeEach(() => {
    host = makeHarness();
    joiner = makeHarness();
    host.createSession(makeInit({ participantId: 'p-host', roomUuid: 'room-peer' }));
    joiner.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });
    // Sync initial state
    joiner.mergeFrom(host.getDoc());
    host.mergeFrom(joiner.getDoc());
  });

  afterEach(() => {
    host.teardown();
    joiner.teardown();
  });

  it('joiner sees host meta after merge', () => {
    expect(joiner.meta()?.roomUuid).toBe('room-peer');
  });

  it('joiner sees host participant', () => {
    const ids = joiner.participants().map((p) => p.id);
    expect(ids).toContain('p-host');
  });

  it('host sees joiner participant after merge', () => {
    const ids = host.participants().map((p) => p.id);
    expect(ids).toContain('p-joiner');
  });

  it('vote from host propagates to joiner', () => {
    const started = host.commands.startRound({});
    if (!started.applied) throw new Error('unreachable');
    joiner.mergeFrom(host.getDoc());

    host.commands.toggleCurrentVote('5');
    joiner.mergeFrom(host.getDoc());

    const round = joiner.rounds().find((r: Round) => r.id === started.id);
    expect(round?.votes['p-host']).toBe('5');
  });

  it('reveal from host propagates to joiner', () => {
    const started = host.commands.startRound({});
    if (!started.applied) throw new Error('unreachable');
    joiner.mergeFrom(host.getDoc());

    host.commands.revealCurrentRound();
    joiner.mergeFrom(host.getDoc());

    const revealedRound = joiner.rounds().find((r: Round) => r.id === started.id);
    expect(revealedRound?.status).toBe('revealed');
  });

  it('skip from host propagates to joiner', () => {
    const started = host.commands.startRound({});
    if (!started.applied) throw new Error('unreachable');
    joiner.mergeFrom(host.getDoc());

    host.commands.skipCurrentRound();
    joiner.mergeFrom(host.getDoc());

    const skippedRound = joiner.rounds().find((r: Round) => r.id === started.id);
    expect(skippedRound?.status).toBe('skipped');
  });
});

describe('DocService — activeParticipants / onlineParticipants / offlineParticipants (ADR-0036)', () => {
  let h: DocServiceHarness;

  beforeEach(() => {
    h = makeHarness();
    h.createSession(makeInit({ participantId: 'p-host', displayName: 'Host' }));
    // Add a second participant
    h.seedParticipant('p-joiner', { displayName: 'Joiner', joinedAt: NOW + 1 });
  });

  afterEach(() => {
    if (h.hasSession()) h.teardown();
  });

  it('activeParticipants() excludes a left participant', () => {
    expect(h.activeParticipants()).toHaveLength(2);
    // `commands` is bound to p-host; leaving as p-joiner needs its own bound
    // context over the same doc rather than a second harness (which would
    // re-seed the participant via its own joinSession and race the CRDT
    // merge against the one `beforeEach` already wrote).
    const asJoiner = bindSessionCommands({
      doc: h.getDoc(),
      participantId: 'p-joiner',
      onlineIds: () => new Set(),
    });
    asJoiner.leave();

    expect(h.activeParticipants()).toHaveLength(1);
    expect(h.activeParticipants()[0]?.id).toBe('p-host');
  });

  it('activeParticipants() excludes a kicked participant', () => {
    h.commands.kick('p-joiner');
    expect(h.activeParticipants()).toHaveLength(1);
    expect(h.activeParticipants()[0]?.id).toBe('p-host');
  });

  it('raw participants() still includes left/kicked entries (for name lookup)', () => {
    h.commands.kick('p-joiner');
    expect(h.participants()).toHaveLength(2);
    const gone = h.participants().find((p) => p.id === 'p-joiner');
    expect(gone?.leftAt).toBeDefined();
  });

  it('onlineParticipants() excludes left participant even if still in awareness', () => {
    // p-joiner is in online set (awareness) but we soft-delete them via kick
    // (same leftAt shape leave would produce; kick is reachable from the
    // bound host without a second harness).
    h.commands.kick('p-joiner');
    // onlineParticipants filters through activeParticipants, so p-joiner is excluded
    expect(h.onlineParticipants().every((p) => !p.leftAt)).toBe(true);
  });

  it('offlineParticipants() excludes left participant', () => {
    h.commands.kick('p-joiner');
    // offlineParticipants is the complement of onlineParticipants within activeParticipants
    const ids = [...h.onlineParticipants(), ...h.offlineParticipants()].map((p) => p.id);
    expect(ids).not.toContain('p-joiner');
  });
});

describe('DocService — hasFirstSyncCompleted signal (ADR-0036 §6 rejoin race fix)', () => {
  it('starts false before any session', () => {
    const h = makeHarness();
    expect(h.hasFirstSyncCompleted()).toBe(false);
  });

  it('starts false after createSession (no sync provider)', () => {
    const h = makeHarness();
    h.createSession(makeInit());
    expect(h.hasFirstSyncCompleted()).toBe(false);
    h.teardown();
  });

  it('starts false after joinSession (no sync provider)', () => {
    const h = makeHarness();
    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });
    expect(h.hasFirstSyncCompleted()).toBe(false);
    h.teardown();
  });

  it('resets to false on teardown', () => {
    const h = makeHarness();
    h.createSession(makeInit());
    // Simulate the signal being flipped (as the real service does in onSynced)
    h.hasFirstSyncCompletedSignal.set(true);
    expect(h.hasFirstSyncCompleted()).toBe(true);
    h.teardown();
    expect(h.hasFirstSyncCompleted()).toBe(false);
  });

  it('resets to false on teardown even after multiple sessions', () => {
    const h = makeHarness();

    h.createSession(makeInit());
    h.hasFirstSyncCompletedSignal.set(true);
    h.teardown();
    expect(h.hasFirstSyncCompleted()).toBe(false);

    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' });
    expect(h.hasFirstSyncCompleted()).toBe(false);
    h.hasFirstSyncCompletedSignal.set(true);
    expect(h.hasFirstSyncCompleted()).toBe(true);
    h.teardown();
    expect(h.hasFirstSyncCompleted()).toBe(false);
  });
});
