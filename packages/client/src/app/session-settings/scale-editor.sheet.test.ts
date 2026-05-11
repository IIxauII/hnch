/**
 * Unit tests for ScaleEditorSheetComponent cardRows computed logic.
 *
 * No TestBed, no Ionic rendering — pure predicate tests.
 * The cardRows logic is re-stated inline; key invariant under test:
 *   the last remaining enabled card must have disableToggle=true
 *   so the user cannot create an empty scale.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_SCALES } from '@hnch/shared';

// ---------------------------------------------------------------------------
// Inline simulation of ScaleEditorSheetComponent.cardRows computed
// ---------------------------------------------------------------------------

interface CardRow {
  index: number;
  face: string;
  enabled: boolean;
  disableToggle: boolean;
}

function computeCardRows(scaleId: string, overrides: Record<string, number[]>): CardRow[] {
  const builtin = BUILTIN_SCALES[scaleId];
  if (!builtin) return [];

  const disabled = overrides[scaleId] ?? [];
  const enabledCount = builtin.cards.length - disabled.length;

  return builtin.cards.map((face, index) => {
    const enabled = !disabled.includes(index);
    return {
      index,
      face,
      enabled,
      disableToggle: enabled && enabledCount === 1,
    };
  });
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('computeCardRows — unknown scaleId', () => {
  it('returns empty array for an unknown scale ID', () => {
    expect(computeCardRows('does-not-exist', {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// No overrides: all cards enabled, none locked
// ---------------------------------------------------------------------------

describe('computeCardRows — no overrides', () => {
  it('fibonacci: all 8 cards enabled, none have disableToggle', () => {
    const rows = computeCardRows('fibonacci', {});
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.enabled)).toBe(true);
    expect(rows.every((r) => !r.disableToggle)).toBe(true);
  });

  it('t-shirt: all 5 cards enabled', () => {
    const rows = computeCardRows('t-shirt', {});
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.enabled)).toBe(true);
  });

  it('rows carry correct face values in order', () => {
    const rows = computeCardRows('fibonacci', {});
    expect(rows.map((r) => r.face)).toEqual(['0', '1', '2', '3', '5', '8', '13', '21']);
  });

  it('rows carry zero-based sequential indexes', () => {
    const rows = computeCardRows('fibonacci', {});
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

// ---------------------------------------------------------------------------
// One card disabled: multiple enabled → no lock
// ---------------------------------------------------------------------------

describe('computeCardRows — one card disabled', () => {
  it('disabled card has enabled=false and disableToggle=false', () => {
    const rows = computeCardRows('fibonacci', { fibonacci: [0] }); // disable '0'
    expect(rows[0]!.enabled).toBe(false);
    expect(rows[0]!.disableToggle).toBe(false);
  });

  it('remaining enabled cards do NOT have disableToggle when >1 enabled remain', () => {
    const rows = computeCardRows('fibonacci', { fibonacci: [0] });
    const enabledRows = rows.filter((r) => r.enabled);
    expect(enabledRows.length).toBe(7);
    expect(enabledRows.every((r) => !r.disableToggle)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Last enabled card: disableToggle=true
// ---------------------------------------------------------------------------

describe('computeCardRows — last remaining enabled card is locked', () => {
  // Disable all fibonacci cards except index 7 ('21')
  const allButLast = [0, 1, 2, 3, 4, 5, 6];

  it('last enabled card has disableToggle=true', () => {
    const rows = computeCardRows('fibonacci', { fibonacci: allButLast });
    const lastCard = rows[7]!;
    expect(lastCard.enabled).toBe(true);
    expect(lastCard.disableToggle).toBe(true);
  });

  it('disabled cards do NOT get disableToggle even when only one enabled remains', () => {
    const rows = computeCardRows('fibonacci', { fibonacci: allButLast });
    const disabledRows = rows.filter((r) => !r.enabled);
    expect(disabledRows.every((r) => !r.disableToggle)).toBe(true);
  });

  it('exactly one card has disableToggle=true', () => {
    const rows = computeCardRows('fibonacci', { fibonacci: allButLast });
    const locked = rows.filter((r) => r.disableToggle);
    expect(locked).toHaveLength(1);
    expect(locked[0]!.face).toBe('21');
  });
});

// ---------------------------------------------------------------------------
// Two cards remaining: neither is locked
// ---------------------------------------------------------------------------

describe('computeCardRows — two cards remaining', () => {
  it('neither card has disableToggle when exactly two are enabled', () => {
    // Disable indices 0-5 of fibonacci, leaving '13' (6) and '21' (7)
    const rows = computeCardRows('fibonacci', { fibonacci: [0, 1, 2, 3, 4, 5] });
    const enabledRows = rows.filter((r) => r.enabled);
    expect(enabledRows).toHaveLength(2);
    expect(enabledRows.every((r) => !r.disableToggle)).toBe(true);
  });
});
