import { describe, expect, it } from 'vitest';
import { FIBONACCI_SCALE, type Round } from './doc.js';
import { resolveRoundLineage } from './lineage.js';

function makeRound(id: string, parentRoundId?: string): Round {
  return {
    id,
    parentRoundId,
    scale: FIBONACCI_SCALE,
    createdBy: 'p1',
    createdAt: 0,
    votes: {},
    status: 'voting',
  };
}

describe('resolveRoundLineage', () => {
  it('returns null for a round with no parent and no children', () => {
    const r1 = makeRound('r1');
    expect(resolveRoundLineage('r1', [r1])).toBeNull();
  });

  it('returns null for the chain root even when it has children', () => {
    const r1 = makeRound('r1');
    const r2 = makeRound('r2', 'r1');
    expect(resolveRoundLineage('r1', [r1, r2])).toBeNull();
  });

  it('depth-2 leaf → { depth: 2, total: 2 }', () => {
    const r1 = makeRound('r1');
    const r2 = makeRound('r2', 'r1');
    const lineage = resolveRoundLineage('r2', [r1, r2]);
    expect(lineage).not.toBeNull();
    expect(lineage?.depth).toBe(2);
    expect(lineage?.total).toBe(2);
    expect(lineage?.chainRoot.id).toBe('r1');
  });

  it('depth-3 middle round → { depth: 2, total: 3 }', () => {
    const r1 = makeRound('r1');
    const r2 = makeRound('r2', 'r1');
    const r3 = makeRound('r3', 'r2');
    const lineage = resolveRoundLineage('r2', [r1, r2, r3]);
    expect(lineage?.depth).toBe(2);
    expect(lineage?.total).toBe(3);
    expect(lineage?.chainRoot.id).toBe('r1');
  });

  it('depth-3 leaf → { depth: 3, total: 3 }', () => {
    const r1 = makeRound('r1');
    const r2 = makeRound('r2', 'r1');
    const r3 = makeRound('r3', 'r2');
    const lineage = resolveRoundLineage('r3', [r1, r2, r3]);
    expect(lineage?.depth).toBe(3);
    expect(lineage?.total).toBe(3);
    expect(lineage?.chainRoot.id).toBe('r1');
  });

  it('missing parent ref → null', () => {
    const orphan = makeRound('r2', 'missing-root');
    expect(resolveRoundLineage('r2', [orphan])).toBeNull();
  });

  it('self-cycle → null', () => {
    const r1: Round = { ...makeRound('r1'), parentRoundId: 'r1' };
    expect(resolveRoundLineage('r1', [r1])).toBeNull();
  });

  it('two-node cycle → null', () => {
    const a: Round = { ...makeRound('a'), parentRoundId: 'b' };
    const b: Round = { ...makeRound('b'), parentRoundId: 'a' };
    expect(resolveRoundLineage('a', [a, b])).toBeNull();
  });

  it('branched lineage counts all descendants of root', () => {
    // r1 → r2 → r3
    //   ↘ r4
    const r1 = makeRound('r1');
    const r2 = makeRound('r2', 'r1');
    const r3 = makeRound('r3', 'r2');
    const r4 = makeRound('r4', 'r1');
    const lineage = resolveRoundLineage('r3', [r1, r2, r3, r4]);
    expect(lineage?.depth).toBe(3);
    expect(lineage?.total).toBe(4);
    expect(lineage?.chainRoot.id).toBe('r1');
  });

  it('unknown round id → null', () => {
    const r1 = makeRound('r1');
    expect(resolveRoundLineage('nope', [r1])).toBeNull();
  });

  it('rounds array order does not matter', () => {
    const r1 = makeRound('r1');
    const r2 = makeRound('r2', 'r1');
    const r3 = makeRound('r3', 'r2');
    const lineage = resolveRoundLineage('r3', [r3, r1, r2]);
    expect(lineage?.depth).toBe(3);
    expect(lineage?.total).toBe(3);
  });
});
