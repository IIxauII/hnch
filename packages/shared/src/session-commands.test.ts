/**
 * Session-commands tests — what *binding* adds, not what each rule does
 * (#516).
 *
 * `bindSessionCommands` contributes exactly three things over calling the
 * four command modules directly: it reaches every member through one bound
 * context, it fills in the caller's own participant id for the members that
 * act on it, and it reads `onlineIds` live at call time rather than once at
 * bind time. `round-commands.test.ts`, `vote-commands.test.ts`,
 * `agenda-commands.test.ts` and `roster-commands.test.ts` already pin every
 * gate, clock stamp and refusal reason each command carries — re-asserting a
 * gate here would test it twice. What is tested here, and only here:
 *
 *  - reachability: all eighteen members actually call through to their
 *    command with the bound context;
 *  - the caller's own id is what self-acting members write, and what
 *    target-acting members act *as* rather than *on*;
 *  - `handoffHost`'s online-set parameter is supplied from the context
 *    getter at call time, not captured once at bind time;
 *  - the injectable `now` reaches every member that stamps a timestamp;
 *  - `UNBOUND_SESSION_COMMANDS` refuses every member with the reason its own
 *    result type already carries, for a surface with no session yet.
 */

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { FIBONACCI_SCALE } from './doc.js';
import { appendRound, initDoc, joinDoc, projectDoc } from './doc-projection.js';
import {
  bindSessionCommands,
  UNBOUND_SESSION_COMMANDS,
  type SessionCommands,
} from './session-commands.js';

// Fixtures

const FIXED = () => 1_700_000_900_000;

/** Seeded doc: `p-host` is host, `p-bob` is a plain (voter) participant. */
function seedDoc(): Y.Doc {
  const doc = new Y.Doc();
  initDoc(doc, {
    roomUuid: 'room-uuid-1',
    createdAt: 1_700_000_000_000,
    participantId: 'p-host',
    displayName: 'Alice',
    defaultScale: FIBONACCI_SCALE,
  });
  joinDoc(doc, {
    participantId: 'p-bob',
    displayName: 'Bob',
    joinedAt: 1_700_000_001_000,
  });
  return doc;
}

/** Append an active (pending) round `r1` directly, bypassing `startRound`. */
function seedRound(doc: Y.Doc, id = 'r1'): void {
  appendRound(doc, { id, createdAt: 1, createdBy: 'p-host' });
}

/** Bind the seam for one participant. Defaults to that participant online alone. */
function commandsFor(
  doc: Y.Doc,
  participantId: string,
  opts: { onlineIds?: () => ReadonlySet<string>; now?: () => number } = {},
): SessionCommands {
  return bindSessionCommands({
    doc,
    participantId,
    onlineIds: opts.onlineIds ?? (() => new Set([participantId])),
    now: opts.now,
  });
}

function round(doc: Y.Doc, id = 'r1') {
  return projectDoc(doc).rounds.find((r) => r.id === id)!;
}

function participant(doc: Y.Doc, id: string) {
  return projectDoc(doc).participants.find((p) => p.id === id)!;
}

// Reachability — every one of the eighteen members reaches its command
// through the bound context. One focused assertion each; the rule behind
// each command is pinned in that command's own test file.

describe('reachability', () => {
  it('startRound reaches round-commands.startRound', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host').startRound({ title: 'Story A' });
    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error('unreachable');
    expect(projectDoc(doc).rounds.find((r) => r.id === result.id)?.title).toBe('Story A');
  });

  it('revealCurrentRound reaches round-commands.revealCurrentRound', () => {
    const doc = seedDoc();
    seedRound(doc);
    const result = commandsFor(doc, 'p-host').revealCurrentRound();
    expect(result.applied).toBe(true);
    expect(round(doc).status).toBe('revealed');
  });

  it('skipCurrentRound reaches round-commands.skipCurrentRound', () => {
    const doc = seedDoc();
    seedRound(doc);
    const result = commandsFor(doc, 'p-host').skipCurrentRound();
    expect(result.applied).toBe(true);
    expect(round(doc).status).toBe('skipped');
  });

  it('discardCurrentRound reaches round-commands.discardCurrentRound', () => {
    const doc = seedDoc();
    seedRound(doc);
    const result = commandsFor(doc, 'p-host').discardCurrentRound();
    expect(result.applied).toBe(true);
    expect(round(doc).status).toBe('discarded');
  });

  it('toggleCurrentVote reaches vote-commands.toggleCurrentVote', () => {
    const doc = seedDoc();
    seedRound(doc);
    const result = commandsFor(doc, 'p-host').toggleCurrentVote('5');
    expect(result).toEqual({ applied: true, effect: 'cast' });
    expect(round(doc).votes['p-host']).toBe('5');
  });

  it('clearCurrentVote reaches vote-commands.clearCurrentVote', () => {
    const doc = seedDoc();
    seedRound(doc);
    const cmds = commandsFor(doc, 'p-host');
    cmds.toggleCurrentVote('5');
    const result = cmds.clearCurrentVote();
    expect(result).toEqual({ applied: true, effect: 'cleared' });
    expect(round(doc).votes['p-host']).toBeUndefined();
  });

  it('addItem reaches agenda-commands.addItem', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host').addItem({ title: 'Login form' });
    expect(result.applied).toBe(true);
    expect(projectDoc(doc).agenda).toHaveLength(1);
  });

  it('editItem reaches agenda-commands.editItem', () => {
    const doc = seedDoc();
    const cmds = commandsFor(doc, 'p-host');
    const added = cmds.addItem({ title: 'Login form' });
    if (!added.applied) throw new Error('unreachable');
    const result = cmds.editItem(added.id, { title: 'Signup form' });
    expect(result.applied).toBe(true);
    expect(projectDoc(doc).agenda[0]!.title).toBe('Signup form');
  });

  it('skipItem reaches agenda-commands.skipItem', () => {
    const doc = seedDoc();
    const cmds = commandsFor(doc, 'p-host');
    const added = cmds.addItem({ title: 'Login form' });
    if (!added.applied) throw new Error('unreachable');
    const result = cmds.skipItem(added.id);
    expect(result.applied).toBe(true);
    expect(projectDoc(doc).agenda[0]!.state).toBe('skipped');
  });

  it('cancelItem reaches agenda-commands.cancelItem', () => {
    const doc = seedDoc();
    const cmds = commandsFor(doc, 'p-host');
    const added = cmds.addItem({ title: 'Login form' });
    if (!added.applied) throw new Error('unreachable');
    const result = cmds.cancelItem(added.id);
    expect(result.applied).toBe(true);
    expect(projectDoc(doc).agenda[0]!.state).toBe('cancelled');
  });

  it('moveItem reaches agenda-commands.moveItem', () => {
    const doc = seedDoc();
    const cmds = commandsFor(doc, 'p-host');
    const first = cmds.addItem({ title: 'First' });
    const second = cmds.addItem({ title: 'Second' });
    if (!first.applied || !second.applied) throw new Error('unreachable');
    // `before` / `after` are the neighbours' **sortKeys**, not their ids —
    // passing ids happens to produce a usable key, which is exactly why it is
    // worth spelling the real shape here.
    const firstSortKey = projectDoc(doc).agenda.find((i) => i.id === first.id)!.sortKey;
    const result = cmds.moveItem(second.id, null, firstSortKey);
    expect(result.applied).toBe(true);
    expect(projectDoc(doc).agenda[0]!.id).toBe(second.id);
  });

  it('rename reaches roster-commands.rename', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host').rename('Alicia');
    expect(result).toEqual({ applied: true });
    expect(participant(doc, 'p-host').displayName).toBe('Alicia');
  });

  it('recolor reaches roster-commands.recolor', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host').recolor('green');
    expect(result).toEqual({ applied: true });
    expect(participant(doc, 'p-host').avatarColor).toBe('green');
  });

  it('toggleRole reaches roster-commands.toggleRole', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host').toggleRole();
    expect(result).toEqual({ applied: true });
    expect(participant(doc, 'p-host').role).toBe('viewer');
  });

  it('leave reaches roster-commands.leave', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host').leave();
    expect(result.applied).toBe(true);
    expect(participant(doc, 'p-host').leftAt).toBeDefined();
  });

  it('kick reaches roster-commands.kick', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host').kick('p-bob');
    expect(result.applied).toBe(true);
    expect(participant(doc, 'p-bob').leftAt).toBeDefined();
  });

  it('handoffHost reaches roster-commands.handoffHost', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host', { onlineIds: () => new Set(['p-bob']) }).handoffHost(
      'p-bob',
    );
    expect(result).toEqual({ applied: true });
    expect(projectDoc(doc).settings.hostParticipantId).toBe('p-bob');
  });

  it('endSession reaches roster-commands.endSession', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host').endSession();
    expect(result.applied).toBe(true);
    expect(projectDoc(doc).meta.sessionEndedAt).toBeDefined();
  });
});

// Self-acting members write as the bound participant id — the id never
// travels through the call site.

describe('self-acting members bind the caller as the actor', () => {
  it('toggleCurrentVote records the vote under the bound id, not the other participant', () => {
    const doc = seedDoc();
    seedRound(doc);
    commandsFor(doc, 'p-bob').toggleCurrentVote('5');

    expect(round(doc).votes).toEqual({ 'p-bob': '5' });
  });

  it('rename renames the bound participant, leaving the other one untouched', () => {
    const doc = seedDoc();
    commandsFor(doc, 'p-bob').rename('Robert');

    expect(participant(doc, 'p-bob').displayName).toBe('Robert');
    expect(participant(doc, 'p-host').displayName).toBe('Alice');
  });

  it('discardCurrentRound stamps discardedBy with the bound id', () => {
    const doc = seedDoc();
    seedRound(doc);
    commandsFor(doc, 'p-bob').discardCurrentRound();

    expect(round(doc).discardedBy).toBe('p-bob');
  });

  it("leave stamps the bound participant's own leftAt, leaving the other one active", () => {
    const doc = seedDoc();
    commandsFor(doc, 'p-bob').leave();

    expect(participant(doc, 'p-bob').leftAt).toBeDefined();
    expect(participant(doc, 'p-host').leftAt).toBeUndefined();
  });
});

// Target-acting members: kick / handoffHost act on the target parameter and
// use the bound id as the actor.

describe('target-acting members use the bound id as the actor', () => {
  it('kick(targetId) removes the target and attributes removedBy to the bound host', () => {
    const doc = seedDoc();
    commandsFor(doc, 'p-host').kick('p-bob');

    expect(participant(doc, 'p-bob').removedBy).toBe('p-host');
  });

  it('kick refuses not-host when the bound id does not hold authority', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-bob').kick('p-host');

    expect(result).toEqual({ applied: false, reason: 'not-host' });
  });

  it('handoffHost(targetId) installs the target and is authorised by the bound host', () => {
    const doc = seedDoc();
    commandsFor(doc, 'p-host', { onlineIds: () => new Set(['p-bob']) }).handoffHost('p-bob');

    expect(projectDoc(doc).settings.hostParticipantId).toBe('p-bob');
  });

  it('handoffHost refuses not-host when the bound id does not hold authority', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-bob', { onlineIds: () => new Set(['p-host']) }).handoffHost(
      'p-host',
    );

    expect(result).toEqual({ applied: false, reason: 'not-host' });
  });
});

// handoffHost reads the online set through the context getter at call time,
// not once at bind time.

describe('handoffHost reads onlineIds live', () => {
  it('a target absent from the set at bind time refuses, then succeeds once the set is mutated — no rebinding', () => {
    const doc = seedDoc();
    const online = new Set(['p-host']);
    const cmds = commandsFor(doc, 'p-host', { onlineIds: () => online });

    expect(cmds.handoffHost('p-bob')).toEqual({ applied: false, reason: 'not-online' });

    online.add('p-bob');

    expect(cmds.handoffHost('p-bob')).toEqual({ applied: true });
    expect(projectDoc(doc).settings.hostParticipantId).toBe('p-bob');
  });
});

// The injectable `now` reaches every member that stamps a timestamp:
// `startRound`, the three terminal acts, `addItem`, `leave`, `kick`,
// `endSession`.

describe('the injectable now reaches every timestamp-stamping member', () => {
  it('startRound', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host', { now: FIXED }).startRound();
    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error('unreachable');
    expect(result.at).toBe(1_700_000_900_000);
    expect(round(doc, result.id).createdAt).toBe(1_700_000_900_000);
  });

  it('revealCurrentRound', () => {
    const doc = seedDoc();
    seedRound(doc);
    const result = commandsFor(doc, 'p-host', { now: FIXED }).revealCurrentRound();
    expect(result).toEqual({ applied: true, at: 1_700_000_900_000 });
    expect(round(doc).terminalAt).toBe(1_700_000_900_000);
  });

  it('skipCurrentRound', () => {
    const doc = seedDoc();
    seedRound(doc);
    const result = commandsFor(doc, 'p-host', { now: FIXED }).skipCurrentRound();
    expect(result).toEqual({ applied: true, at: 1_700_000_900_000 });
    expect(round(doc).terminalAt).toBe(1_700_000_900_000);
  });

  it('discardCurrentRound', () => {
    const doc = seedDoc();
    seedRound(doc);
    const result = commandsFor(doc, 'p-host', { now: FIXED }).discardCurrentRound();
    expect(result).toEqual({ applied: true, at: 1_700_000_900_000 });
  });

  it('addItem', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host', { now: FIXED }).addItem({ title: 'Login form' });
    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error('unreachable');
    expect(result.at).toBe(1_700_000_900_000);
    expect(projectDoc(doc).agenda[0]!.createdAt).toBe(1_700_000_900_000);
  });

  it('leave', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host', { now: FIXED }).leave();
    expect(result).toEqual({ applied: true, at: 1_700_000_900_000 });
  });

  it('kick', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host', { now: FIXED }).kick('p-bob');
    expect(result).toEqual({ applied: true, at: 1_700_000_900_000 });
  });

  it('endSession', () => {
    const doc = seedDoc();
    const result = commandsFor(doc, 'p-host', { now: FIXED }).endSession();
    expect(result).toEqual({ applied: true, at: 1_700_000_900_000 });
    expect(projectDoc(doc).meta.sessionEndedAt).toBe(1_700_000_900_000);
  });
});

// UNBOUND_SESSION_COMMANDS — every member refuses with the reason its own
// result type already carries, for a surface with no session yet. Table
// makes the expected reason per member explicit; the loop avoids eighteen
// near-identical `it`s.

const UNBOUND_CALLS: { [K in keyof SessionCommands]: () => ReturnType<SessionCommands[K]> } = {
  startRound: () => UNBOUND_SESSION_COMMANDS.startRound(),
  revealCurrentRound: () => UNBOUND_SESSION_COMMANDS.revealCurrentRound(),
  skipCurrentRound: () => UNBOUND_SESSION_COMMANDS.skipCurrentRound(),
  discardCurrentRound: () => UNBOUND_SESSION_COMMANDS.discardCurrentRound(),
  toggleCurrentVote: () => UNBOUND_SESSION_COMMANDS.toggleCurrentVote('5'),
  clearCurrentVote: () => UNBOUND_SESSION_COMMANDS.clearCurrentVote(),
  addItem: () => UNBOUND_SESSION_COMMANDS.addItem({ title: 'X' }),
  editItem: () => UNBOUND_SESSION_COMMANDS.editItem('item-1', { title: 'X' }),
  skipItem: () => UNBOUND_SESSION_COMMANDS.skipItem('item-1'),
  cancelItem: () => UNBOUND_SESSION_COMMANDS.cancelItem('item-1'),
  moveItem: () => UNBOUND_SESSION_COMMANDS.moveItem('item-1'),
  rename: () => UNBOUND_SESSION_COMMANDS.rename('X'),
  recolor: () => UNBOUND_SESSION_COMMANDS.recolor('green'),
  toggleRole: () => UNBOUND_SESSION_COMMANDS.toggleRole(),
  leave: () => UNBOUND_SESSION_COMMANDS.leave(),
  kick: () => UNBOUND_SESSION_COMMANDS.kick('target-1'),
  handoffHost: () => UNBOUND_SESSION_COMMANDS.handoffHost('target-1'),
  endSession: () => UNBOUND_SESSION_COMMANDS.endSession(),
};

// The literal union rather than `string`: a typo'd reason must fail the
// typecheck, not slip through and quietly assert the wrong refusal.
const EXPECTED_UNBOUND_REASONS: Record<
  keyof SessionCommands,
  'no-session' | 'no-current-round' | 'no-active-round' | 'not-found'
> = {
  startRound: 'no-session',
  revealCurrentRound: 'no-current-round',
  skipCurrentRound: 'no-current-round',
  discardCurrentRound: 'no-current-round',
  toggleCurrentVote: 'no-active-round',
  clearCurrentVote: 'no-active-round',
  addItem: 'not-found',
  editItem: 'not-found',
  skipItem: 'not-found',
  cancelItem: 'not-found',
  moveItem: 'not-found',
  rename: 'not-found',
  recolor: 'not-found',
  toggleRole: 'not-found',
  leave: 'not-found',
  kick: 'not-found',
  handoffHost: 'not-found',
  endSession: 'not-found',
};

describe('UNBOUND_SESSION_COMMANDS', () => {
  it.each(
    Object.entries(EXPECTED_UNBOUND_REASONS) as [keyof SessionCommands, string][],
  )('%s refuses with %s', (member, reason) => {
    expect(UNBOUND_CALLS[member]()).toEqual({ applied: false, reason });
  });
});
