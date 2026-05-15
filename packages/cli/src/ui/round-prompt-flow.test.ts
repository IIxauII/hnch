import { describe, expect, it } from 'vitest';
import { buildNewRoundArgs, normalizeRoundPromptValue } from './round-prompt-flow.js';

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
    expect(buildNewRoundArgs('Auth', 'PROJ-42')).toEqual(['Auth', 'PROJ-42']);
  });

  it('drops blank ticketId (treats as undefined)', () => {
    expect(buildNewRoundArgs('Auth', '')).toEqual(['Auth', undefined]);
    expect(buildNewRoundArgs('Auth', '   ')).toEqual(['Auth', undefined]);
  });

  it('forwards undefined title (skipped step 1)', () => {
    expect(buildNewRoundArgs(undefined, 'PROJ-42')).toEqual([undefined, 'PROJ-42']);
  });

  it('emits both undefined when both prompts skipped', () => {
    expect(buildNewRoundArgs(undefined, '')).toEqual([undefined, undefined]);
  });

  it('trims ticketId surrounding whitespace', () => {
    expect(buildNewRoundArgs('Auth', '  PROJ-1  ')).toEqual(['Auth', 'PROJ-1']);
  });
});
