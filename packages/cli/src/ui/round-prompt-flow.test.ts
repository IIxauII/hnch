import { describe, expect, it } from 'vitest';
import {
  buildNewRoundArgs,
  buildRoundPreFill,
  normalizeRoundPromptValue,
} from './round-prompt-flow.js';
import type { AgendaItem } from '@hnch/shared';

function makeAgendaItem(overrides: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id: 'item-1',
    state: 'pending',
    source: 'manual',
    sortKey: 'a0',
    createdAt: 0,
    ...overrides,
  };
}

describe('normalizeRoundPromptValue', () => {
  it('returns undefined for empty string', () => {
    expect(normalizeRoundPromptValue('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only', () => {
    expect(normalizeRoundPromptValue('   ')).toBeUndefined();
    expect(normalizeRoundPromptValue('\t')).toBeUndefined();
  });

  it('trims surrounding whitespace from a populated value', () => {
    expect(normalizeRoundPromptValue('  PROJ-42  ')).toBe('PROJ-42');
  });

  it('preserves internal whitespace', () => {
    expect(normalizeRoundPromptValue('Auth migration')).toBe('Auth migration');
  });
});

describe('buildNewRoundArgs', () => {
  it('forwards both fields when set', () => {
    expect(buildNewRoundArgs('Auth', 'PROJ-42')).toEqual(['Auth', 'PROJ-42', undefined]);
  });

  it('drops blank ticketId (treats as undefined)', () => {
    expect(buildNewRoundArgs('Auth', '')).toEqual(['Auth', undefined, undefined]);
    expect(buildNewRoundArgs('Auth', '   ')).toEqual(['Auth', undefined, undefined]);
  });

  it('forwards undefined title (skipped step 1)', () => {
    expect(buildNewRoundArgs(undefined, 'PROJ-42')).toEqual([undefined, 'PROJ-42', undefined]);
  });

  it('emits both undefined when both prompts skipped', () => {
    expect(buildNewRoundArgs(undefined, '')).toEqual([undefined, undefined, undefined]);
  });

  it('trims ticketId surrounding whitespace', () => {
    expect(buildNewRoundArgs('Auth', '  PROJ-1  ')).toEqual(['Auth', 'PROJ-1', undefined]);
  });

  it('forwards agendaItemId when provided', () => {
    expect(buildNewRoundArgs('Auth', 'PROJ-1', 'item-abc')).toEqual(['Auth', 'PROJ-1', 'item-abc']);
  });

  it('passes agendaItemId through even when title+ticket undefined', () => {
    expect(buildNewRoundArgs(undefined, '', 'item-xyz')).toEqual([
      undefined,
      undefined,
      'item-xyz',
    ]);
  });
});

describe('buildRoundPreFill', () => {
  it('returns empty strings and no agendaItemId when null', () => {
    expect(buildRoundPreFill(null)).toEqual({
      title: '',
      ticketId: '',
      agendaItemId: undefined,
    });
  });

  it('returns title/ticketId/agendaItemId from pending item', () => {
    const item = makeAgendaItem({ title: 'My Story', ticketId: 'PROJ-42', id: 'item-1' });
    expect(buildRoundPreFill(item)).toEqual({
      title: 'My Story',
      ticketId: 'PROJ-42',
      agendaItemId: 'item-1',
    });
  });

  it('returns empty title when item has only ticketId', () => {
    const item = makeAgendaItem({ ticketId: 'PROJ-5', id: 'item-2' });
    const result = buildRoundPreFill(item);
    expect(result.title).toBe('');
    expect(result.ticketId).toBe('PROJ-5');
    expect(result.agendaItemId).toBe('item-2');
  });

  it('returns empty ticketId when item has only title', () => {
    const item = makeAgendaItem({ title: 'Feature X', id: 'item-3' });
    const result = buildRoundPreFill(item);
    expect(result.title).toBe('Feature X');
    expect(result.ticketId).toBe('');
    expect(result.agendaItemId).toBe('item-3');
  });
});
