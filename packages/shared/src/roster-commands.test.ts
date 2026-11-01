/**
 * Roster command tests — the single seam where every roster gate, clock stamp
 * and refusal reason is asserted (#507).
 *
 * Structured after `round-commands.test.ts` / `vote-commands.test.ts`: assert
 * what a caller can observe (the returned result and the resulting doc state),
 * never which writer was called or in what order. Consumer tests in the client
 * and CLI prove wiring only — the gates are pinned here, once.
 */

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { FIBONACCI_SCALE, isActiveParticipant, participantRole } from './doc.js';
import { initDoc, joinDoc, projectDoc, type ParticipantSnapshot } from './doc-projection.js';
import {
  endSession,
  handoffHost,
  kick,
  leave,
  promoteHost,
  recolor,
  rejoin,
  rename,
  toggleRole,
} from './roster-commands.js';

// Fixtures

const FIXED = () => 1_700_000_900_000;

/**
 * Seeded doc: `p-host` is host, `p-bob` is a plain participant. Both online
 * unless a test says otherwise.
 */
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

const BOTH_ONLINE = new Set(['p-host', 'p-bob']);

function participant(doc: Y.Doc, id: string): ParticipantSnapshot {
  return projectDoc(doc).participants.find((p) => p.id === id)!;
}

function hostId(doc: Y.Doc): string {
  return projectDoc(doc).settings.hostParticipantId;
}

describe('rename', () => {
  it('changes the display name and stamps no timestamp', () => {
    const doc = seedDoc();
    expect(rename(doc, 'p-bob', 'Robert')).toEqual({ applied: true });
    expect(participant(doc, 'p-bob').displayName).toBe('Robert');
  });

  it('preserves role, avatar colour and joinedAt', () => {
    const doc = seedDoc();
    recolor(doc, 'p-bob', 'green');
    toggleRole(doc, 'p-bob');

    rename(doc, 'p-bob', 'Robert');

    const bob = participant(doc, 'p-bob');
    expect(bob).toMatchObject({
      displayName: 'Robert',
      role: 'viewer',
      avatarColor: 'green',
      joinedAt: 1_700_000_001_000,
    });
  });

  it('refuses with not-found when the participant has no record', () => {
    const doc = seedDoc();
    expect(rename(doc, 'p-ghost', 'Nobody')).toEqual({ applied: false, reason: 'not-found' });
    expect(projectDoc(doc).participants).toHaveLength(2);
  });
});

describe('recolor', () => {
  it('writes the avatar colour and stamps no timestamp', () => {
    const doc = seedDoc();
    expect(recolor(doc, 'p-bob', '#ff0000')).toEqual({ applied: true });
    expect(participant(doc, 'p-bob').avatarColor).toBe('#ff0000');
  });

  it('preserves the display name and role', () => {
    const doc = seedDoc();
    toggleRole(doc, 'p-bob');
    recolor(doc, 'p-bob', 'green');

    expect(participant(doc, 'p-bob')).toMatchObject({ displayName: 'Bob', role: 'viewer' });
  });

  it('refuses with not-found when the participant has no record', () => {
    const doc = seedDoc();
    expect(recolor(doc, 'p-ghost', 'green')).toEqual({ applied: false, reason: 'not-found' });
  });
});

describe('toggleRole', () => {
  it('flips an implicit voter to viewer', () => {
    const doc = seedDoc();
    expect(participant(doc, 'p-bob').role).toBeUndefined();

    expect(toggleRole(doc, 'p-bob')).toEqual({ applied: true });
    expect(participantRole(participant(doc, 'p-bob'))).toBe('viewer');
  });

  it('flips a viewer back to voter', () => {
    const doc = seedDoc();
    toggleRole(doc, 'p-bob');
    toggleRole(doc, 'p-bob');

    expect(participantRole(participant(doc, 'p-bob'))).toBe('voter');
  });

  it('preserves display name and avatar colour across the flip', () => {
    const doc = seedDoc();
    recolor(doc, 'p-bob', 'green');
    toggleRole(doc, 'p-bob');

    expect(participant(doc, 'p-bob')).toMatchObject({
      displayName: 'Bob',
      avatarColor: 'green',
    });
  });

  it('refuses with not-found when the participant has no record', () => {
    const doc = seedDoc();
    expect(toggleRole(doc, 'p-ghost')).toEqual({ applied: false, reason: 'not-found' });
  });
});

describe('leave', () => {
  it('soft-deletes the caller and stamps leftAt from the injected clock', () => {
    const doc = seedDoc();
    expect(leave(doc, 'p-bob', FIXED)).toEqual({ applied: true, at: 1_700_000_900_000 });

    const bob = participant(doc, 'p-bob');
    expect(bob.leftAt).toBe(1_700_000_900_000);
    expect(bob.removedBy).toBe('p-bob');
    expect(isActiveParticipant(bob)).toBe(false);
  });

  it('lets the host leave — departure needs no authority', () => {
    const doc = seedDoc();
    expect(leave(doc, 'p-host', FIXED)).toEqual({ applied: true, at: 1_700_000_900_000 });
    expect(isActiveParticipant(participant(doc, 'p-host'))).toBe(false);
  });

  it('refuses with not-found when the participant has no record', () => {
    const doc = seedDoc();
    expect(leave(doc, 'p-ghost', FIXED)).toEqual({ applied: false, reason: 'not-found' });
  });

  it('defaults to Date.now when no clock is supplied', () => {
    const doc = seedDoc();
    const before = Date.now();
    const result = leave(doc, 'p-bob');
    const after = Date.now();

    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error('unreachable');
    expect(result.at).toBeGreaterThanOrEqual(before);
    expect(result.at).toBeLessThanOrEqual(after);
  });
});

describe('rejoin', () => {
  it('clears leftAt and removedBy so the roster counts the caller again', () => {
    const doc = seedDoc();
    leave(doc, 'p-bob', FIXED);

    expect(rejoin(doc, 'p-bob')).toEqual({ applied: true });

    const bob = participant(doc, 'p-bob');
    expect(bob.leftAt).toBeUndefined();
    expect(bob.removedBy).toBeUndefined();
    expect(isActiveParticipant(bob)).toBe(true);
  });

  it('undoes a host kick too — the record does not remember who wrote it', () => {
    const doc = seedDoc();
    kick(doc, 'p-host', 'p-bob', FIXED);

    expect(rejoin(doc, 'p-bob')).toEqual({ applied: true });
    expect(isActiveParticipant(participant(doc, 'p-bob'))).toBe(true);
  });

  it('applies as a no-op when the caller is already active', () => {
    const doc = seedDoc();

    expect(rejoin(doc, 'p-bob')).toEqual({ applied: true });
    expect(participant(doc, 'p-bob').displayName).toBe('Bob');
  });

  it('refuses with not-found when the participant has no record', () => {
    const doc = seedDoc();
    expect(rejoin(doc, 'p-ghost')).toEqual({ applied: false, reason: 'not-found' });
  });

  it('leaves other participants alone', () => {
    const doc = seedDoc();
    leave(doc, 'p-bob', FIXED);
    leave(doc, 'p-host', FIXED);

    rejoin(doc, 'p-bob');

    expect(isActiveParticipant(participant(doc, 'p-host'))).toBe(false);
  });
});

describe('kick', () => {
  it('lets the host remove another participant, stamping the injected clock', () => {
    const doc = seedDoc();
    expect(kick(doc, 'p-host', 'p-bob', FIXED)).toEqual({
      applied: true,
      at: 1_700_000_900_000,
    });

    const bob = participant(doc, 'p-bob');
    expect(bob.leftAt).toBe(1_700_000_900_000);
    expect(bob.removedBy).toBe('p-host');
  });

  it('refuses a non-host with not-host and leaves the target untouched', () => {
    const doc = seedDoc();
    expect(kick(doc, 'p-bob', 'p-host', FIXED)).toEqual({ applied: false, reason: 'not-host' });
    expect(isActiveParticipant(participant(doc, 'p-host'))).toBe(true);
  });

  it('refuses a self-targeted removal with self-target — the leave path is the route', () => {
    const doc = seedDoc();
    expect(kick(doc, 'p-host', 'p-host', FIXED)).toEqual({
      applied: false,
      reason: 'self-target',
    });
    expect(isActiveParticipant(participant(doc, 'p-host'))).toBe(true);
  });

  it('refuses with not-found when the target has no record', () => {
    const doc = seedDoc();
    expect(kick(doc, 'p-host', 'p-ghost', FIXED)).toEqual({ applied: false, reason: 'not-found' });
  });

  it('removes an offline participant — there is no online rule on kick', () => {
    const doc = seedDoc();
    // No awareness data reaches this command at all; Bob's online-ness is
    // irrelevant, which is the point of the affordance.
    expect(kick(doc, 'p-host', 'p-bob', FIXED).applied).toBe(true);
  });
});

describe('handoffHost', () => {
  it('installs the target as host and stamps no timestamp', () => {
    const doc = seedDoc();
    expect(handoffHost(doc, 'p-host', 'p-bob', BOTH_ONLINE)).toEqual({ applied: true });
    expect(hostId(doc)).toBe('p-bob');
  });

  it('refuses a non-host with not-host', () => {
    const doc = seedDoc();
    expect(handoffHost(doc, 'p-bob', 'p-bob', BOTH_ONLINE)).toEqual({
      applied: false,
      reason: 'not-host',
    });
    expect(hostId(doc)).toBe('p-host');
  });

  it('refuses with not-found when the target has no participant record', () => {
    const doc = seedDoc();
    expect(handoffHost(doc, 'p-host', 'p-ghost', new Set(['p-host', 'p-ghost']))).toEqual({
      applied: false,
      reason: 'not-found',
    });
    expect(hostId(doc)).toBe('p-host');
  });

  it('refuses with not-online when the target is absent from the online set', () => {
    const doc = seedDoc();
    expect(handoffHost(doc, 'p-host', 'p-bob', new Set(['p-host']))).toEqual({
      applied: false,
      reason: 'not-online',
    });
    expect(hostId(doc)).toBe('p-host');
  });

  it('checks authority before online-ness — a non-host gets not-host either way', () => {
    const doc = seedDoc();
    expect(handoffHost(doc, 'p-bob', 'p-host', new Set())).toEqual({
      applied: false,
      reason: 'not-host',
    });
  });
});

describe('promoteHost', () => {
  it('installs the winner as host with no authority check', () => {
    const doc = seedDoc();
    expect(promoteHost(doc, 'p-bob')).toEqual({ applied: true });
    expect(hostId(doc)).toBe('p-bob');
  });

  it('succeeds when the current host has left — the condition it exists for', () => {
    const doc = seedDoc();
    leave(doc, 'p-host', FIXED);

    expect(promoteHost(doc, 'p-bob')).toEqual({ applied: true });
    expect(hostId(doc)).toBe('p-bob');
  });

  it('succeeds when settings names a host nobody can act as', () => {
    const doc = seedDoc();
    promoteHost(doc, 'p-vanished');
    expect(hostId(doc)).toBe('p-vanished');

    // The election repairs the room even though no reachable host authorised it.
    expect(promoteHost(doc, 'p-bob')).toEqual({ applied: true });
    expect(hostId(doc)).toBe('p-bob');
  });

  it('is the gateless twin of handoffHost — the same write handoff would refuse', () => {
    const doc = seedDoc();
    expect(handoffHost(doc, 'p-bob', 'p-bob', new Set(['p-bob']))).toEqual({
      applied: false,
      reason: 'not-host',
    });
    expect(promoteHost(doc, 'p-bob')).toEqual({ applied: true });
  });
});

describe('endSession', () => {
  it('stamps sessionEndedAt from the injected clock for the host', () => {
    const doc = seedDoc();
    expect(endSession(doc, 'p-host', FIXED)).toEqual({ applied: true, at: 1_700_000_900_000 });
    expect(projectDoc(doc).meta.sessionEndedAt).toBe(1_700_000_900_000);
  });

  it('refuses a non-host with not-host and writes nothing', () => {
    const doc = seedDoc();
    expect(endSession(doc, 'p-bob', FIXED)).toEqual({ applied: false, reason: 'not-host' });
    expect(projectDoc(doc).meta.sessionEndedAt).toBeUndefined();
  });

  it('is idempotent for the host — a second call re-stamps', () => {
    const doc = seedDoc();
    endSession(doc, 'p-host', () => 1_700_000_900_000);
    endSession(doc, 'p-host', () => 1_700_000_950_000);

    expect(projectDoc(doc).meta.sessionEndedAt).toBe(1_700_000_950_000);
  });

  it('follows the host across a handoff', () => {
    const doc = seedDoc();
    handoffHost(doc, 'p-host', 'p-bob', BOTH_ONLINE);

    expect(endSession(doc, 'p-host', FIXED)).toEqual({ applied: false, reason: 'not-host' });
    expect(endSession(doc, 'p-bob', FIXED)).toEqual({ applied: true, at: 1_700_000_900_000 });
  });

  it('defaults to Date.now when no clock is supplied', () => {
    const doc = seedDoc();
    const before = Date.now();
    const result = endSession(doc, 'p-host');
    const after = Date.now();

    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error('unreachable');
    expect(result.at).toBeGreaterThanOrEqual(before);
    expect(result.at).toBeLessThanOrEqual(after);
  });
});

// Departed participants (ADR-0036 tombstones)
//
// `projectDoc` keeps departed participants in `participants` — the record
// survives so past rounds can still resolve a name — so every command here
// can still find one. These tests pin what that means today rather than
// asserting a departure gate: #507 asked for no such rule, and the raw
// writers behaved this way before the commands existed. The `kick` case is
// the one with teeth, and is called out as a follow-up candidate.

describe('commands against a departed participant', () => {
  it('rename still applies — the record outlives the departure', () => {
    const doc = seedDoc();
    leave(doc, 'p-bob', FIXED);

    expect(rename(doc, 'p-bob', 'Robert')).toEqual({ applied: true });
    expect(participant(doc, 'p-bob').displayName).toBe('Robert');
    // Departure is untouched by the rename.
    expect(participant(doc, 'p-bob').leftAt).toBe(1_700_000_900_000);
  });

  it('recolor and toggleRole still apply, leaving leftAt intact', () => {
    const doc = seedDoc();
    leave(doc, 'p-bob', FIXED);

    expect(recolor(doc, 'p-bob', 'green')).toEqual({ applied: true });
    expect(toggleRole(doc, 'p-bob')).toEqual({ applied: true });

    const bob = participant(doc, 'p-bob');
    expect(bob.avatarColor).toBe('green');
    expect(participantRole(bob)).toBe('viewer');
    expect(isActiveParticipant(bob)).toBe(false);
  });

  it('kick reports applied for an already-departed target and rewrites removedBy', () => {
    const doc = seedDoc();
    leave(doc, 'p-bob', FIXED);
    expect(participant(doc, 'p-bob').removedBy).toBe('p-bob');

    // Known wart, inherited from the raw writer and deliberately left as-is by
    // #507: kicking someone who already left succeeds and recasts their own
    // exit as a host removal in the ADR-0036 record. Pinned here so a future
    // departure gate is a visible, intentional change to this assertion.
    expect(kick(doc, 'p-host', 'p-bob', () => 1_700_000_950_000)).toEqual({
      applied: true,
      at: 1_700_000_950_000,
    });
    expect(participant(doc, 'p-bob').removedBy).toBe('p-host');
  });

  it('handoffHost still refuses a departed target that is offline', () => {
    const doc = seedDoc();
    leave(doc, 'p-bob', FIXED);

    expect(handoffHost(doc, 'p-host', 'p-bob', new Set(['p-host']))).toEqual({
      applied: false,
      reason: 'not-online',
    });
  });
});
