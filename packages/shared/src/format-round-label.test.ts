// Exercises: format-round-label:formatRoundLabel

import { describe, expect, it } from 'vitest';
import { formatRoundLabel } from './format-round-label.js';

describe('formatRoundLabel', () => {
  it('returns "ticketId · title" when both are set', () => {
    expect(formatRoundLabel({ ticketId: 'PROJ-42', title: 'Auth migration' })).toBe(
      'PROJ-42 · Auth migration',
    );
  });

  it('returns ticketId alone when title is missing', () => {
    expect(formatRoundLabel({ ticketId: 'PROJ-42' })).toBe('PROJ-42');
  });

  it('returns title alone when ticketId is missing', () => {
    expect(formatRoundLabel({ title: 'Auth migration' })).toBe('Auth migration');
  });

  it('returns null when neither is set', () => {
    expect(formatRoundLabel({})).toBeNull();
  });

  it('treats whitespace-only fields as missing', () => {
    expect(formatRoundLabel({ ticketId: '   ', title: '   ' })).toBeNull();
    expect(formatRoundLabel({ ticketId: '   ', title: 'Auth' })).toBe('Auth');
    expect(formatRoundLabel({ ticketId: 'PROJ-42', title: '   ' })).toBe('PROJ-42');
  });

  it('trims surrounding whitespace from each field independently', () => {
    expect(formatRoundLabel({ ticketId: '  PROJ-42  ', title: '  Auth  ' })).toBe('PROJ-42 · Auth');
  });

  it('handles URL-form ticketId verbatim (no linkification in label form)', () => {
    expect(formatRoundLabel({ ticketId: 'https://example.com/PROJ-1', title: 'Auth' })).toBe(
      'https://example.com/PROJ-1 · Auth',
    );
  });
});
