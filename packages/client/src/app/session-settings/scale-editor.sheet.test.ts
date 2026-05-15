// Exercises: scale-editor.helpers:computeCardRows

import { describe, expect, it } from 'vitest';
import { computeCardRows } from './scale-editor.helpers';

describe('computeCardRows — unknown scaleId', () => {
  it('returns empty array for an unknown scale ID', () => {
    expect(computeCardRows('does-not-exist', [])).toEqual([]);
  });
});

describe('computeCardRows — no overrides', () => {
  it('fibonacci: all 8 cards enabled, none have disableToggle', () => {
    const rows = computeCardRows('fibonacci', []);
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.enabled)).toBe(true);
    expect(rows.every((r) => !r.disableToggle)).toBe(true);
  });

  it('t-shirt: all 5 cards enabled', () => {
    const rows = computeCardRows('t-shirt', []);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.enabled)).toBe(true);
  });

  it('rows carry correct face values in order', () => {
    const rows = computeCardRows('fibonacci', []);
    expect(rows.map((r) => r.face)).toEqual(['0', '1', '2', '3', '5', '8', '13', '21']);
  });

  it('rows carry zero-based sequential indexes', () => {
    const rows = computeCardRows('fibonacci', []);
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('computeCardRows — one card disabled', () => {
  it('disabled card has enabled=false and disableToggle=false', () => {
    const rows = computeCardRows('fibonacci', [0]); // disable '0'
    expect(rows[0]!.enabled).toBe(false);
    expect(rows[0]!.disableToggle).toBe(false);
  });

  it('remaining enabled cards do NOT have disableToggle when >1 enabled remain', () => {
    const rows = computeCardRows('fibonacci', [0]);
    const enabledRows = rows.filter((r) => r.enabled);
    expect(enabledRows.length).toBe(7);
    expect(enabledRows.every((r) => !r.disableToggle)).toBe(true);
  });
});

describe('computeCardRows — last remaining enabled card is locked', () => {
  const allButLast = [0, 1, 2, 3, 4, 5, 6];

  it('last enabled card has disableToggle=true', () => {
    const rows = computeCardRows('fibonacci', allButLast);
    const lastCard = rows[7]!;
    expect(lastCard.enabled).toBe(true);
    expect(lastCard.disableToggle).toBe(true);
  });

  it('disabled cards do NOT get disableToggle even when only one enabled remains', () => {
    const rows = computeCardRows('fibonacci', allButLast);
    const disabledRows = rows.filter((r) => !r.enabled);
    expect(disabledRows.every((r) => !r.disableToggle)).toBe(true);
  });

  it('exactly one card has disableToggle=true', () => {
    const rows = computeCardRows('fibonacci', allButLast);
    const locked = rows.filter((r) => r.disableToggle);
    expect(locked).toHaveLength(1);
    expect(locked[0]!.face).toBe('21');
  });
});

describe('computeCardRows — two cards remaining', () => {
  it('neither card has disableToggle when exactly two are enabled', () => {
    const rows = computeCardRows('fibonacci', [0, 1, 2, 3, 4, 5]);
    const enabledRows = rows.filter((r) => r.enabled);
    expect(enabledRows).toHaveLength(2);
    expect(enabledRows.every((r) => !r.disableToggle)).toBe(true);
  });
});
