/**
 * Agenda command tests — the single seam where every agenda gate, clock stamp
 * and refusal reason is asserted (#507).
 *
 * Structured after `round-commands.test.ts` / `vote-commands.test.ts`: assert
 * what a caller can observe (the returned result and the resulting doc state),
 * never which writer was called or in what order. Consumer tests in the client
 * and CLI prove wiring only — the rules are pinned here.
 */

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  addItem,
  cancelItem,
  editItem,
  moveItem,
  skipItem,
  type AgendaResult,
} from './agenda-commands.js';
import { FIBONACCI_SCALE } from './doc.js';
import { initDoc, projectDoc, setAgendaItemState } from './doc-projection.js';

// Fixtures

const FIXED = () => 1_700_000_900_000;

function seedDoc(): Y.Doc {
  const doc = new Y.Doc();
  initDoc(doc, {
    roomUuid: 'room-uuid-1',
    createdAt: 1_700_000_000_000,
    participantId: 'p-host',
    displayName: 'Alice',
    defaultScale: FIBONACCI_SCALE,
  });
  return doc;
}

/** Add an item and hand back its id — every refusal test needs one first. */
function seedItem(doc: Y.Doc, title = 'Login form'): string {
  const result = addItem(doc, { title }, FIXED);
  if (!result.applied) throw new Error(`seedItem: unexpected refusal ${result.reason}`);
  return result.id;
}

function itemState(doc: Y.Doc, id: string): string | undefined {
  return projectDoc(doc).agenda.find((i) => i.id === id)?.state;
}

/** `applied: true` narrowing that also fails the test on refusal. */
function expectApplied(result: AgendaResult): Extract<AgendaResult, { applied: true }> {
  expect(result.applied).toBe(true);
  if (!result.applied) throw new Error('unreachable');
  return result;
}

// addItem

describe('addItem', () => {
  it('appends a pending item, stamping createdAt from the injected clock', () => {
    const doc = seedDoc();
    const result = expectApplied(addItem(doc, { title: 'Login form' }, FIXED));

    expect(result.at).toBe(1_700_000_900_000);
    const item = projectDoc(doc).agenda.find((i) => i.id === result.id)!;
    expect(item).toMatchObject({
      title: 'Login form',
      state: 'pending',
      source: 'manual',
      createdAt: 1_700_000_900_000,
    });
  });

  it('carries description, ticketId, source and externalId through to the doc', () => {
    const doc = seedDoc();
    const result = expectApplied(
      addItem(
        doc,
        {
          title: 'Login form',
          description: 'The whole flow',
          ticketId: 'PROJ-1',
          source: 'jira',
          externalId: 'JIRA-1',
        },
        FIXED,
      ),
    );

    expect(projectDoc(doc).agenda.find((i) => i.id === result.id)).toMatchObject({
      description: 'The whole flow',
      ticketId: 'PROJ-1',
      source: 'jira',
      externalId: 'JIRA-1',
    });
  });

  it('accepts a ticketId with no title', () => {
    const doc = seedDoc();
    expectApplied(addItem(doc, { ticketId: 'PROJ-1' }, FIXED));
    expect(projectDoc(doc).agenda).toHaveLength(1);
  });

  it('refuses with invalid-fields when neither title nor ticketId carries text', () => {
    const doc = seedDoc();
    expect(addItem(doc, { title: '   ', ticketId: '' }, FIXED)).toEqual({
      applied: false,
      reason: 'invalid-fields',
    });
    expect(projectDoc(doc).agenda).toHaveLength(0);
  });

  it('refuses with invalid-fields on an empty init', () => {
    const doc = seedDoc();
    expect(addItem(doc, {}, FIXED)).toEqual({ applied: false, reason: 'invalid-fields' });
    expect(projectDoc(doc).agenda).toHaveLength(0);
  });
});

// editItem

describe('editItem', () => {
  it('patches title, ticketId and description on a pending item', () => {
    const doc = seedDoc();
    const id = seedItem(doc);

    expect(
      editItem(doc, id, { title: 'Signup form', ticketId: 'PROJ-2', description: 'd' }),
    ).toEqual({ applied: true, id });
    expect(projectDoc(doc).agenda[0]).toMatchObject({
      title: 'Signup form',
      ticketId: 'PROJ-2',
      description: 'd',
    });
  });

  it('leaves fields the patch omits untouched', () => {
    const doc = seedDoc();
    const id = seedItem(doc);
    expectApplied(editItem(doc, id, { ticketId: 'PROJ-2' }));

    expect(projectDoc(doc).agenda[0]).toMatchObject({ title: 'Login form', ticketId: 'PROJ-2' });
  });

  it('stamps no timestamp', () => {
    const doc = seedDoc();
    const id = seedItem(doc);
    expect(expectApplied(editItem(doc, id, { title: 'Signup form' })).at).toBeUndefined();
  });

  it('refuses with not-found for an unknown id', () => {
    const doc = seedDoc();
    expect(editItem(doc, 'no-such-item', { title: 'X' })).toEqual({
      applied: false,
      reason: 'not-found',
    });
  });

  it('refuses with not-pending when a peer cancelled the item first', () => {
    const doc = seedDoc();
    const id = seedItem(doc);
    expectApplied(cancelItem(doc, id));

    expect(editItem(doc, id, { title: 'Signup form' })).toEqual({
      applied: false,
      reason: 'not-pending',
    });
    expect(projectDoc(doc).agenda[0]!.title).toBe('Login form');
  });

  it('refuses with not-pending when a peer skipped the item first', () => {
    const doc = seedDoc();
    const id = seedItem(doc);
    expectApplied(skipItem(doc, id));

    expect(editItem(doc, id, { title: 'Signup form' })).toEqual({
      applied: false,
      reason: 'not-pending',
    });
  });

  it('still edits a consumed item — only skipped and cancelled are frozen', () => {
    const doc = seedDoc();
    const id = seedItem(doc);
    setAgendaItemState(doc, id, 'consumed', { consumedByRoundId: 'r1', timestamp: 1 });

    expectApplied(editItem(doc, id, { title: 'Signup form' }));
    expect(projectDoc(doc).agenda[0]!.title).toBe('Signup form');
  });

  it('refuses with invalid-fields when the patch would empty both identifying fields', () => {
    const doc = seedDoc();
    const id = seedItem(doc);

    expect(editItem(doc, id, { title: '' })).toEqual({
      applied: false,
      reason: 'invalid-fields',
    });
    expect(projectDoc(doc).agenda[0]!.title).toBe('Login form');
  });

  it('allows emptying the title when the patch supplies a ticketId', () => {
    const doc = seedDoc();
    const id = seedItem(doc);

    expectApplied(editItem(doc, id, { title: '', ticketId: 'PROJ-2' }));
    expect(projectDoc(doc).agenda[0]).toMatchObject({ title: '', ticketId: 'PROJ-2' });
  });
});

// skipItem / cancelItem

describe('skipItem', () => {
  it('moves a pending item to skipped and stamps no timestamp', () => {
    const doc = seedDoc();
    const id = seedItem(doc);

    expect(skipItem(doc, id)).toEqual({ applied: true, id });
    expect(itemState(doc, id)).toBe('skipped');
    expect(projectDoc(doc).agenda[0]!.consumedAt).toBeUndefined();
  });

  it('refuses with not-found for an unknown id', () => {
    const doc = seedDoc();
    expect(skipItem(doc, 'no-such-item')).toEqual({ applied: false, reason: 'not-found' });
  });

  it('refuses with not-pending when the item is already skipped', () => {
    const doc = seedDoc();
    const id = seedItem(doc);
    expectApplied(skipItem(doc, id));

    expect(skipItem(doc, id)).toEqual({ applied: false, reason: 'not-pending' });
  });

  it('refuses with not-pending when the item was consumed at round terminal', () => {
    const doc = seedDoc();
    const id = seedItem(doc);
    setAgendaItemState(doc, id, 'consumed', { consumedByRoundId: 'r1', timestamp: 1 });

    expect(skipItem(doc, id)).toEqual({ applied: false, reason: 'not-pending' });
    expect(itemState(doc, id)).toBe('consumed');
  });
});

describe('cancelItem', () => {
  it('moves a pending item to cancelled and stamps no timestamp', () => {
    const doc = seedDoc();
    const id = seedItem(doc);

    expect(cancelItem(doc, id)).toEqual({ applied: true, id });
    expect(itemState(doc, id)).toBe('cancelled');
  });

  it('refuses with not-found for an unknown id', () => {
    const doc = seedDoc();
    expect(cancelItem(doc, 'no-such-item')).toEqual({ applied: false, reason: 'not-found' });
  });

  it('refuses with not-pending when a peer skipped the item first', () => {
    const doc = seedDoc();
    const id = seedItem(doc);
    expectApplied(skipItem(doc, id));

    expect(cancelItem(doc, id)).toEqual({ applied: false, reason: 'not-pending' });
    expect(itemState(doc, id)).toBe('skipped');
  });
});

// moveItem

describe('moveItem', () => {
  it('reorders a pending item and stamps no timestamp', () => {
    const doc = seedDoc();
    const idA = seedItem(doc, 'A');
    const idB = seedItem(doc, 'B');
    const aKey = projectDoc(doc).agenda.find((i) => i.id === idA)!.sortKey;

    const result = expectApplied(moveItem(doc, idB, null, aKey));
    expect(result).toEqual({ applied: true, id: idB });
    expect(projectDoc(doc).agenda.map((i) => i.id)).toEqual([idB, idA]);
  });

  it('treats undefined bounds as the list boundaries', () => {
    const doc = seedDoc();
    const idA = seedItem(doc, 'A');
    const idB = seedItem(doc, 'B');
    const bKey = projectDoc(doc).agenda.find((i) => i.id === idB)!.sortKey;

    expectApplied(moveItem(doc, idA, bKey, undefined));
    expect(projectDoc(doc).agenda.map((i) => i.id)).toEqual([idB, idA]);
  });

  it('refuses with not-found for an unknown id', () => {
    const doc = seedDoc();
    expect(moveItem(doc, 'no-such-item')).toEqual({ applied: false, reason: 'not-found' });
  });

  it('refuses quietly with not-pending when a peer cancelled the item mid-drag', () => {
    const doc = seedDoc();
    const idA = seedItem(doc, 'A');
    const idB = seedItem(doc, 'B');
    const aKey = projectDoc(doc).agenda.find((i) => i.id === idA)!.sortKey;
    expectApplied(cancelItem(doc, idB));

    expect(moveItem(doc, idB, null, aKey)).toEqual({ applied: false, reason: 'not-pending' });
  });
});

// Clock determinism

describe('injected clock', () => {
  it('addItem uses the injected clock rather than the ambient one', () => {
    const doc = seedDoc();
    const stamps = [111, 222];
    const clock = (): number => stamps.shift()!;

    const first = expectApplied(addItem(doc, { title: 'A' }, clock));
    const second = expectApplied(addItem(doc, { title: 'B' }, clock));

    expect(first.at).toBe(111);
    expect(second.at).toBe(222);
    expect(projectDoc(doc).agenda.map((i) => i.createdAt)).toEqual([111, 222]);
  });

  it('addItem defaults to Date.now when no clock is supplied', () => {
    const doc = seedDoc();
    const before = Date.now();
    const result = expectApplied(addItem(doc, { title: 'A' }));
    const after = Date.now();

    expect(result.at).toBeGreaterThanOrEqual(before);
    expect(result.at).toBeLessThanOrEqual(after);
  });
});
