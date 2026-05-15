// Exercises: round-edit.helpers:buildRoundEditSubmission

import { describe, expect, it } from 'vitest';
import { buildRoundEditSubmission } from './round-edit.helpers';

describe('buildRoundEditSubmission — empty title guard', () => {
  it('returns null for empty string title', () => {
    expect(buildRoundEditSubmission('', 'some notes')).toBeNull();
  });

  it('returns null for whitespace-only title', () => {
    expect(buildRoundEditSubmission('   ', 'some notes')).toBeNull();
  });

  it('returns null for tab-only title', () => {
    expect(buildRoundEditSubmission('\t', '')).toBeNull();
  });
});

describe('buildRoundEditSubmission — title trimming', () => {
  it('trims leading and trailing whitespace from title', () => {
    const result = buildRoundEditSubmission('  Login redesign  ', '');
    expect(result?.title).toBe('Login redesign');
  });

  it('preserves internal whitespace in title', () => {
    const result = buildRoundEditSubmission('  Login  redesign  ', '');
    expect(result?.title).toBe('Login  redesign');
  });
});

describe('buildRoundEditSubmission — description null-coercion', () => {
  it('description is null when desc field is empty string', () => {
    expect(buildRoundEditSubmission('Login', '')).toMatchObject({ description: null });
  });

  it('description is null when desc field is whitespace-only', () => {
    expect(buildRoundEditSubmission('Login', '   ')).toMatchObject({ description: null });
  });

  it('description is trimmed non-empty string when provided', () => {
    const result = buildRoundEditSubmission('Login', '  Some notes  ');
    expect(result?.description).toBe('Some notes');
  });

  it('description retains internal whitespace', () => {
    const result = buildRoundEditSubmission('Login', 'line one\nline two');
    expect(result?.description).toBe('line one\nline two');
  });
});

describe('buildRoundEditSubmission — combined output', () => {
  it('produces correct submission for typical input', () => {
    expect(buildRoundEditSubmission(' Auth flow ', ' Add login screen ')).toEqual({
      title: 'Auth flow',
      description: 'Add login screen',
    });
  });

  it('description is null in the submission object when empty', () => {
    expect(buildRoundEditSubmission('Auth flow', '')).toEqual({
      title: 'Auth flow',
      description: null,
    });
  });
});
